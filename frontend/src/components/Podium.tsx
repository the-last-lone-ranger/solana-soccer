import { Box, Text } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";

interface PodiumPlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  color?: string;
  position: number;
}

interface PodiumProps {
  top3Players?: Array<PodiumPlayer>;
  winner?: {
    walletAddress: string;
    username?: string;
    color?: string;
  };
}

// Confetti particles for celebration
function Confetti({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [color] = useState(() => {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#FFA07A', '#98D8C8', '#FFB6C1', '#87CEEB'];
    return colors[Math.floor(Math.random() * colors.length)];
  });
  const velocity = useRef({
    x: (Math.random() - 0.5) * 0.02,
    y: Math.random() * 0.03 + 0.01,
    z: (Math.random() - 0.5) * 0.02,
    rotation: (Math.random() - 0.5) * 0.1
  });
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x += velocity.current.x;
      meshRef.current.position.y += velocity.current.y;
      meshRef.current.position.z += velocity.current.z;
      meshRef.current.rotation.x += velocity.current.rotation;
      meshRef.current.rotation.z += velocity.current.rotation;
      
      // Reset if fallen too far
      if (meshRef.current.position.y < -5) {
        meshRef.current.position.set(...position);
        velocity.current.y = Math.random() * 0.03 + 0.01;
      }
    }
  });
  
  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[0.1, 0.1]} />
      <meshStandardMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

// Celebration particles
function CelebrationParticles() {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    position: [
      (Math.random() - 0.5) * 10,
      Math.random() * 5 + 2,
      (Math.random() - 0.5) * 10
    ] as [number, number, number]
  }));
  
  return (
    <>
      {particles.map((p) => (
        <Confetti key={p.id} position={p.position} />
      ))}
    </>
  );
}

// Enhanced character for podium with animations
function Character({ 
  name, 
  avatarUrl,
  color = '#FF6B6B',
  position,
  'position-y': positionY,
  rank
}: { 
  name?: string; 
  avatarUrl?: string;
  color?: string;
  position?: [number, number, number];
  'position-y'?: number;
  rank: number;
}) {
  const finalPosition: [number, number, number] = position || [0, positionY || 0, 0];
  const [avatarTexture, setAvatarTexture] = useState<THREE.Texture | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  
  // Bounce animation for winner
  useFrame((state) => {
    if (groupRef.current && rank === 1) {
      const bounce = Math.sin(state.clock.elapsedTime * 2) * 0.1;
      groupRef.current.position.y = (positionY || 0) + bounce;
    }
  });
  
  // Load avatar texture
  useEffect(() => {
    if (!avatarUrl) {
      setAvatarTexture(null);
      return;
    }
    
    // Check if it's an emoji avatar
    const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];
    if (EMOJI_AVATARS.includes(avatarUrl)) {
      setAvatarTexture(null);
      return;
    }
    
    // Load image texture
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    const texture = loader.load(
      avatarUrl,
      (loadedTexture) => {
        loadedTexture.flipY = false;
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
        loadedTexture.minFilter = THREE.LinearFilter;
        loadedTexture.magFilter = THREE.LinearFilter;
        setAvatarTexture(loadedTexture);
      },
      undefined,
      (error) => {
        console.warn('Failed to load avatar texture:', error);
        setAvatarTexture(null);
      }
    );
    
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, [avatarUrl]);
  
  // Show celebration for winner after a delay
  useEffect(() => {
    if (rank === 1) {
      const timer = setTimeout(() => setShowCelebration(true), 500);
      return () => clearTimeout(timer);
    }
  }, [rank]);
  
  // Medal colors based on rank
  const medalColors = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32'  // Bronze
  };
  
  return (
    <group ref={groupRef} position={finalPosition}>
      {/* Medal/crown for winner */}
      {rank === 1 && (
        <mesh position={[0, 1.2, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.3, 0.4, 8]} />
          <meshStandardMaterial 
            color={medalColors[1]} 
            metalness={0.9}
            roughness={0.1}
            emissive={medalColors[1]}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      
      {/* Medal for 2nd and 3rd */}
      {rank > 1 && (
        <mesh position={[0, 1.1, 0]}>
          <torusGeometry args={[0.2, 0.05, 16, 32]} />
          <meshStandardMaterial 
            color={medalColors[rank as keyof typeof medalColors]} 
            metalness={0.9}
            roughness={0.1}
            emissive={medalColors[rank as keyof typeof medalColors]}
            emissiveIntensity={0.2}
          />
        </mesh>
      )}
      
      {/* Fall Guys-style bean body with enhanced material */}
      <mesh castShadow>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial 
          color={color} 
          metalness={rank === 1 ? 0.3 : 0.1}
          roughness={rank === 1 ? 0.4 : 0.7}
          emissive={rank === 1 ? color : '#000000'}
          emissiveIntensity={rank === 1 ? 0.2 : 0}
        />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[0.18, 0.35, 0.65]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-0.18, 0.35, 0.65]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      
      {/* Pupils */}
      <mesh position={[0.18, 0.35, 0.7]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.18, 0.35, 0.7]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      
      {/* Avatar image display */}
      {avatarUrl && avatarTexture && !['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'].includes(avatarUrl) && (
        <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[0.4, 0.4]} />
          <meshBasicMaterial 
            map={avatarTexture} 
            transparent 
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Emoji avatar */}
      {avatarUrl && ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'].includes(avatarUrl) && (
        <Text
          position={[0, 0.8, 0]}
          fontSize={0.5}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          renderOrder={1001}
          depthTest={false}
          depthWrite={false}
        >
          {avatarUrl}
        </Text>
      )}
      
      {/* Celebration particles for winner */}
      {showCelebration && rank === 1 && <CelebrationParticles />}
    </group>
  );
}

export function Podium({ top3Players, winner }: PodiumProps) {
  const camera = useThree((state) => state.camera);
  const [showPodium, setShowPodium] = useState(false);

  useEffect(() => {
    // Animate camera to podium view
    const startPos = camera.position.clone();
    const targetPos = new THREE.Vector3(0, 5, 10);
    const targetLookAt = new THREE.Vector3(0, 2, 0);
    
    let animationFrame: number;
    const duration = 1500; // 1.5 seconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate camera position
      camera.position.lerpVectors(startPos, targetPos, eased);
      
      // Always look at the target
      camera.lookAt(targetLookAt);
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        camera.position.copy(targetPos);
        camera.lookAt(targetLookAt);
        setShowPodium(true);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      camera.position.set(0, 16, 10);
      camera.lookAt(0, 0, 0);
    };
  }, [camera]);

  // Use top3Players if available, otherwise fall back to winner (for backwards compatibility)
  const players = top3Players || (winner ? [{
    walletAddress: winner.walletAddress,
    username: winner.username,
    color: winner.color || '#FFD700',
    position: 1
  }] : []);

  if (players.length === 0) return null;

  // Podium heights: 1st = tallest, 2nd = medium, 3rd = shortest
  const podiumHeights = [2.2, 1.4, 0.8]; // Heights for 1st, 2nd, 3rd
  const podiumPositions: [number, number, number][] = [
    [0, 0, 0],      // 1st place (center)
    [-2.8, 0, 0],  // 2nd place (left)
    [2.8, 0, 0],   // 3rd place (right)
  ];
  
  // Medal colors
  const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze
  const podiumEmissive = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <group>
      {/* Ground plane with subtle glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial 
          color="#1a1a2e" 
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
      
      {/* Render top 3 players on podiums */}
      {players.slice(0, 3).map((player, index) => {
        const position = player.position - 1; // Convert 1,2,3 to 0,1,2 index
        const podiumHeight = podiumHeights[position] || 0;
        const podiumPos = podiumPositions[position] || [0, 0, 0];
        const podiumColor = podiumColors[position] || '#FFFFFF';
        const emissiveColor = podiumEmissive[position] || '#000000';
        
        return (
          <group key={player.walletAddress} position={podiumPos}>
            {/* Enhanced podium base with metallic material */}
            <Box 
              position-y={podiumHeight / 2} 
              scale-x={1.6} 
              scale-y={podiumHeight} 
              scale-z={1.6}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial 
                color={podiumColor}
                metalness={0.8}
                roughness={0.2}
                emissive={emissiveColor}
                emissiveIntensity={showPodium ? 0.3 : 0}
              />
            </Box>
            
            {/* Podium number indicator */}
            <Text
              position={[0, podiumHeight + 0.1, 0.8]}
              fontSize={0.4}
              color="#000000"
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
              renderOrder={999}
            >
              #{player.position}
            </Text>
            
            {/* Character on podium */}
            <Character
              name={player.username}
              avatarUrl={player.avatarUrl}
              color={player.color || '#FF6B6B'}
              position-y={podiumHeight + 0.5}
              rank={player.position}
            />
            
            {/* Enhanced username label with glow */}
            {player.username && (
              <>
                <Text
                  position={[0, podiumHeight + 1.4, 0]}
                  fontSize={0.35}
                  color="#FFFFFF"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.08}
                  outlineColor="#000000"
                  renderOrder={1000}
                  depthTest={false}
                  depthWrite={false}
                  fontWeight="bold"
                >
                  {player.username}
                </Text>
                
                {/* Rank badge */}
                <mesh position={[0, podiumHeight + 1.7, 0]}>
                  <ringGeometry args={[0.3, 0.35, 32]} />
                  <meshStandardMaterial 
                    color={podiumColor}
                    metalness={0.9}
                    roughness={0.1}
                    emissive={emissiveColor}
                    emissiveIntensity={0.5}
                  />
                </mesh>
              </>
            )}
          </group>
        );
      })}
      
      {/* Spotlight effect for winner */}
      {players.length > 0 && players[0].position === 1 && (
        <pointLight
          position={[0, 8, 5]}
          intensity={2}
          color="#FFD700"
          distance={15}
          decay={2}
        />
      )}
    </group>
  );
}

