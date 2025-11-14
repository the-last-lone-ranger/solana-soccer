import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SocketClient } from '../services/socketClient.js';
import { useWallet } from '../contexts/WalletContext.js';
import { motion, AnimatePresence } from 'framer-motion';
import './GlobalChat.css';

interface ChatMessage {
  id: string;
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  message: string;
  timestamp: Date;
}

interface ConnectedUser {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
}

interface GlobalChatProps {
  socketClient: SocketClient;
  apiClient?: any; // ApiClient type
}

export function GlobalChat({ socketClient, apiClient }: GlobalChatProps) {
  const { address } = useWallet();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username?: string; avatarUrl?: string }>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const listenersRegisteredRef = useRef(false);

  // Load user profile
  useEffect(() => {
    if (address && apiClient) {
      apiClient.getProfile().then((profile: any) => {
        setUserProfile({
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        });
      }).catch((err: any) => {
        console.error('Failed to load profile for chat:', err);
      });
    }
  }, [address, apiClient]);

  // Load recent chat messages on mount
  useEffect(() => {
    if (apiClient) {
      apiClient.getChatMessages(50).then((data) => {
        const loadedMessages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
          id: `db-${msg.id}`,
          walletAddress: msg.walletAddress,
          username: msg.username,
          avatarUrl: msg.avatarUrl,
          message: msg.message,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(loadedMessages);
        console.log('[GlobalChat] Loaded', loadedMessages.length, 'messages from database');
      }).catch((err: any) => {
        console.error('Failed to load chat messages:', err);
      });
    }
  }, [apiClient]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Escape key to close expanded chat
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isExpanded]);

  // Socket event listeners
  useEffect(() => {
    let lastUserListRequest = 0;
    const USER_LIST_REQUEST_INTERVAL = 5000; // Only request user list max once per 5 seconds

    // Clean up any existing listeners first
    if (listenersRegisteredRef.current) {
      socketClient.off('connect');
      socketClient.off('disconnect');
      socketClient.off('chat:message');
      socketClient.off('chat:userList');
      socketClient.off('chat:userJoined');
      socketClient.off('chat:userLeft');
    }

    const checkConnection = () => {
      const connected = socketClient.isConnected();
      setIsConnected(connected);
      
      // Request user list when connection is established (but throttle requests)
      if (connected) {
        const now = Date.now();
        if (now - lastUserListRequest > USER_LIST_REQUEST_INTERVAL) {
          lastUserListRequest = now;
          socketClient.emit('chat:getUserList');
        }
      }
    };

    // Check connection status periodically
    const connectionInterval = setInterval(checkConnection, 2000); // Check every 2 seconds instead of 1
    checkConnection();

    // Listen for socket connection events
    const handleConnect = () => {
      console.log('[GlobalChat] Socket connected, requesting user list');
      setIsConnected(true);
      lastUserListRequest = Date.now();
      socketClient.emit('chat:getUserList');
    };

    const handleDisconnect = () => {
      console.log('[GlobalChat] Socket disconnected');
      setIsConnected(false);
      setConnectedUsers([]);
    };

    // Listen for chat messages - deduplicate by walletAddress + message + timestamp
    const handleChatMessage = (data: { walletAddress: string; username?: string; avatarUrl?: string; message: string; timestamp: string }) => {
      if (!data.walletAddress || !data.message || !data.timestamp) return;
      
      const messageTimestamp = new Date(data.timestamp).getTime();
      const newMessage: ChatMessage = {
        id: `${data.walletAddress}-${messageTimestamp}-${data.message.slice(0, 20)}`,
        walletAddress: data.walletAddress,
        username: data.username,
        avatarUrl: data.avatarUrl,
        message: data.message,
        timestamp: new Date(data.timestamp),
      };
      
      setMessages((prev) => {
        // Check if this exact message already exists (same walletAddress, message, and timestamp)
        const exists = prev.find(
          msg => msg.walletAddress === data.walletAddress && 
                 msg.message === data.message && 
                 Math.abs(msg.timestamp.getTime() - messageTimestamp) < 1000 // Within 1 second
        );
        if (exists) {
          console.log('[GlobalChat] Duplicate message detected, ignoring:', data.message);
          return prev;
        }
        return [...prev, newMessage];
      });
    };

    // Listen for user list updates - deduplicate by walletAddress
    const handleUserList = (data: { users: ConnectedUser[] }) => {
      console.log('[GlobalChat] Received user list:', data.users.length, 'users');
      // Deduplicate users by walletAddress
      const uniqueUsers = new Map<string, ConnectedUser>();
      (data.users || []).forEach(user => {
        if (user.walletAddress && !uniqueUsers.has(user.walletAddress)) {
          uniqueUsers.set(user.walletAddress, user);
        }
      });
      setConnectedUsers(Array.from(uniqueUsers.values()));
    };

    // Listen for user joined - ensure no duplicates
    const handleUserJoined = (data: { walletAddress: string; username?: string; avatarUrl?: string }) => {
      console.log('[GlobalChat] User joined:', data.walletAddress);
      if (!data.walletAddress) return;
      
      setConnectedUsers((prev) => {
        // Check if user already exists
        const exists = prev.find(u => u.walletAddress === data.walletAddress);
        if (!exists) {
          return [...prev, { walletAddress: data.walletAddress, username: data.username, avatarUrl: data.avatarUrl }];
        }
        // Update existing user info if provided
        if (data.username || data.avatarUrl) {
          return prev.map(u => 
            u.walletAddress === data.walletAddress
              ? { ...u, username: data.username || u.username, avatarUrl: data.avatarUrl || u.avatarUrl }
              : u
          );
        }
        return prev;
      });
    };

    // Listen for user left
    const handleUserLeft = (data: { walletAddress: string }) => {
      console.log('[GlobalChat] User left:', data.walletAddress);
      if (!data.walletAddress) return;
      setConnectedUsers((prev) => prev.filter(u => u.walletAddress !== data.walletAddress));
    };

    // Register socket event listeners
    socketClient.on('connect', handleConnect);
    socketClient.on('disconnect', handleDisconnect);
    socketClient.on('chat:message', handleChatMessage);
    socketClient.on('chat:userList', handleUserList);
    socketClient.on('chat:userJoined', handleUserJoined);
    socketClient.on('chat:userLeft', handleUserLeft);

    // Request current user list if already connected
    if (socketClient.isConnected()) {
      socketClient.emit('chat:getUserList');
    }

    listenersRegisteredRef.current = true;

    return () => {
      listenersRegisteredRef.current = false;
      clearInterval(connectionInterval);
      socketClient.off('connect', handleConnect);
      socketClient.off('disconnect', handleDisconnect);
      socketClient.off('chat:message', handleChatMessage);
      socketClient.off('chat:userList', handleUserList);
      socketClient.off('chat:userJoined', handleUserJoined);
      socketClient.off('chat:userLeft', handleUserLeft);
    };
  }, [socketClient]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !address || !isConnected) return;

    const message = inputMessage.trim();
    socketClient.emit('chat:message', {
      message,
      username: userProfile.username,
      avatarUrl: userProfile.avatarUrl,
    });
    setInputMessage('');
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>
      <motion.div
        className={`global-chat ${isExpanded ? 'expanded' : ''}`}
        initial={false}
        animate={{
          scale: isExpanded ? 1 : 1,
          opacity: 1,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <div className="chat-header">
        <div className="chat-header-content">
          <span className="chat-icon">💬</span>
          <div>
            <h3 className="chat-title">Global Chat</h3>
            <p className="chat-subtitle">
              {connectedUsers.length} {connectedUsers.length === 1 ? 'user' : 'users'} online
            </p>
          </div>
        </div>
        <div className="chat-header-actions">
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <button
            className="chat-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse chat' : 'Expand chat'}
            aria-label={isExpanded ? 'Collapse chat' : 'Expand chat'}
          >
            <motion.svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </button>
        </div>
      </div>

      {/* Connected Users List */}
      {connectedUsers.length > 0 && (
        <div className="connected-users">
          <div className="users-label">Online Users</div>
          <div className="users-list">
            {connectedUsers.slice(0, 10).map((user) => (
              <div key={user.walletAddress} className="user-badge">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="user-avatar" />
                ) : (
                  <div className="user-avatar-placeholder">
                    {user.username?.[0]?.toUpperCase() || user.walletAddress[0]?.toUpperCase()}
                  </div>
                )}
                <span className="user-name">
                  {user.username || formatAddress(user.walletAddress)}
                </span>
              </div>
            ))}
            {connectedUsers.length > 10 && (
              <div className="user-badge more-users">
                +{connectedUsers.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <span className="empty-icon">💭</span>
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => {
              const isOwnMessage = msg.walletAddress === address;
              return (
                <motion.div
                  key={msg.id}
                  className={`chat-message ${isOwnMessage ? 'own' : ''}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="message-header">
                    <div className="message-author-section">
                      {msg.avatarUrl ? (
                        <img
                          src={msg.avatarUrl}
                          alt=""
                          className="message-avatar"
                          onClick={() => navigate(`/profile/${msg.walletAddress}`)}
                          title={`View ${msg.username || formatAddress(msg.walletAddress)}'s profile`}
                        />
                      ) : (
                        <div
                          className="message-avatar-placeholder"
                          onClick={() => navigate(`/profile/${msg.walletAddress}`)}
                          title={`View ${msg.username || formatAddress(msg.walletAddress)}'s profile`}
                        >
                          {msg.username?.[0]?.toUpperCase() || msg.walletAddress[0]?.toUpperCase()}
                        </div>
                      )}
                      <span
                        className="message-author"
                        onClick={() => navigate(`/profile/${msg.walletAddress}`)}
                        title={`View ${msg.username || formatAddress(msg.walletAddress)}'s profile`}
                      >
                        {msg.username || formatAddress(msg.walletAddress)}
                      </span>
                    </div>
                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="message-content">{msg.message}</div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="chat-input"
          placeholder={isConnected ? "Type a message..." : "Connecting..."}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={!isConnected || !address}
          maxLength={500}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!isConnected || !address || !inputMessage.trim()}
          title="Send message"
        >
          <span className="send-icon">➤</span>
        </button>
      </form>
      </motion.div>
    </>
  );
}

