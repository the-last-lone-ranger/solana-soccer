/**
 * Voice Chat Service using WebRTC
 * Handles peer-to-peer audio communication between players in a match
 */

export class VoiceChatService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isMuted: boolean = false;
  private isEnabled: boolean = false;
  private isPushToTalk: boolean = true; // Default to push-to-talk
  private isPushingToTalk: boolean = false; // Currently holding push-to-talk key
  private pushToTalkKey: string = 'v'; // Default key is 'v'
  private onRemoteStreamCallback?: (stream: MediaStream) => void;
  private onConnectionStateChangeCallback?: (state: RTCPeerConnectionState) => void;
  private onSpeakingStateChangeCallback?: (isSpeaking: boolean) => void;
  private localAudioMonitor: HTMLAudioElement | null = null; // For testing - allows hearing your own voice
  private enableLocalMonitor: boolean = false; // Enable local audio monitoring for testing
  private audioContext: AudioContext | null = null; // For audio level analysis
  private analyser: AnalyserNode | null = null; // For audio level analysis

  constructor() {
    // Initialize with STUN servers for NAT traversal
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle incoming remote stream
    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamCallback?.(this.remoteStream);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.onConnectionStateChangeCallback?.(this.peerConnection.connectionState);
      }
    };

    // Handle ICE candidate events
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // ICE candidates will be handled by the signaling mechanism
        // In a production app, you'd send these to the other peer via WebSocket
        console.log('ICE candidate:', event.candidate);
      }
    };
  }

  /**
   * Initialize voice chat by requesting microphone access
   */
  async initialize(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Add local audio tracks to peer connection
      if (this.peerConnection && this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          if (this.peerConnection) {
            this.peerConnection.addTrack(track, this.localStream!);
          }
        });
      }

      // Set up local audio monitor for testing (if enabled)
      this.setupLocalAudioMonitor();

      // Initialize audio level analyzer
      this.initializeAudioLevelAnalyzer();

      this.isEnabled = true;
      console.log('[VoiceChat] ✅ Initialized with', this.localStream.getAudioTracks().length, 'audio track(s)');
      this.localStream.getAudioTracks().forEach((track, index) => {
        console.log(`[VoiceChat] Track ${index}:`, {
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings(),
        });
      });
    } catch (error) {
      console.error('Error initializing voice chat:', error);
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  /**
   * Set up local audio monitor for testing (allows hearing your own voice)
   */
  private setupLocalAudioMonitor(): void {
    if (!this.localStream || !this.enableLocalMonitor) {
      return;
    }

    // Clean up existing monitor
    if (this.localAudioMonitor) {
      this.localAudioMonitor.pause();
      this.localAudioMonitor.srcObject = null;
      this.localAudioMonitor = null;
    }

    // Create new audio element for local monitoring
    this.localAudioMonitor = new Audio();
    this.localAudioMonitor.srcObject = this.localStream;
    this.localAudioMonitor.volume = 0.5; // Lower volume to prevent feedback
    this.localAudioMonitor.muted = false;

    // Try to play (may fail due to autoplay restrictions)
    this.localAudioMonitor.play().catch((err) => {
      console.warn('[VoiceChat] Could not start local audio monitor (autoplay restriction):', err);
    });

    console.log('[VoiceChat] 🔊 Local audio monitor enabled - you can hear yourself');
  }

  /**
   * Enable/disable local audio monitoring (for testing)
   */
  setLocalAudioMonitor(enabled: boolean): void {
    this.enableLocalMonitor = enabled;
    if (this.localStream) {
      this.setupLocalAudioMonitor();
    }
  }

  /**
   * Get local audio monitor state
   */
  getLocalAudioMonitor(): boolean {
    return this.enableLocalMonitor;
  }

  /**
   * Initialize audio level analyzer (call once)
   */
  private initializeAudioLevelAnalyzer(): void {
    if (!this.localStream || this.audioContext) {
      return;
    }

    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      const microphone = this.audioContext.createMediaStreamSource(this.localStream);
      
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      microphone.connect(this.analyser);
    } catch (error) {
      console.error('[VoiceChat] Error initializing audio level analyzer:', error);
    }
  }

  /**
   * Get audio level from local stream (for visualization)
   * Returns a value between 0 and 1
   */
  getAudioLevel(): number {
    if (!this.localStream || !this.analyser) {
      this.initializeAudioLevelAnalyzer();
      if (!this.analyser) {
        return 0;
      }
    }

    if (!this.analyser) {
      return 0;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length;
    const normalizedLevel = Math.min(average / 255, 1);

    return normalizedLevel;
  }

  /**
   * Create an offer for WebRTC connection
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Toggle mute/unmute
   */
  toggleMute(): boolean {
    if (!this.localStream) {
      return false;
    }

    this.isMuted = !this.isMuted;
    this.updateAudioTrackState();

    return this.isMuted;
  }

  /**
   * Set push-to-talk mode
   */
  setPushToTalk(enabled: boolean): void {
    this.isPushToTalk = enabled;
    this.updateAudioTrackState();
  }

  /**
   * Get push-to-talk mode
   */
  getPushToTalk(): boolean {
    return this.isPushToTalk;
  }

  /**
   * Set push-to-talk key
   */
  setPushToTalkKey(key: string): void {
    this.pushToTalkKey = key.toLowerCase();
  }

  /**
   * Get push-to-talk key
   */
  getPushToTalkKey(): string {
    return this.pushToTalkKey;
  }

  /**
   * Start push-to-talk (call when key is pressed)
   */
  startPushToTalk(): void {
    if (!this.isPushToTalk || this.isPushingToTalk) {
      return;
    }

    this.isPushingToTalk = true;
    this.updateAudioTrackState();
    this.onSpeakingStateChangeCallback?.(true);
  }

  /**
   * Stop push-to-talk (call when key is released)
   */
  stopPushToTalk(): void {
    if (!this.isPushToTalk || !this.isPushingToTalk) {
      return;
    }

    this.isPushingToTalk = false;
    this.updateAudioTrackState();
    this.onSpeakingStateChangeCallback?.(false);
  }

  /**
   * Check if currently speaking (push-to-talk active)
   */
  isSpeaking(): boolean {
    if (!this.isPushToTalk) {
      return !this.isMuted;
    }
    return this.isPushingToTalk && !this.isMuted;
  }

  /**
   * Update audio track enabled state based on mute and push-to-talk
   */
  private updateAudioTrackState(): void {
    if (!this.localStream) {
      return;
    }

    const shouldBeEnabled = !this.isMuted && (!this.isPushToTalk || this.isPushingToTalk);
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = shouldBeEnabled;
    });
  }

  /**
   * Set callback for speaking state changes
   */
  onSpeakingStateChange(callback: (isSpeaking: boolean) => void): void {
    this.onSpeakingStateChangeCallback = callback;
  }

  /**
   * Get mute state
   */
  getMuteState(): boolean {
    return this.isMuted;
  }

  /**
   * Get local audio stream (for UI display)
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get remote audio stream
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Set callback for remote stream
   */
  onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  /**
   * Set callback for connection state changes
   */
  onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChangeCallback = callback;
  }

  /**
   * Get connection state
   */
  getConnectionState(): RTCPeerConnectionState {
    return this.peerConnection?.connectionState || 'closed';
  }

  /**
   * Clean up and close connections
   */
  cleanup(): void {
    // Clean up local audio monitor
    if (this.localAudioMonitor) {
      this.localAudioMonitor.pause();
      this.localAudioMonitor.srcObject = null;
      this.localAudioMonitor = null;
    }

    // Clean up audio level analyzer
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isEnabled = false;
    this.isMuted = false;
  }
}

