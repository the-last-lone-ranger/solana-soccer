import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, RapierRigidBody, vec3, euler, quat, CapsuleCollider, useRapier } from '@react-three/rapier';
import { OrbitControls, Environment, Text } from '@react-three/drei';
import { SocketClient } from '../services/socketClient.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { VoiceChatService } from '../services/voiceChat.js';
import * as THREE from 'three';
import './LobbyWaitingRoom3D.css';

interface LobbyWaitingRoom3DProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameStart: () => void;
  onLeaveLobby?: () => void;
  apiClient: ApiClient;
  isSpectator?: boolean;
}

interface RemotePlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  lastUpdate: number;
}


// Fall Guys-style capsule character - based on Wawa Guys implementation
export interface PlayerCharacterProps {
  position: [number, number, number]; 
  isLocal: boolean;
  color?: string;
  username?: string;
  avatarUrl?: string;
  onPositionUpdate?: (pos: { x: number; y: number; z: number }) => void;
  dead?: boolean;
  gameStage?: 'countdown' | 'playing' | 'winner' | 'lobby';
  isSpeaking?: boolean;
  forcePosition?: { x: number; y: number; z: number };
}

export function PlayerCharacter({ 
  position, 
  isLocal, 
  color = '#FF6B6B',
  username,
  avatarUrl,
  onPositionUpdate,
  dead = false,
  gameStage = 'playing',
  isSpeaking = false,
  forcePosition
}: PlayerCharacterProps) {
  const rb = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const textGroupRef = useRef<THREE.Group>(null);
  const jumpCooldownRef = useRef(0);
  const lastPositionRef = useRef({ x: 0, y: 0, z: 0 });
  const [avatarTexture, setAvatarTexture] = useState<THREE.Texture | null>(null);
  const inTheAir = useRef(false);
  const landed = useRef(true); // Start as landed so player can jump immediately
  const rapier = useRapier();
  const lastJumpTimeRef = useRef(0);
  
  // Custom keyboard state - fallback if useKeyboardControls fails
  const keysRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false
  });
  
  // Track jump key press state (to prevent holding jump)
  const jumpPressedRef = useRef(false);
  const jumpExecutedRef = useRef(false);
  
  // Use our own keyboard system (more reliable than drei's hook)
  
  // Set up keyboard listeners
  useEffect(() => {
    if (!isLocal || dead || gameStage !== 'playing') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'ArrowUp' || code === 'KeyW') {
        keysRef.current.forward = true;
      }
      if (code === 'ArrowDown' || code === 'KeyS') {
        keysRef.current.back = true;
      }
      if (code === 'ArrowLeft' || code === 'KeyA') {
        keysRef.current.left = true;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        keysRef.current.right = true;
      }
      if (code === 'Space') {
        e.preventDefault();
        // Only set jump if it wasn't already pressed (prevent holding)
        if (!keysRef.current.jump) {
          keysRef.current.jump = true;
          jumpPressedRef.current = true;
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'ArrowUp' || code === 'KeyW') keysRef.current.forward = false;
      if (code === 'ArrowDown' || code === 'KeyS') keysRef.current.back = false;
      if (code === 'ArrowLeft' || code === 'KeyA') keysRef.current.left = false;
      if (code === 'ArrowRight' || code === 'KeyD') keysRef.current.right = false;
      if (code === 'Space') {
        keysRef.current.jump = false;
        jumpPressedRef.current = false;
        jumpExecutedRef.current = false; // Reset on key release so you can jump again when you land
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Keyboard listeners attached
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLocal, dead, gameStage]);
  
  // Get camera for third-person follow camera (WoW-style)
  const { camera } = useThree();
  
  // Make username text always face camera (billboard effect) - smooth updates
  useFrame(() => {
    if (textGroupRef.current && rb.current) {
      // Billboard effect: always face camera
      textGroupRef.current.lookAt(camera.position);
      
      // Update text position smoothly to follow rigid body
      const translation = rb.current.translation();
      textGroupRef.current.position.set(
        translation.x,
        translation.y + 2.5,
        translation.z
      );
    }
  });
  
  // Physics and movement - EXACTLY like Wawa Guys
  useFrame(() => {
    if (!rb.current || !meshRef.current) {
      return;
    }
    
    // No freezing - players can move freely from the start
    
    if (!isLocal || dead) {
      // Remote players or dead players - just animate
      if (meshRef.current) {
        const bob = Math.sin(Date.now() * 0.005) * 0.05;
        const tilt = Math.sin(Date.now() * 0.003) * 0.1;
        meshRef.current.position.y = bob;
        meshRef.current.rotation.z = tilt;
      }
      return;
    }
    
    // THIRD-PERSON FOLLOW CAMERA (WoW-style) - behind and above character
    if (isLocal && !dead && rb.current) {
      const translation = rb.current.translation();
      const rotation = rb.current.rotation();
      
      // Get player's forward direction from rotation
      const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(quaternion);
      
      // Camera offset: behind and above the character
      const cameraDistance = 8; // Distance behind character (increased for better view)
      const cameraHeight = 4; // Height above character (slightly increased)
      
      // Calculate camera position (behind player)
      const cameraOffset = forward.multiplyScalar(-cameraDistance);
      camera.position.set(
        translation.x + cameraOffset.x,
        translation.y + cameraHeight,
        translation.z + cameraOffset.z
      );
      
      // Camera looks at character (slightly above center)
      const lookAtHeight = 1.5;
      camera.lookAt(
        translation.x,
        translation.y + lookAtHeight,
        translation.z
      );
    }
    
    // Local player movement - EXACT Wawa Guys pattern
    const MOVEMENT_SPEED = 8;
    const JUMP_FORCE = 15; // Increased jump force
    const ROTATION_SPEED = 2.5;
    const JUMP_COOLDOWN = 200; // Milliseconds between jumps
    
    const rotVel = { x: 0, y: 0, z: 0 };
    const curVel = rb.current.linvel();
    
    // Use vec3 helper like Wawa Guys - create Vector3 object
    const vel = new THREE.Vector3(0, 0, 0);
    
    // Get keyboard state from our ref
    const keys = keysRef.current;
    const forward = keys.forward;
    const back = keys.back;
    const left = keys.left;
    const right = keys.right;
    const jump = keys.jump;
    
    // Check if grounded - use velocity and position as fallback
    const translation = rb.current.translation();
    let isGrounded = false;
    
    // Check if vertical velocity is very small and we're near ground level
    // This is more reliable than raycasting for a physics-based character
    if (Math.abs(curVel.y) < 0.5) {
      // If we're close to ground level (accounting for spawn height)
      if (translation.y < 3.5) {
        isGrounded = true;
        landed.current = true;
        inTheAir.current = false;
      } else {
        // Check if we're falling slowly (might be on a platform)
        if (curVel.y > -0.1 && curVel.y < 0.1) {
          isGrounded = true;
          landed.current = true;
          inTheAir.current = false;
        } else {
          isGrounded = false;
          landed.current = false;
          inTheAir.current = true;
        }
      }
    } else {
      // Moving vertically means we're in the air
      isGrounded = false;
      landed.current = false;
      inTheAir.current = true;
    }
    
    // Movement - Third-person: use player rotation (original Wawa Guys pattern)
    // Only allow movement during playing stage
    if (isLocal && gameStage === 'playing') {
      // Third-person movement: rotate character with A/D, move forward/back with W/S
      if (forward) {
        vel.z += MOVEMENT_SPEED;
      }
      if (back) {
        vel.z -= MOVEMENT_SPEED;
      }
      if (left) {
        rotVel.y += ROTATION_SPEED;
      }
      if (right) {
        rotVel.y -= ROTATION_SPEED;
      }
      
      rb.current.setAngvel(rotVel, true);
      
      // Apply rotation to velocity - EXACT Wawa Guys pattern
      const rotation = rb.current.rotation();
      const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const eulerRot = new THREE.Euler().setFromQuaternion(quaternion);
      vel.applyEuler(eulerRot);
    } else {
      // Remote players: use rotation-based movement (original Wawa Guys pattern)
      if (forward) {
        vel.z += MOVEMENT_SPEED;
      }
      if (back) {
        vel.z -= MOVEMENT_SPEED;
      }
      if (left) {
        rotVel.y += ROTATION_SPEED;
      }
      if (right) {
        rotVel.y -= ROTATION_SPEED;
      }
      
      rb.current.setAngvel(rotVel, true);
      
      // Apply rotation to velocity - EXACT Wawa Guys pattern
      const rotation = rb.current.rotation();
      const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const eulerRot = new THREE.Euler().setFromQuaternion(quaternion);
      vel.applyEuler(eulerRot);
    }
    
    // Handle jump - only on key press, not while holding
    const now = Date.now();
    if (jumpPressedRef.current && !jumpExecutedRef.current && isGrounded && landed.current && (now - lastJumpTimeRef.current > JUMP_COOLDOWN)) {
      vel.y = JUMP_FORCE; // Set jump velocity directly
      inTheAir.current = true;
      landed.current = false;
      lastJumpTimeRef.current = now;
      jumpExecutedRef.current = true; // Mark jump as executed so it can't be repeated until key is released
    } else {
      // Preserve vertical velocity (gravity will handle it)
      vel.y = curVel.y;
    }
    
    // Reset jump executed flag when we land (allows jumping again)
    if (isGrounded && landed.current) {
      jumpExecutedRef.current = false;
    }
    
    // Apply velocity
    rb.current.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    
    // Animate character
    if (meshRef.current) {
      const bob = Math.sin(Date.now() * 0.005) * 0.05;
      const tilt = Math.sin(Date.now() * 0.003) * 0.1;
      meshRef.current.position.y = bob;
      meshRef.current.rotation.z = tilt;
    }
    
    // Update position for socket sync - throttle aggressively to avoid re-renders
    if (onPositionUpdate) {
      const translation = rb.current.translation();
      const currentPos = { x: translation.x, y: translation.y, z: translation.z };
      const distance = Math.sqrt(
        Math.pow(currentPos.x - lastPositionRef.current.x, 2) +
        Math.pow(currentPos.y - lastPositionRef.current.y, 2) +
        Math.pow(currentPos.z - lastPositionRef.current.z, 2)
      );
      
      // Only update if moved significantly (0.5 units) - reduces re-renders dramatically
      if (distance > 0.5) {
        lastPositionRef.current = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
        onPositionUpdate({ x: currentPos.x, y: currentPos.y, z: currentPos.z });
      }
    }
  });
  
  // Monitor RigidBody ref initialization - check periodically until it's set
  useEffect(() => {
    if (!isLocal) return;
    
    let attempts = 0;
    const maxAttempts = 50; // Check for 5 seconds (50 * 100ms)
    
    const checkRef = () => {
      attempts++;
      if (rb.current) {
        console.log('[PlayerCharacter] ✅ RigidBody ref confirmed!', {
          hasLinvel: typeof rb.current.linvel === 'function',
          hasSetLinvel: typeof rb.current.setLinvel === 'function',
          attempts,
        });
      } else if (attempts < maxAttempts) {
        // Keep checking
        setTimeout(checkRef, 100);
      } else {
        console.error('[PlayerCharacter] ❌ RigidBody ref never set after', maxAttempts, 'attempts');
      }
    };
    
    // Start checking after a short delay
    const timeout = setTimeout(checkRef, 100);
    return () => clearTimeout(timeout);
  }, [isLocal]);
  
  // Also use useFrame to detect when ref becomes available and try multiple methods
  // Only run this once when ref is missing, not every frame
  const foundRefRef = useRef(false);
  useFrame(() => {
    if (isLocal && !rb.current && !foundRefRef.current) {
      // Method 1: Try to find via mesh parent chain
      if (meshRef.current) {
        let parent: any = meshRef.current.parent;
        let depth = 0;
        while (parent && depth < 10) {
          // Check multiple possible locations
          if (parent.rigidBody && typeof parent.rigidBody.linvel === 'function') {
            rb.current = parent.rigidBody;
            foundRefRef.current = true;
            return;
          }
          if (parent.__r3f?.rigidBody && typeof parent.__r3f.rigidBody.linvel === 'function') {
            rb.current = parent.__r3f.rigidBody;
            foundRefRef.current = true;
            return;
          }
          // Check for Rapier handle
          if (parent.userData?.rigidBodyHandle !== undefined && rapier.world) {
            const handle = parent.userData.rigidBodyHandle;
            const rigidBody = rapier.world.getRigidBody(handle);
            if (rigidBody) {
              rb.current = rigidBody as any;
              foundRefRef.current = true;
              return;
            }
          }
          parent = parent.parent;
          depth++;
        }
      }
      
      // Method 2: Try to find via Rapier world (last resort - slow but should work)
      // Only search once per second to avoid performance issues
      const now = Date.now();
      if (!foundRefRef.current && (!foundRefRef.current || (now % 1000 < 16))) {
        if (rapier.world && meshRef.current) {
          const meshPos = meshRef.current.getWorldPosition(new THREE.Vector3());
          rapier.world.forEachRigidBody((rigidBody) => {
            if (foundRefRef.current) return;
            const rbPos = rigidBody.translation();
            const distance = Math.sqrt(
              Math.pow(rbPos.x - meshPos.x, 2) +
              Math.pow(rbPos.y - meshPos.y, 2) +
              Math.pow(rbPos.z - meshPos.z, 2)
            );
            // If rigid body is very close to our mesh position, it's probably ours
            if (distance < 2) {
              rb.current = rigidBody as any;
              foundRefRef.current = true;
            }
          });
        }
      }
    }
  });
  

  // Load avatar texture - support both image URLs and emoji avatars
  useEffect(() => {
    if (!avatarUrl) {
      setAvatarTexture(null);
      return;
    }

    // Check if it's an emoji avatar (common emoji avatars)
    const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];
    if (EMOJI_AVATARS.includes(avatarUrl)) {
      // For emoji avatars, we'll render them differently (as text)
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
        // Use clamp to edge for avatars - don't repeat
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
        // Better filtering for avatar images
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


  // Component mounted - no logging to avoid spam

  // Handle forced position updates (for teleportation)
  const lastForcePositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
  useEffect(() => {
    if (forcePosition && rb.current && isLocal) {
      const { x, y, z } = forcePosition;
      // Check if position actually changed
      if (!lastForcePositionRef.current || 
          lastForcePositionRef.current.x !== x || 
          lastForcePositionRef.current.y !== y || 
          lastForcePositionRef.current.z !== z) {
        // Teleport RigidBody directly
        rb.current.setTranslation({ x, y: y + 2, z }, true);
        rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true); // Stop velocity
        lastForcePositionRef.current = { x, y, z };
        console.log('[PlayerCharacter] 🌀 Teleported to:', { x, y, z });
      }
    }
  }, [forcePosition, isLocal]);
  
  // Memoize initial position to prevent re-renders
  const initialPosition = useMemo(() => [
    position[0] || 0, 
    (position[1] || 0) + 2, 
    position[2] || 0
  ] as [number, number, number], []); // Only set once on mount
  
  // Update RigidBody position smoothly for remote players using useFrame for interpolation
  const targetPositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
  
  useEffect(() => {
    if (!isLocal) {
      const newPos = { 
        x: position[0] || 0, 
        y: (position[1] || 0) + 2, 
        z: position[2] || 0 
      };
      targetPositionRef.current = newPos;
    }
  }, [position, isLocal]);
  
  // Smooth interpolation for remote player positions
  useFrame((_, delta) => {
    if (!isLocal && rb.current && targetPositionRef.current) {
      const currentPos = rb.current.translation();
      const target = targetPositionRef.current;
      const distance = Math.sqrt(
        Math.pow(target.x - currentPos.x, 2) +
        Math.pow(target.y - currentPos.y, 2) +
        Math.pow(target.z - currentPos.z, 2)
      );
      
      // Smooth interpolation if far enough away
      if (distance > 0.1) {
        const lerpFactor = Math.min(1, delta * 10); // Smooth interpolation
        rb.current.setTranslation({
          x: currentPos.x + (target.x - currentPos.x) * lerpFactor,
          y: currentPos.y + (target.y - currentPos.y) * lerpFactor,
          z: currentPos.z + (target.z - currentPos.z) * lerpFactor,
        }, true);
      }
    }
  });

  return (
    <>
      <RigidBody
        ref={rb}
        type="dynamic"
        colliders="ball"
        restitution={0.2}
        friction={0.4}
        position={initialPosition}
        enabledRotations={[false, true, false]} // Only allow Y rotation
        linearDamping={0.2}
        angularDamping={0.5}
        canSleep={false}
        name={isLocal ? "local-player" : `remote-player-${username || 'unknown'}`}
      >
        <group ref={meshRef}>
          {/* Fall Guys-style bean body - pear/bean shape (wider at bottom) */}
          <mesh ref={bodyRef} castShadow receiveShadow scale={[1, 1.2, 1]}>
            {/* Create bean shape by modifying sphere vertices */}
            <sphereGeometry args={[0.6, 32, 32]} />
            <meshStandardMaterial 
              {...(avatarTexture ? {
                map: avatarTexture,
                roughness: 0.6,
                metalness: 0.0,
                emissive: color,
                emissiveIntensity: 0.15
              } : {
                color: color,
                roughness: 0.3,
                metalness: 0.0,
                emissive: color,
                emissiveIntensity: 0.25
              })}
            />
          </mesh>
          
          {/* Bean shape modifier - make it wider at bottom */}
          <mesh 
            castShadow 
            receiveShadow 
            scale={[1.15, 0.9, 1.15]} 
            position={[0, -0.15, 0]}
          >
            <sphereGeometry args={[0.5, 24, 24]} />
            <meshStandardMaterial 
              {...(avatarTexture ? {
                map: avatarTexture,
                roughness: 0.6,
                metalness: 0.0,
                emissive: color,
                emissiveIntensity: 0.15
              } : {
                color: color,
                roughness: 0.3,
                metalness: 0.0,
                emissive: color,
                emissiveIntensity: 0.25
              })}
            />
          </mesh>
          
          {/* Eyes - bigger and more prominent Fall Guys style */}
          <mesh position={[0.18, 0.35, 0.65]} castShadow>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.1} />
          </mesh>
          <mesh position={[-0.18, 0.35, 0.65]} castShadow>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.1} />
          </mesh>
          
          {/* Eye shine/highlight */}
          <mesh position={[0.2, 0.38, 0.72]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[-0.16, 0.38, 0.72]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.5} />
          </mesh>
          
          {/* Pupils - bigger and more expressive */}
          <mesh position={[0.18, 0.35, 0.7]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[-0.18, 0.35, 0.7]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          
          {/* Mouth - bigger smile, more Fall Guys-like */}
          <mesh position={[0, 0.05, 0.68]} rotation={[0, 0, 0]}>
            <ringGeometry args={[0.12, 0.22, 16, 1, 0, Math.PI]} />
            <meshStandardMaterial color="#000000" side={THREE.DoubleSide} />
          </mesh>
          
          {/* Emoji avatar display (if avatar is an emoji) */}
          {avatarUrl && ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'].includes(avatarUrl) && (
            <Text
              position={[0, 0.5, 0.7]}
              fontSize={0.8}
              anchorX="center"
              anchorY="middle"
            >
              {avatarUrl}
            </Text>
          )}
          
          {/* Avatar image display (floating above character if image URL) */}
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
        </group>
        {/* Use CapsuleCollider like Wawa Guys */}
        <CapsuleCollider args={[0.1, 0.38]} position={[0, 0.68, 0]} />
      </RigidBody>
      
      {/* Username label - billboarded to always face camera, smooth position */}
      {username && (
        <group 
          ref={textGroupRef}
          position={[position[0], position[1] + 1.0, position[2]]}
        >
          <Text
            fontSize={0.35}
            color="#FFFFFF"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="#000000"
            renderOrder={1000}
            depthTest={false}
            depthWrite={false}
            sdfGlyphSize={16}
          >
            {username}
          </Text>
        </group>
      )}
      
      {/* Microphone indicator when speaking */}
      {isSpeaking && (
        <group position={[position[0], position[1] + 1.8, position[2]]}>
          {/* Pulsing ring */}
          <mesh>
            <ringGeometry args={[0.15, 0.2, 32]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
          </mesh>
          {/* Microphone icon */}
          <Text
            position={[0, 0, 0]}
            fontSize={0.25}
            color="#10b981"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
            renderOrder={1001}
            depthTest={false}
            depthWrite={false}
          >
            🎤
          </Text>
        </group>
      )}
    </>
  );
}

// Colorful platform component
function Platform({ 
  position, 
  size = [4, 0.5, 4], 
  color = '#4ECDC4',
  rotation = [0, 0, 0]
}: { 
  position: [number, number, number]; 
  size?: [number, number, number];
  color?: string;
  rotation?: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" position={position} rotation={rotation} name="platform">
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.3} 
          metalness={0.2}
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>
      {/* Platform edge highlight */}
      <mesh position={[0, size[1] / 2 + 0.01, 0]}>
        <boxGeometry args={[size[0], 0.05, size[2]]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.3} />
      </mesh>
    </RigidBody>
  );
}

// Ground with colorful pattern
function Ground() {
  return (
    <>
      <RigidBody type="fixed" position={[0, -0.5, 0]} name="ground">
        <mesh receiveShadow>
          <boxGeometry args={[50, 1, 50]} />
          <meshStandardMaterial color="#7CB342" roughness={0.8} />
        </mesh>
      </RigidBody>
      {/* Decorative tiles */}
      {Array.from({ length: 10 }).map((_, i) => 
        Array.from({ length: 10 }).map((_, j) => (
          <mesh
            key={`${i}-${j}`}
            position={[-25 + i * 5, 0, -25 + j * 5]}
            receiveShadow
          >
            <boxGeometry args={[4.8, 0.1, 4.8]} />
            <meshStandardMaterial 
              color={(i + j) % 2 === 0 ? '#8BC34A' : '#9CCC65'} 
              roughness={0.9}
            />
          </mesh>
        ))
      )}
    </>
  );
}

// Environment - use direct files prop like Wawa Guys (no separate component needed)

// Main 3D scene
function Scene({ 
  lobby, 
  socketClient, 
  address, 
  remotePlayers, 
  setRemotePlayers,
  localPosition,
  setLocalPosition,
  localPlayerProfile,
  playerSpeaking
}: { 
  lobby: Lobby;
  socketClient: SocketClient;
  address: string | null;
  remotePlayers: Map<string, RemotePlayer>;
  setRemotePlayers: (players: Map<string, RemotePlayer>) => void;
  localPosition: { x: number; y: number; z: number };
  setLocalPosition: (pos: { x: number; y: number; z: number }) => void;
  localPlayerProfile: { username?: string; avatarUrl?: string } | null;
  playerSpeaking: Map<string, boolean>;
}) {
  const { camera } = useThree();
  
  useEffect(() => {
    // Set up camera - third-person follow camera for local player
    if (address) {
      // Third-person: camera starts behind spawn position
      camera.position.set(0, 5, 5); // Behind and above spawn
      camera.lookAt(0, 2, 0);
      console.log('[Scene] 📷 Third-person follow camera initialized');
    } else {
      // Spectator: orbit camera
      camera.position.set(0, 10, 15);
      camera.lookAt(0, 3, 0);
      console.log('[Scene] 📷 Spectator camera initialized');
    }
  }, [camera, address]);

  // Handle local position updates for socket sync - use ref to avoid re-renders
  const positionUpdateRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const lastSocketUpdateRef = useRef<number>(0);
  
  const handlePositionUpdate = useCallback((pos: { x: number; y: number; z: number }) => {
    // Store position in ref instead of state to avoid re-renders
    positionUpdateRef.current = pos;
    
    // Only update state if position changed significantly (for visual updates)
    const currentPos = localPosition;
    const distance = Math.sqrt(
      Math.pow(pos.x - currentPos.x, 2) +
      Math.pow(pos.y - currentPos.y, 2) +
      Math.pow(pos.z - currentPos.z, 2)
    );
    
    if (distance > 1) {
      setLocalPosition(pos);
    }
    
    // Throttle socket updates to 10 times per second max
    const now = Date.now();
    if (socketClient.isConnected() && address && (now - lastSocketUpdateRef.current > 100)) {
      lastSocketUpdateRef.current = now;
      socketClient.sendPlayerPosition(lobby.id, {
        walletAddress: address,
        x: pos.x * 10, // Convert back to 2D coords for compatibility
        y: pos.z * 10,
        velocityX: 0,
        velocityY: 0,
        isGrounded: true,
        facing: 'right',
      });
    }
  }, [socketClient, lobby.id, address, localPosition, setLocalPosition]);

  // Get local player info
  const localPlayer = lobby.players?.find(p => p.walletAddress === address);
  const playerColors = [
    '#FF6B6B', '#4ECDC4', '#95E1D3', '#FFA07A', 
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3'
  ];
  
  // Calculate spawn position based on player index to avoid overlapping
  const localPlayerSpawnPosition = useMemo(() => {
    if (!address || !lobby.players) return [0, 5, 0] as [number, number, number];
    
    const playerIndex = lobby.players.findIndex(p => p.walletAddress === address);
    if (playerIndex === -1) return [0, 5, 0] as [number, number, number];
    
    // Spread players out in a circle around spawn area
    const angle = (playerIndex / lobby.players.length) * Math.PI * 2;
    const radius = 3 + (playerIndex * 1.5); // Increase radius for each player
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    return [x, 5, z] as [number, number, number];
  }, [address, lobby.players]);
  
  // Memoize local player position to prevent constant re-renders
  // Round to nearest integer to prevent micro-changes from causing re-renders
  // Use spawn position as fallback if localPosition hasn't been set yet
  const localPlayerPosition = useMemo(() => [
    Math.round(localPosition.x || localPlayerSpawnPosition[0]),
    Math.round(localPosition.y || localPlayerSpawnPosition[1]),
    Math.round(localPosition.z || localPlayerSpawnPosition[2])
  ] as [number, number, number], [
    Math.round(localPosition.x || localPlayerSpawnPosition[0]),
    Math.round(localPosition.y || localPlayerSpawnPosition[1]),
    Math.round(localPosition.z || localPlayerSpawnPosition[2]),
    localPlayerSpawnPosition
  ]);
  
  return (
    <>
      {/* Enhanced lighting - Fall Guys style */}
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[10, 15, 10]} 
        intensity={1.2} 
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <pointLight position={[-10, 10, -10]} intensity={0.6} color="#FFB6C1" />
      <pointLight position={[10, 5, -10]} intensity={0.4} color="#87CEEB" />
      
      {/* Physics world */}
      <Physics gravity={[0, -25, 0]} debug={false}>
        {/* Ground */}
        <Ground />
        
        {/* Colorful platforms - Fall Guys obstacle course style */}
        <Platform position={[-6, 2, -2]} color="#FF6B6B" size={[3, 0.5, 3]} />
        <Platform position={[0, 4, -4]} color="#4ECDC4" size={[4, 0.5, 4]} />
        <Platform position={[6, 3, 2]} color="#95E1D3" size={[3, 0.5, 3]} />
        <Platform position={[-4, 5, 3]} color="#FFA07A" size={[3, 0.5, 3]} />
        <Platform position={[4, 2, -6]} color="#98D8C8" size={[3, 0.5, 3]} />
        <Platform position={[-2, 6, 0]} color="#F7DC6F" size={[2.5, 0.5, 2.5]} />
        <Platform position={[2, 4, 4]} color="#BB8FCE" size={[3, 0.5, 3]} />
        
        {/* Local player */}
        {address && (() => {
          console.log('[Scene] 🎮 Rendering local player at position:', localPlayerPosition);
          const isSpeaking = playerSpeaking.get(address) || false;
          return (
            <PlayerCharacter
              position={localPlayerPosition}
              isLocal={true}
              color={playerColors[0]}
              username={localPlayer?.username || localPlayerProfile?.username || 'You'}
              avatarUrl={localPlayer?.avatarUrl || localPlayerProfile?.avatarUrl}
              onPositionUpdate={handlePositionUpdate}
              isSpeaking={isSpeaking}
            />
          );
        })()}
        
        {/* Remote players */}
        {Array.from(remotePlayers.entries()).map(([walletAddress, player], index) => {
          const playerInfo = lobby.players?.find(p => p.walletAddress === walletAddress);
          const isSpeaking = playerSpeaking.get(walletAddress) || false;
          return (
            <PlayerCharacter
              key={walletAddress}
              position={[player.position.x, player.position.y || 5, player.position.z]}
              isLocal={false}
              color={playerColors[(index + 1) % playerColors.length]}
              username={playerInfo?.username || player.username || walletAddress.slice(0, 6)}
              avatarUrl={playerInfo?.avatarUrl}
              isSpeaking={isSpeaking}
            />
          );
        })}
      </Physics>
      
      {/* Environment - Medieval Cafe HDR from Wawa Guys (direct files prop) */}
      <Environment 
        files="/hdrs/medieval_cafe_1k.hdr"
        background
      />
      
      {/* Orbit controls disabled for local player (camera follows character automatically) */}
      {/* Only show orbit controls for spectators */}
      {!address && (
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          minDistance={8}
          maxDistance={40}
          target={[0, 3, 0]}
          enableDamping={true}
          dampingFactor={0.05}
        />
      )}
    </>
  );
}

export function LobbyWaitingRoom3D({ 
  lobby: initialLobby, 
  socketClient, 
  onGameStart, 
  onLeaveLobby, 
  apiClient, 
  isSpectator = false 
}: LobbyWaitingRoom3DProps) {
  // Check if instructions were dismissed (stored in localStorage)
  const [showInstructions, setShowInstructions] = useState(() => {
    const dismissed = localStorage.getItem('lobby-instructions-dismissed');
    return dismissed !== 'true';
  });
  const { address } = useWallet();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<Lobby>(initialLobby);
  const [countdown, setCountdown] = useState<number | null>(initialLobby.countdownSeconds ?? null);
  const [remotePlayers, setRemotePlayers] = useState<Map<string, RemotePlayer>>(new Map());
  // Initialize local position based on player index to avoid overlapping
  const getInitialSpawnPosition = useCallback(() => {
    if (!address || !initialLobby.players) return { x: 0, y: 5, z: 0 };
    
    const playerIndex = initialLobby.players.findIndex(p => p.walletAddress === address);
    if (playerIndex === -1) return { x: 0, y: 5, z: 0 };
    
    // Spread players out in a circle around spawn area
    const angle = (playerIndex / initialLobby.players.length) * Math.PI * 2;
    const radius = 3 + (playerIndex * 1.5); // Increase radius for each player
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    return { x, y: 5, z };
  }, [address, initialLobby.players]);
  
  const [localPosition, setLocalPosition] = useState<{ x: number; y: number; z: number }>(getInitialSpawnPosition());
  const [localPlayerProfile, setLocalPlayerProfile] = useState<{ username?: string; avatarUrl?: string } | null>(null);
  
  // Voice chat state
  const voiceChatRef = useRef<VoiceChatService | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).enabled : false;
  });
  const [pushToTalkKey, setPushToTalkKey] = useState(() => {
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).pushToTalkKey || 'v' : 'v';
  });
  const [isPushingToTalk, setIsPushingToTalk] = useState(false);
  const [playerSpeaking, setPlayerSpeaking] = useState<Map<string, boolean>>(new Map());
  const keysPressedRef = useRef<Set<string>>(new Set());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Load local player profile
  useEffect(() => {
    if (address && apiClient) {
      apiClient.getProfile().then(profile => {
        setLocalPlayerProfile({
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        });
      }).catch(err => {
        console.error('[WaitingRoom3D] Failed to load profile:', err);
      });
    }
  }, [address, apiClient]);

  // Auto-focus canvas container on mount for keyboard input
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the container after a short delay to ensure it's rendered
    const timer = setTimeout(() => {
      canvasContainerRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize remote players from lobby with spread out positions
  useEffect(() => {
    if (!address || !lobby.players) return;
    
    const newPlayers = new Map<string, RemotePlayer>();
    let playerIndex = 0;
    
    lobby.players.forEach(player => {
      if (player.walletAddress !== address) {
        // Spread players out in a circle around spawn area
        const angle = (playerIndex / lobby.players.length) * Math.PI * 2;
        const radius = 3 + (playerIndex * 1.5); // Increase radius for each player
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        newPlayers.set(player.walletAddress, {
          walletAddress: player.walletAddress,
          username: player.username,
          avatarUrl: player.avatarUrl,
          position: { x, y: 5, z },
          rotation: { x: 0, y: 0, z: 0 },
          lastUpdate: Date.now(),
        });
        playerIndex++;
      }
    });
    
    if (newPlayers.size > 0) {
      console.log('[WaitingRoom3D] Initialized remote players:', newPlayers.size);
      setRemotePlayers(newPlayers);
    }
  }, [lobby.players, address]);

  // Socket setup
  useEffect(() => {
    if (socketClient.isConnected()) {
      socketClient.joinLobby(lobby.id);
    }

    const handleLobbyState = (data: { lobby: Lobby }) => {
      if (data.lobby.id !== lobby.id) return;
      setLobby(data.lobby);
    };

    const handlePlayerPosition = (data: { walletAddress: string; position: PlayerPosition; timestamp: number }) => {
      if (data.walletAddress === address) return;
      
      console.log('[WaitingRoom3D] Received player position:', data.walletAddress, data.position);
      
      setRemotePlayers(prev => {
        const newPlayers = new Map(prev);
        const playerInfo = lobby.players?.find(p => p.walletAddress === data.walletAddress);
        
        newPlayers.set(data.walletAddress, {
          walletAddress: data.walletAddress,
          username: playerInfo?.username,
          avatarUrl: playerInfo?.avatarUrl,
          position: { 
            x: data.position.x / 10, // 2D x -> 3D x
            y: 5, // Height (default spawn height)
            z: data.position.y / 10  // 2D y -> 3D z
          },
          rotation: { x: 0, y: 0, z: 0 },
          lastUpdate: data.timestamp,
        });
        
        return newPlayers;
      });
    };

    socketClient.onLobbyState(handleLobbyState);
    socketClient.onPlayerPosition(handlePlayerPosition);

    return () => {
      socketClient.off('lobby:state');
      socketClient.off('game:player_position');
    };
  }, [socketClient, lobby.id, lobby.players, address]);

  // Listen for countdown
  useEffect(() => {
    const handleCountdown = (data: { lobbyId: string; countdown: number }) => {
      if (data.lobbyId === lobby.id) {
        setCountdown(data.countdown);
      }
    };

    const handleGameStarted = (data: { lobbyId: string }) => {
      if (data.lobbyId === lobby.id) {
        onGameStart();
      }
    };

    socketClient.onLobbyCountdown(handleCountdown);
    socketClient.onGameStarted(handleGameStarted);

    return () => {
      socketClient.off('lobby:countdown');
      socketClient.off('lobby:game_started');
    };
  }, [socketClient, lobby.id, onGameStart]);

  // Initialize voice chat service
  useEffect(() => {
    if (!address || !isVoiceEnabled) return;

    const voiceChat = new VoiceChatService();
    voiceChatRef.current = voiceChat;

    voiceChat.initialize().then(() => {
      console.log('[LobbyWaitingRoom3D] Voice chat initialized');
    }).catch(err => {
      console.error('[LobbyWaitingRoom3D] Failed to initialize voice chat:', err);
    });

    return () => {
      voiceChat.cleanup();
      voiceChatRef.current = null;
    };
  }, [address, isVoiceEnabled]);

  // Set up push-to-talk handlers
  useEffect(() => {
    if (!isVoiceEnabled || !voiceChatRef.current) return;

    const voiceChat = voiceChatRef.current;
    voiceChat.setPushToTalk(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase() && voiceChat.getPushToTalk()) {
        e.preventDefault();
        if (!keysPressedRef.current.has(e.key.toLowerCase())) {
          keysPressedRef.current.add(e.key.toLowerCase());
          voiceChat.startPushToTalk();
          setIsPushingToTalk(true);
          if (socketClient.isConnected() && address) {
            setPlayerSpeaking(prev => {
              const newMap = new Map(prev);
              newMap.set(address, true);
              return newMap;
            });
            socketClient.sendVoiceState(lobby.id, true);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase()) {
        keysPressedRef.current.delete(e.key.toLowerCase());
        voiceChat.stopPushToTalk();
        setIsPushingToTalk(false);
        if (socketClient.isConnected() && address) {
          setPlayerSpeaking(prev => {
            const newMap = new Map(prev);
            newMap.set(address, false);
            return newMap;
          });
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (keysPressedRef.current.has(pushToTalkKey.toLowerCase())) {
        voiceChat.stopPushToTalk();
        setIsPushingToTalk(false);
        if (socketClient.isConnected() && address) {
          setPlayerSpeaking(prev => {
            const newMap = new Map(prev);
            newMap.set(address, false);
            return newMap;
          });
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };
  }, [pushToTalkKey, lobby.id, socketClient, isVoiceEnabled, address]);

  // Listen for voice state updates from other players
  useEffect(() => {
    const handleVoiceState = (data: { walletAddress: string; isSpeaking: boolean; timestamp: number }) => {
      if (data.walletAddress === address) return;
      
      setPlayerSpeaking(prev => {
        const newMap = new Map(prev);
        newMap.set(data.walletAddress, data.isSpeaking);
        return newMap;
      });
    };

    socketClient.onVoiceState(handleVoiceState);

    return () => {
      socketClient.off('game:voice_state');
    };
  }, [socketClient, address]);

  // Set up WebRTC peer connections for voice chat
  useEffect(() => {
    if (!isVoiceEnabled || !voiceChatRef.current || !lobby.players || !address) return;

    const voiceChat = voiceChatRef.current;
    const otherPlayers = lobby.players.filter(p => p.walletAddress !== address);

    // Create peer connections for each other player
    otherPlayers.forEach(async (player) => {
      const walletAddress = player.walletAddress;
      
      // Skip if connection already exists
      if (peerConnectionsRef.current.has(walletAddress)) return;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Add local stream tracks
      const localStream = voiceChat.getLocalStream();
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (!remoteAudioRefs.current.has(walletAddress)) {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.autoplay = true;
          remoteAudioRefs.current.set(walletAddress, audio);
        }
      };

      peerConnectionsRef.current.set(walletAddress, peerConnection);

      // Create offer
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socketClient.sendWebRTCOffer(lobby.id, walletAddress, offer);
      } catch (err) {
        console.error('[LobbyWaitingRoom3D] Failed to create offer:', err);
      }
    });

    // Handle WebRTC offer
    const handleWebRTCOffer = async (data: { fromAddress: string; offer: RTCSessionDescriptionInit }) => {
      if (data.fromAddress === address) return;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Add local stream
      const localStream = voiceChat.getLocalStream();
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (!remoteAudioRefs.current.has(data.fromAddress)) {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.autoplay = true;
          remoteAudioRefs.current.set(data.fromAddress, audio);
        }
      };

      await peerConnection.setRemoteDescription(data.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socketClient.sendWebRTCAnswer(lobby.id, data.fromAddress, answer);

      peerConnectionsRef.current.set(data.fromAddress, peerConnection);
    };

    // Handle WebRTC answer
    const handleWebRTCAnswer = async (data: { fromAddress: string; answer: RTCSessionDescriptionInit }) => {
      const peerConnection = peerConnectionsRef.current.get(data.fromAddress);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
      }
    };

    // Handle ICE candidates
    const handleWebRTCIce = async (data: { fromAddress: string; candidate: RTCIceCandidateInit }) => {
      const peerConnection = peerConnectionsRef.current.get(data.fromAddress);
      if (peerConnection) {
        await peerConnection.addIceCandidate(data.candidate);
      }
    };

    socketClient.onWebRTCOffer(handleWebRTCOffer);
    socketClient.onWebRTCAnswer(handleWebRTCAnswer);
    socketClient.onWebRTCIceCandidate(handleWebRTCIce);

    return () => {
      socketClient.off('webrtc:offer');
      socketClient.off('webrtc:answer');
      socketClient.off('webrtc:ice');
      
      // Cleanup peer connections
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      remoteAudioRefs.current.forEach(audio => {
        audio.pause();
        audio.srcObject = null;
      });
      remoteAudioRefs.current.clear();
    };
  }, [isVoiceEnabled, lobby.players, lobby.id, socketClient, address]);

  const handleLeaveLobby = async () => {
    try {
      if (apiClient) {
        await apiClient.leaveLobby(lobby.id);
      }
      socketClient.leaveLobby(lobby.id);
      if (onLeaveLobby) {
        onLeaveLobby();
      }
      navigate('/lobbies');
    } catch (err: any) {
      console.error('Failed to leave lobby:', err);
      navigate('/lobbies');
    }
  };

  return (
    <div className="lobby-waiting-room-3d">
      <button className="leave-lobby-btn" onClick={handleLeaveLobby}>
        ← Leave Lobby
      </button>
      
      <div className="waiting-room-header" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <h2>🎮 3D Waiting Room</h2>
        {countdown !== null && countdown > 0 ? (
          <div className="countdown-display">
            <span className="countdown-number">{countdown}</span>
            <span className="countdown-label">Game starting in...</span>
          </div>
        ) : (
          <div className="waiting-message">
            Waiting for players... ({lobby.players?.length || 0}/{lobby.maxPlayers ?? 50})
          </div>
        )}
      </div>
      
      {/* Voice chat controls */}
      <div className="waiting-room-voice-controls" style={{ position: 'absolute', top: '80px', right: '20px', zIndex: 100 }}>
        <button
          onClick={() => {
            const newValue = !isVoiceEnabled;
            setIsVoiceEnabled(newValue);
            localStorage.setItem(`voice_settings_${address}`, JSON.stringify({
              enabled: newValue,
              pushToTalkKey: pushToTalkKey
            }));
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: isVoiceEnabled ? '#10b981' : '#6B7280',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {isVoiceEnabled ? '🎤 Voice ON' : '🎤 Voice OFF'}
        </button>
        {isVoiceEnabled && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#fff', textAlign: 'center' }}>
            Hold {pushToTalkKey.toUpperCase()} to talk
          </div>
        )}
      </div>

      <div 
        ref={canvasContainerRef}
        className="waiting-room-canvas-container-3d"
        onClick={(e) => {
          // Focus canvas on click to ensure keyboard events work
          const canvas = e.currentTarget.querySelector('canvas');
          if (canvas) {
            canvas.focus();
          }
        }}
        tabIndex={0}
      >
        <Canvas shadows camera={{ position: [0, 12, 18], fov: 60 }} tabIndex={0}>
          <Scene
            lobby={lobby}
            socketClient={socketClient}
            address={address}
            remotePlayers={remotePlayers}
            setRemotePlayers={setRemotePlayers}
            localPosition={localPosition}
            setLocalPosition={setLocalPosition}
            localPlayerProfile={localPlayerProfile}
            playerSpeaking={playerSpeaking}
          />
        </Canvas>
        
        {showInstructions && (
          <div className="controls-hint-3d">
            <button 
              className="dismiss-instructions-btn"
              onClick={() => {
                setShowInstructions(false);
                localStorage.setItem('lobby-instructions-dismissed', 'true');
              }}
              aria-label="Dismiss instructions"
            >
              ×
            </button>
            <p>🎮 Use Arrow Keys or WASD to move!</p>
            <p>Spacebar to jump</p>
            <p>🏃 Parkour across colorful platforms!</p>
            <p>🖱️ Drag to rotate camera</p>
          </div>
        )}
      </div>

      <div className="waiting-room-players" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
        <h3>Players in Lobby ({lobby.players?.length || 0})</h3>
        <div className="players-list">
          {(lobby.players || []).map((player) => {
            const isSpeaking = playerSpeaking.get(player.walletAddress) || false;
            return (
              <div 
                key={player.walletAddress} 
                className={`player-badge ${isSpeaking ? 'speaking' : ''} ${player.walletAddress === address ? 'is-you' : ''}`}
              >
                {isSpeaking && (
                  <span className="speaking-indicator" aria-label="Speaking">
                    🎤
                  </span>
                )}
                <span className="player-name">
                  {player.username || `${player.walletAddress.slice(0, 6)}...`}
                </span>
                {player.walletAddress === address && (
                  <span className="you-badge">You</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
