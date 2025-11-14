import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody } from '@react-three/rapier';
import { Environment, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { SocketClient } from '../services/socketClient.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { VoiceChatService } from '../services/voiceChat.js';
import { Podium } from './Podium.js';
import { PlayerCharacter, type PlayerCharacterProps } from './LobbyWaitingRoom3D.js';
import './FallGuysGame3D.css';

interface FallGuysGame3DProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameEnd: (results: any[]) => void;
  apiClient: ApiClient;
}

interface Top3Player {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  color?: string;
  position: number;
}

interface HexagonProps {
  position: [number, number, number];
  color: string;
  hit: boolean;
  onHit: () => void;
}

interface TeleportPowerUpProps {
  position: [number, number, number];
  onCollect: () => void;
  collected: boolean;
}

interface FloorResetPowerUpProps {
  position: [number, number, number];
  onCollect: () => void;
  collected: boolean;
}

// Teleport Power-Up component - spawns randomly on hexagons
function TeleportPowerUp({ position, onCollect, collected }: TeleportPowerUpProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rotationRef = useRef(0);
  
  useFrame((_, delta) => {
    if (collected || !meshRef.current) return;
    
    // Rotate and float animation
    rotationRef.current += delta * 2;
    meshRef.current.rotation.y = rotationRef.current;
    meshRef.current.position.y = position[1] + Math.sin(rotationRef.current * 2) * 0.3 + 1;
  });
  
  if (collected) return null;
  
  return (
    <RigidBody
      type="fixed"
      position={position}
      name="teleport-powerup"
      colliders="hull"
      sensor={true}
      onIntersectionEnter={(e) => {
        const isPlayer = e.other.rigidBodyObject.name?.includes('player') || 
                        e.other.rigidBodyObject.name === 'player';
        if (isPlayer && !collected) {
          onCollect();
        }
      }}
    >
      <mesh ref={meshRef} position={[position[0], position[1] + 1, position[2]]}>
        <torusGeometry args={[0.5, 0.2, 8, 16]} />
        <meshStandardMaterial
          color="#FF00FF"
          emissive="#FF00FF"
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Glow effect */}
      <mesh position={[position[0], position[1] + 1, position[2]]}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshStandardMaterial
          color="#FF00FF"
          transparent
          opacity={0.2}
          emissive="#FF00FF"
          emissiveIntensity={0.3}
        />
      </mesh>
    </RigidBody>
  );
}

// Floor Reset Power-Up component - respawns everyone on new floor
function FloorResetPowerUp({ position, onCollect, collected }: FloorResetPowerUpProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rotationRef = useRef(0);
  
  useFrame((_, delta) => {
    if (collected || !meshRef.current) return;
    
    // Rotate and float animation (faster than teleport)
    rotationRef.current += delta * 3;
    meshRef.current.rotation.y = rotationRef.current;
    meshRef.current.rotation.x = Math.sin(rotationRef.current) * 0.3;
    meshRef.current.position.y = position[1] + Math.sin(rotationRef.current * 2.5) * 0.4 + 1;
  });
  
  if (collected) return null;
  
  return (
    <RigidBody
      type="fixed"
      position={position}
      name="floor-reset-powerup"
      colliders="hull"
      sensor={true}
      onIntersectionEnter={(e) => {
        const isPlayer = e.other.rigidBodyObject.name?.includes('player') || 
                        e.other.rigidBodyObject.name === 'player';
        if (isPlayer && !collected) {
          onCollect();
        }
      }}
    >
      <mesh ref={meshRef} position={[position[0], position[1] + 1, position[2]]}>
        <octahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial
          color="#00FFFF"
          emissive="#00FFFF"
          emissiveIntensity={0.6}
        />
      </mesh>
      {/* Glow effect - stronger than teleport */}
      <mesh position={[position[0], position[1] + 1, position[2]]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial
          color="#00FFFF"
          transparent
          opacity={0.3}
          emissive="#00FFFF"
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Pulsing rings */}
      <mesh position={[position[0], position[1] + 1, position[2]]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.05, 8, 16]} />
        <meshStandardMaterial
          color="#00FFFF"
          transparent
          opacity={0.5}
          emissive="#00FFFF"
          emissiveIntensity={0.5}
        />
      </mesh>
    </RigidBody>
  );
}

// Hexagon component - fades out when hit
function Hexagon({ position, color, hit, onHit }: HexagonProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [disabled, setDisabled] = useState(false);
  const opacityRef = useRef(1.0);
  
  useFrame((_, delta) => {
    if (hit && !disabled && meshRef.current) {
      // Slowly fade out opacity
      opacityRef.current = Math.max(0, opacityRef.current - delta * 1.5);
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      if (material.opacity !== undefined) {
        material.opacity = opacityRef.current;
      }
      
      // Disable collision when opacity is very low
      if (opacityRef.current < 0.1) {
        setDisabled(true);
      }
    }
  });

  useEffect(() => {
    if (hit) {
      // Reset opacity when hit starts
      opacityRef.current = 1.0;
    }
  }, [hit]);

  if (disabled) return null;

  return (
    <RigidBody
      type="fixed"
      position={position}
      name="hexagon"
      colliders="hull"
      restitution={0.1}
      friction={0.1}
      onCollisionEnter={(e) => {
        // Only trigger hit if not already hit and not disabled
        // Check for both local-player and remote-player names
        const isPlayer = e.other.rigidBodyObject.name?.includes('player') || 
                        e.other.rigidBodyObject.name === 'player';
        if (isPlayer && !hit && !disabled && opacityRef.current > 0.1) {
          onHit();
        }
      }}
    >
      <mesh ref={meshRef}>
        <cylinderGeometry args={[1, 1, 0.2, 6]} />
        <meshStandardMaterial
          color={hit ? 'orange' : color}
          transparent
          opacity={opacityRef.current}
        />
      </mesh>
    </RigidBody>
  );
}

// Using PlayerCharacter from waiting room - no need to duplicate!

// Game Arena - EXACTLY like Wawa Guys
export const HEX_X_SPACING = 2.25;
export const HEX_Z_SPACING = 1.95;
export const NB_ROWS = 7;
export const NB_COLUMNS = 7;
export const FLOOR_HEIGHT = 10;
export const FLOORS = [
  { color: 'red' },
  { color: 'blue' },
  { color: 'green' },
  { color: 'yellow' },
  { color: 'purple' },
];

// Generate random floor colors
export function generateRandomFloors(): Array<{ color: string }> {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
  const numFloors = 5;
  const floors: Array<{ color: string }> = [];
  
  for (let i = 0; i < numFloors; i++) {
    floors.push({ color: colors[Math.floor(Math.random() * colors.length)] });
  }
  
  return floors;
}

function GameArena({ 
  hexagonHit, 
  setHexagonHit,
  socketClient,
  lobbyId,
  teleportPowerUps,
  setTeleportPowerUps,
  onTeleportCollect,
  powerUpSpawns,
  floorResetPowerUps,
  setFloorResetPowerUps,
  onFloorResetCollect,
  floorResetSpawns,
  floors
}: { 
  hexagonHit: Record<string, boolean>;
  setHexagonHit: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  socketClient: SocketClient;
  lobbyId: string;
  teleportPowerUps: Set<string>;
  setTeleportPowerUps: React.Dispatch<React.SetStateAction<Set<string>>>;
  onTeleportCollect: (hexagonKey: string) => void;
  powerUpSpawns: Set<string>;
  floorResetPowerUps: Set<string>;
  setFloorResetPowerUps: React.Dispatch<React.SetStateAction<Set<string>>>;
  onFloorResetCollect: (hexagonKey: string) => void;
  floorResetSpawns: Set<string>;
  floors: Array<{ color: string }>;
}) {
  // Sync hexagon hits via socket (like Wawa Guys RPC)
  useEffect(() => {
    const handleHexagonHit = (data: { hexagonKey: string }) => {
      setHexagonHit((prev) => ({
        ...prev,
        [data.hexagonKey]: true,
      }));
    };

    const handleTeleportCollect = (data: { hexagonKey: string }) => {
      setTeleportPowerUps((prev) => {
        const newSet = new Set(prev);
        newSet.add(data.hexagonKey);
        return newSet;
      });
    };

    const handleFloorResetCollect = (data: { hexagonKey: string }) => {
      setFloorResetPowerUps((prev) => {
        const newSet = new Set(prev);
        newSet.add(data.hexagonKey);
        return newSet;
      });
    };

    // Floor reset is handled in Experience component, not here

    // Listen for hexagon hits and power-up collections from other players
    socketClient.on('hexagonHit', handleHexagonHit);
    socketClient.on('teleportCollect', handleTeleportCollect);
    socketClient.on('floorResetCollect', handleFloorResetCollect);

    return () => {
      socketClient.off('hexagonHit');
      socketClient.off('teleportCollect');
      socketClient.off('floorResetCollect');
    };
  }, [socketClient, setHexagonHit, setTeleportPowerUps, setFloorResetPowerUps]);

  const handleHexagonHit = (hexagonKey: string) => {
    // Update local state
    setHexagonHit((prev) => ({
      ...prev,
      [hexagonKey]: true,
    }));
    
    // Broadcast to all players (like Wawa Guys RPC.call)
    if (socketClient.isConnected()) {
      socketClient.emit('hexagonHit', { hexagonKey, lobbyId });
    }
  };

  const handleTeleportCollect = (hexagonKey: string) => {
    // Update local state
    setTeleportPowerUps((prev) => {
      const newSet = new Set(prev);
      newSet.add(hexagonKey);
      return newSet;
    });
    
    // Broadcast to all players
    if (socketClient.isConnected()) {
      socketClient.emit('teleportCollect', { hexagonKey, lobbyId });
    }
    
    // Trigger teleport effect
    onTeleportCollect(hexagonKey);
  };

  const handleFloorResetCollect = (hexagonKey: string) => {
    // Update local state
    setFloorResetPowerUps((prev) => {
      const newSet = new Set(prev);
      newSet.add(hexagonKey);
      return newSet;
    });
    
    // Broadcast to all players
    if (socketClient.isConnected()) {
      socketClient.emit('floorResetCollect', { hexagonKey, lobbyId });
    }
    
    // Trigger floor reset effect
    onFloorResetCollect(hexagonKey);
  };

  return (
    <group
      position-x={-((NB_COLUMNS - 1) / 2) * HEX_X_SPACING}
      position-z={-((NB_ROWS - 1) / 2) * HEX_Z_SPACING}
    >
      {/* HEXAGONS - exactly like Wawa Guys */}
      {floors.map((floor, floorIndex) => (
        <group key={floorIndex} position-y={floorIndex * -FLOOR_HEIGHT}>
          {[...Array(NB_ROWS)].map((_, rowIndex) => (
            <group
              key={rowIndex}
              position-z={rowIndex * HEX_Z_SPACING}
              position-x={rowIndex % 2 ? HEX_X_SPACING / 2 : 0}
            >
              {[...Array(NB_COLUMNS)].map((_, columnIndex) => {
                const hexagonKey = `${floorIndex}-${rowIndex}-${columnIndex}`;
                const teleportPowerUpKey = `teleport-${hexagonKey}`;
                const floorResetPowerUpKey = `floorreset-${hexagonKey}`;
                // Check if this hexagon should have power-ups (pre-determined random spawns on bottom floor)
                const hasTeleportPowerUp = powerUpSpawns.has(teleportPowerUpKey);
                const hasFloorResetPowerUp = floorResetSpawns.has(floorResetPowerUpKey);
                
                return (
                  <group key={columnIndex}>
                    <Hexagon
                      position={[columnIndex * HEX_X_SPACING, 0, 0]}
                      color={floor.color}
                      hit={hexagonHit[hexagonKey] || false}
                      onHit={() => handleHexagonHit(hexagonKey)}
                    />
                    {hasTeleportPowerUp && (
                      <TeleportPowerUp
                        position={[columnIndex * HEX_X_SPACING, 0, 0]}
                        onCollect={() => handleTeleportCollect(teleportPowerUpKey)}
                        collected={teleportPowerUps.has(teleportPowerUpKey)}
                      />
                    )}
                    {hasFloorResetPowerUp && (
                      <FloorResetPowerUp
                        position={[columnIndex * HEX_X_SPACING, 0, 0]}
                        onCollect={() => handleFloorResetCollect(floorResetPowerUpKey)}
                        collected={floorResetPowerUps.has(floorResetPowerUpKey)}
                      />
                    )}
                  </group>
                );
              })}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// Game state hook - like Wawa Guys useGameState
function useGameState(lobby: Lobby, address: string | null) {
  const [stage, setStage] = useState<'countdown' | 'playing' | 'winner' | 'lobby'>('playing'); // Start playing immediately
  const [playersAlive, setPlayersAlive] = useState<Set<string>>(new Set());
  const [playerPositions, setPlayerPositions] = useState<Map<string, { x: number; y: number; z: number }>>(new Map());
  const [playerDead, setPlayerDead] = useState<Set<string>>(new Set());
  const [eliminationOrder, setEliminationOrder] = useState<string[]>([]); // Track elimination order for top 3
  
  // Initialize players from lobby
  useEffect(() => {
    if (lobby.players) {
      const alive = new Set(lobby.players.map(p => p.walletAddress));
      setPlayersAlive(alive);
      
      // Initialize positions - spawn on random hexagons on top floor
      const positions = new Map<string, { x: number; y: number; z: number }>();
      
      // Calculate arena offset (same as GameArena)
      const arenaOffsetX = -((NB_COLUMNS - 1) / 2) * HEX_X_SPACING;
      const arenaOffsetZ = -((NB_ROWS - 1) / 2) * HEX_Z_SPACING;
      
      // Generate random spawn positions on top floor (floor 0)
      const usedPositions = new Set<string>();
      const spawnHeight = 15; // High above hexagons - players will fall immediately!
      
      lobby.players.forEach((player) => {
        let attempts = 0;
        let position: { x: number; y: number; z: number } | null = null;
        
        // Try to find an unused hexagon position
        while (attempts < 100 && !position) {
          const rowIndex = Math.floor(Math.random() * NB_ROWS);
          const columnIndex = Math.floor(Math.random() * NB_COLUMNS);
          const positionKey = `${rowIndex}-${columnIndex}`;
          
          if (!usedPositions.has(positionKey)) {
            usedPositions.add(positionKey);
            
            // Calculate hexagon position (same logic as GameArena)
            const rowOffsetX = rowIndex % 2 ? HEX_X_SPACING / 2 : 0;
            const x = arenaOffsetX + rowOffsetX + columnIndex * HEX_X_SPACING;
            const z = arenaOffsetZ + rowIndex * HEX_Z_SPACING;
            
            position = {
              x,
              y: spawnHeight,
              z
            };
          }
          attempts++;
        }
        
        // Fallback to grid if we couldn't find a random position
        if (!position) {
          const index = Array.from(positions.keys()).length;
          position = {
            x: arenaOffsetX + (index % NB_COLUMNS) * HEX_X_SPACING,
            y: spawnHeight,
            z: arenaOffsetZ + Math.floor(index / NB_COLUMNS) * HEX_Z_SPACING
          };
        }
        
        positions.set(player.walletAddress, position);
      });
      
      setPlayerPositions(positions);
    }
  }, [lobby.players]);
  
  // Game starts immediately - no countdown needed
  
  const eliminatePlayer = (walletAddress: string) => {
    setPlayersAlive(prev => {
      const newSet = new Set(prev);
      newSet.delete(walletAddress);
      return newSet;
    });
    setPlayerDead(prev => {
      const newSet = new Set(prev);
      newSet.add(walletAddress);
      return newSet;
    });
    // Track elimination order (last eliminated = better position)
    setEliminationOrder(prev => [...prev, walletAddress]);
  };
  
  const updatePlayerPosition = (walletAddress: string, position: { x: number; y: number; z: number }) => {
    setPlayerPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(walletAddress, position);
      return newMap;
    });
  };
  
  return {
    stage,
    setStage,
    players: lobby.players || [],
    playersAlive,
    playerPositions,
    playerDead,
    eliminatePlayer,
    updatePlayerPosition,
    eliminationOrder,
  };
}

// Experience component - EXACTLY like Wawa Guys
function Experience({ 
  lobby, 
  socketClient, 
  address, 
  onGameEnd,
  voiceChatRef,
  playerSpeaking,
  apiClient,
  onWinners
}: { 
  lobby: Lobby;
  socketClient: SocketClient;
  address: string | null;
  onGameEnd: (results: any[]) => void;
  voiceChatRef: React.MutableRefObject<VoiceChatService | null>;
  playerSpeaking: Map<string, boolean>;
  apiClient: ApiClient;
  onWinners?: (top3: Array<Top3Player>) => void;
}) {
  const { stage, players, playersAlive, playerPositions, playerDead, eliminatePlayer, updatePlayerPosition, setStage, eliminationOrder } = useGameState(lobby, address);
  const [hexagonHit, setHexagonHit] = useState<Record<string, boolean>>({});
  const [teleportPowerUps, setTeleportPowerUps] = useState<Set<string>>(new Set());
  const [floorResetPowerUps, setFloorResetPowerUps] = useState<Set<string>>(new Set());
  const [teleportTargets, setTeleportTargets] = useState<Map<string, { x: number; y: number; z: number }>>(new Map());
  const [powerUpSpawns, setPowerUpSpawns] = useState<Set<string>>(new Set());
  const [floorResetSpawns, setFloorResetSpawns] = useState<Set<string>>(new Set());
  const [floors, setFloors] = useState<Array<{ color: string }>>(() => generateRandomFloors());
  const [top3Players, setTop3Players] = useState<Array<Top3Player>>([]);
  const [resultsRecorded, setResultsRecorded] = useState(false);
  const submittingResultsRef = useRef(false); // Prevent concurrent submissions
  const { camera } = useThree();
  const firstNonDeadPlayer = players.find((p) => !playerDead.has(p.walletAddress));
  
  // Generate super rare random power-up spawns when game starts
  useEffect(() => {
    if (stage === 'playing' && powerUpSpawns.size === 0 && floorResetSpawns.size === 0) {
      const teleportSpawns = new Set<string>();
      const resetSpawns = new Set<string>();
      const bottomFloorIndex = floors.length - 1; // Bottom floor (last floor)
      
      // Super rare: spawn power-ups randomly across the bottom floor
      // Use lobby ID as seed for consistent randomness per game
      const seed = lobby.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      let randomState = seed;
      
      // Simple PRNG function
      const random = () => {
        randomState = (randomState * 9301 + 49297) % 233280;
        return randomState / 233280;
      };
      
      // Spawn 1-3 teleport power-ups (super rare!) on bottom floor for recovery
      const numTeleportPowerUps = Math.floor(random() * 3) + 1; // 1-3 power-ups
      
      for (let i = 0; i < numTeleportPowerUps; i++) {
        // Pick a random hexagon on bottom floor
        const rowIndex = Math.floor(random() * NB_ROWS);
        const columnIndex = Math.floor(random() * NB_COLUMNS);
        const hexagonKey = `${bottomFloorIndex}-${rowIndex}-${columnIndex}`;
        const powerUpKey = `teleport-${hexagonKey}`;
        teleportSpawns.add(powerUpKey);
      }
      
      // Spawn 1 floor reset power-up (even rarer!) on bottom floor
      const rowIndex = Math.floor(random() * NB_ROWS);
      const columnIndex = Math.floor(random() * NB_COLUMNS);
      const hexagonKey = `${bottomFloorIndex}-${rowIndex}-${columnIndex}`;
      const resetPowerUpKey = `floorreset-${hexagonKey}`;
      resetSpawns.add(resetPowerUpKey);
      
      setPowerUpSpawns(teleportSpawns);
      setFloorResetSpawns(resetSpawns);
      console.log(`[FallGuysGame3D] 🌀 Generated ${teleportSpawns.size} teleport power-ups and ${resetSpawns.size} floor reset power-up on bottom floor`);
    }
  }, [stage, lobby.id, floors.length]);
  
  // Initialize camera position (third-person follow camera like waiting lobby)
  useEffect(() => {
    if (address) {
      // Third-person: camera starts closer behind spawn position
      camera.position.set(0, 3, 4); // Closer behind and above spawn
      camera.lookAt(0, 1.5, 0);
    } else {
      // Spectator: orbit camera
      camera.position.set(0, 10, 15);
      camera.lookAt(0, 3, 0);
    }
  }, [camera, address]);
  
  // Check for winner (last man standing) and calculate top 3
  useEffect(() => {
    if (stage === 'playing' && playersAlive.size === 1) {
      const winnerAddress = Array.from(playersAlive)[0];
      const winnerPlayer = players.find(p => p.walletAddress === winnerAddress);
      
      if (winnerPlayer) {
        // Calculate top 3: winner (1st), last eliminated (2nd), second-to-last eliminated (3rd)
        const top3: Array<Top3Player> = [];
        
        // 1st place: Winner (last man standing)
        top3.push({
          walletAddress: winnerAddress,
          username: winnerPlayer.username,
          avatarUrl: winnerPlayer.avatarUrl,
          color: '#FFD700', // Gold
          position: 1
        });
        
        // 2nd place: Last eliminated
        if (eliminationOrder.length > 0) {
          const secondPlaceAddress = eliminationOrder[eliminationOrder.length - 1];
          const secondPlacePlayer = players.find(p => p.walletAddress === secondPlaceAddress);
          if (secondPlacePlayer) {
            top3.push({
              walletAddress: secondPlaceAddress,
              username: secondPlacePlayer.username,
              avatarUrl: secondPlacePlayer.avatarUrl,
              color: '#C0C0C0', // Silver
              position: 2
            });
          }
        }
        
        // 3rd place: Second-to-last eliminated
        if (eliminationOrder.length > 1) {
          const thirdPlaceAddress = eliminationOrder[eliminationOrder.length - 2];
          const thirdPlacePlayer = players.find(p => p.walletAddress === thirdPlaceAddress);
          if (thirdPlacePlayer) {
            top3.push({
              walletAddress: thirdPlaceAddress,
              username: thirdPlacePlayer.username,
              avatarUrl: thirdPlacePlayer.avatarUrl,
              color: '#CD7F32', // Bronze
              position: 3
            });
          }
        }
        
        setTop3Players(top3);
        setStage('winner');
        // Notify parent component about winners
        if (onWinners) {
          onWinners(top3);
        }
        
        // Calculate positions for all players
        // Winner = 1, then elimination order determines positions (last eliminated = 2nd, etc.)
        const results = players.map((player) => {
          let position: number;
          if (player.walletAddress === winnerAddress) {
            position = 1;
          } else {
            // Find position in elimination order (reversed - last eliminated = 2nd place)
            const elimIndex = eliminationOrder.indexOf(player.walletAddress);
            if (elimIndex === -1) {
              // Player wasn't eliminated (shouldn't happen, but fallback)
              position = players.length;
            } else {
              // Last eliminated = 2nd place, second-to-last = 3rd, etc.
              position = players.length - elimIndex;
            }
          }
          
          return {
            walletAddress: player.walletAddress,
            username: player.username,
            position,
            score: position === 1 ? 1 : 0,
            team: position === 1 ? 'blue' : 'red',
            won: position === 1,
          };
        });
        
        // Record round immediately when podium appears
        // Use both state and ref to prevent duplicate submissions
        if (!resultsRecorded && !submittingResultsRef.current) {
          setResultsRecorded(true);
          submittingResultsRef.current = true;
          
          // Submit results to backend
          (async () => {
            try {
              const backendResults = results.map(r => ({
                walletAddress: r.walletAddress,
                team: r.position === 1 ? 'blue' : 'red',
                score: r.position === 1 ? 1 : 0,
                won: r.position === 1,
              }));
              
              await apiClient.submitLobbyResults(lobby.id, backendResults);
              console.log('[FallGuysGame3D] ✅ Round recorded and EXP awarded');
            } catch (error) {
              console.error('[FallGuysGame3D] Failed to record round:', error);
              // Reset flags on error so retry is possible
              setResultsRecorded(false);
              submittingResultsRef.current = false;
            }
          })();
        }
      }
    }
  }, [playersAlive, stage, players, setStage, eliminationOrder, apiClient, lobby.id, onWinners]);
  
  const playerColors = ['#FF6B6B', '#4ECDC4', '#95E1D3', '#FFA07A', '#98D8C8'];
  
  const handleFloorResetCollect = (powerUpKey: string) => {
    if (!address) return;
    
    console.log('[FallGuysGame3D] 🌍 Floor reset power-up collected! Regenerating floors and respawning players...');
    
    // Generate new random floors
    const newFloors = generateRandomFloors();
    setFloors(newFloors);
    
    // Clear all hexagon hits (reset the floor state)
    setHexagonHit({});
    
    // Reset all player positions to top floor
    const arenaOffsetX = -((NB_COLUMNS - 1) / 2) * HEX_X_SPACING;
    const arenaOffsetZ = -((NB_ROWS - 1) / 2) * HEX_Z_SPACING;
    const spawnHeight = 15; // High above hexagons
    
    const newPositions = new Map<string, { x: number; y: number; z: number }>();
    const usedPositions = new Set<string>();
    
    // Respawn all alive players randomly on top floor
    players.forEach((player) => {
      if (playerDead.has(player.walletAddress)) {
        // Keep dead players where they are
        const currentPos = playerPositions.get(player.walletAddress);
        if (currentPos) {
          newPositions.set(player.walletAddress, currentPos);
        }
        return;
      }
      
      let attempts = 0;
      let position: { x: number; y: number; z: number } | null = null;
      
      while (attempts < 100 && !position) {
        const rowIndex = Math.floor(Math.random() * NB_ROWS);
        const columnIndex = Math.floor(Math.random() * NB_COLUMNS);
        const positionKey = `${rowIndex}-${columnIndex}`;
        
        if (!usedPositions.has(positionKey)) {
          usedPositions.add(positionKey);
          
          const rowOffsetX = rowIndex % 2 ? HEX_X_SPACING / 2 : 0;
          const x = arenaOffsetX + rowOffsetX + columnIndex * HEX_X_SPACING;
          const z = arenaOffsetZ + rowIndex * HEX_Z_SPACING;
          
          position = {
            x,
            y: spawnHeight,
            z
          };
        }
        attempts++;
      }
      
      if (position) {
        newPositions.set(player.walletAddress, position);
        // Update position for all players (will trigger respawn)
        updatePlayerPosition(player.walletAddress, position);
        
        // For local player, also set teleport target to force immediate respawn
        if (player.walletAddress === address) {
          setTeleportTargets(prev => {
            const newMap = new Map(prev);
            newMap.set(address, position!);
            return newMap;
          });
          
          setTimeout(() => {
            setTeleportTargets(prev => {
              const newMap = new Map(prev);
              newMap.delete(address);
              return newMap;
            });
          }, 100);
        }
      }
    });
    
    // Broadcast floor reset to all players
    if (socketClient.isConnected()) {
      socketClient.emit('floorReset', {
        lobbyId: lobby.id,
        newFloors: newFloors.map(f => f.color)
      });
    }
  };

  const handleTeleportCollect = (powerUpKey: string) => {
    if (!address) return;
    
    // Find a random alive player (not yourself)
    const alivePlayers = players.filter(p => 
      p.walletAddress !== address && !playerDead.has(p.walletAddress)
    );
    
    if (alivePlayers.length > 0) {
      const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const targetPosition = playerPositions.get(targetPlayer.walletAddress);
      
      if (targetPosition) {
        // Teleport to target player's position (slightly above to avoid collision)
        const teleportPosition = {
          x: targetPosition.x,
          y: targetPosition.y + 2,
          z: targetPosition.z
        };
        
        // Update position in state (this will trigger PlayerCharacter to update RigidBody)
        updatePlayerPosition(address, teleportPosition);
        
        // Set teleport target for this player (triggers forcePosition update)
        setTeleportTargets(prev => {
          const newMap = new Map(prev);
          newMap.set(address, teleportPosition);
          return newMap;
        });
        
        // Clear teleport target after a short delay (so it doesn't keep teleporting)
        setTimeout(() => {
          setTeleportTargets(prev => {
            const newMap = new Map(prev);
            newMap.delete(address);
            return newMap;
          });
        }, 100);
        
        // Also emit teleport event to socket so other players see it
        if (socketClient.isConnected()) {
          socketClient.emit('playerTeleport', {
            walletAddress: address,
            position: teleportPosition,
            lobbyId: lobby.id
          });
        }
        
        console.log('[FallGuysGame3D] 🌀 Teleported to player:', targetPlayer.username || targetPlayer.walletAddress);
      }
    }
  };

  const handlePositionUpdate = (walletAddress: string, pos: { x: number; y: number; z: number }) => {
    updatePlayerPosition(walletAddress, pos);
    
    // Check if player fell below elimination zone (below lowest floor)
    // Lowest floor is at -40 (4 floors * -10), so eliminate if below -45
    if (pos.y < -45 && !playerDead.has(walletAddress)) {
      console.log('[FallGuysGame3D] Player eliminated:', walletAddress, 'fell to', pos.y);
      eliminatePlayer(walletAddress);
    }
    
    // Send position to socket
    if (socketClient.isConnected() && walletAddress === address) {
      socketClient.sendPlayerPosition(lobby.id, {
        walletAddress: address,
        x: pos.x * 10,
        y: pos.z * 10,
        velocityX: 0,
        velocityY: 0,
        isGrounded: true,
        facing: 'right',
      });
    }
  };

  return (
    <>
      {/* Orbit controls disabled for local player (camera follows character automatically) */}
      {/* Only show orbit controls for spectators */}
      {!address && (
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          minDistance={8}
          maxDistance={40}
          target={[0, 3, 0]}
          dampingFactor={0.05}
        />
      )}
      <Environment files="/hdrs/medieval_cafe_1k.hdr" />
      
      {/* No countdown - game starts immediately */}
      
      {stage === 'winner' && top3Players.length > 0 ? (
        <Podium top3Players={top3Players} />
      ) : (
        <Physics 
          gravity={[0, -25, 0]}
          timeStep="vary"
        >
          {/* No ground - players lose when they fall! */}
          
          {stage !== 'lobby' && (
            <GameArena 
              hexagonHit={hexagonHit} 
              setHexagonHit={setHexagonHit}
              socketClient={socketClient}
              lobbyId={lobby.id}
              teleportPowerUps={teleportPowerUps}
              setTeleportPowerUps={setTeleportPowerUps}
              onTeleportCollect={handleTeleportCollect}
              powerUpSpawns={powerUpSpawns}
              floorResetPowerUps={floorResetPowerUps}
              setFloorResetPowerUps={setFloorResetPowerUps}
              onFloorResetCollect={handleFloorResetCollect}
              floorResetSpawns={floorResetSpawns}
              floors={floors}
            />
          )}
          
          {players.map((player, index) => {
            const position = playerPositions.get(player.walletAddress) || { x: 0, y: 2, z: 0 };
            const isDead = playerDead.has(player.walletAddress);
            const isLocal = player.walletAddress === address;
            
            // Debug logging
            if (isLocal) {
              console.log('[FallGuysGame3D] Rendering local player:', {
                stage,
                isDead,
                position,
                gameStage: stage
              });
            }
            
            // Get teleport target if this player just teleported
            const teleportTarget = teleportTargets.get(player.walletAddress);
            
            return (
              <PlayerCharacter
                key={player.walletAddress}
                username={player.username}
                color={playerColors[index % playerColors.length]}
                avatarUrl={player.avatarUrl}
                isLocal={isLocal}
                position={[position.x, position.y, position.z]}
                onPositionUpdate={(pos) => handlePositionUpdate(player.walletAddress, pos)}
                dead={isDead}
                gameStage={stage}
                forcePosition={teleportTarget}
              />
            );
          })}
        </Physics>
      )}
    </>
  );
}

function Scene({ 
  lobby, 
  socketClient, 
  address, 
  onGameEnd,
  voiceChatRef,
  playerSpeaking,
  apiClient,
  onWinners
}: { 
  lobby: Lobby;
  socketClient: SocketClient;
  address: string | null;
  onGameEnd: (results: any[]) => void;
  voiceChatRef: React.MutableRefObject<VoiceChatService | null>;
  playerSpeaking: Map<string, boolean>;
  apiClient: ApiClient;
  onWinners?: (top3: Array<Top3Player>) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow />
      
      <Experience
        lobby={lobby}
        socketClient={socketClient}
        address={address}
        onGameEnd={onGameEnd}
        voiceChatRef={voiceChatRef}
        playerSpeaking={playerSpeaking}
        apiClient={apiClient}
        onWinners={onWinners}
      />
    </>
  );
}

export function FallGuysGame3D({ lobby, socketClient, onGameEnd, apiClient }: FallGuysGame3DProps) {
  const { address } = useWallet();
  const voiceChatRef = useRef<VoiceChatService | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [top3Players, setTop3Players] = useState<Array<Top3Player>>([]);
  const [showWinners, setShowWinners] = useState(false);
  
  // Auto-focus canvas container on mount for keyboard input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (canvasContainerRef.current) {
        canvasContainerRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);
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

  // Initialize voice chat service
  useEffect(() => {
    if (!address || !isVoiceEnabled) return;

    const voiceChat = new VoiceChatService();
    voiceChatRef.current = voiceChat;

    voiceChat.initialize().then(() => {
      console.log('[FallGuysGame3D] Voice chat initialized');
    }).catch(err => {
      console.error('[FallGuysGame3D] Failed to initialize voice chat:', err);
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
    if (!isVoiceEnabled || !voiceChatRef.current || !address) return;

    const voiceChat = voiceChatRef.current;
    const otherPlayers = (lobby.players || []).filter(p => p.walletAddress !== address);

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
        console.error('[FallGuysGame3D] Failed to create offer:', err);
      }
    });

    // Handle WebRTC signaling
    const handleWebRTCOffer = (data: { fromAddress: string; offer: RTCSessionDescriptionInit }) => {
      if (data.fromAddress === address) return;
      
      const peerConnection = peerConnectionsRef.current.get(data.fromAddress);
      if (!peerConnection) {
        const newPeerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        const localStream = voiceChatRef.current?.getLocalStream();
        if (localStream) {
          localStream.getTracks().forEach(track => {
            newPeerConnection.addTrack(track, localStream);
          });
        }

        newPeerConnection.ontrack = (event) => {
          const remoteStream = event.streams[0];
          if (!remoteAudioRefs.current.has(data.fromAddress)) {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.autoplay = true;
            remoteAudioRefs.current.set(data.fromAddress, audio);
          }
        };

        peerConnectionsRef.current.set(data.fromAddress, newPeerConnection);
        newPeerConnection.setRemoteDescription(data.offer).then(() => {
          return newPeerConnection.createAnswer();
        }).then(answer => {
          return newPeerConnection.setLocalDescription(answer);
        }).then(() => {
          socketClient.sendWebRTCAnswer(lobby.id, data.fromAddress, newPeerConnection.localDescription!);
        }).catch(err => {
          console.error('[FallGuysGame3D] Failed to handle offer:', err);
        });
      }
    };

    const handleWebRTCAnswer = (data: { fromAddress: string; answer: RTCSessionDescriptionInit }) => {
      const peerConnection = peerConnectionsRef.current.get(data.fromAddress);
      if (peerConnection) {
        peerConnection.setRemoteDescription(data.answer).catch(err => {
          console.error('[FallGuysGame3D] Failed to set remote description:', err);
        });
      }
    };

    const handleWebRTCIce = (data: { fromAddress: string; candidate: RTCIceCandidateInit }) => {
      const peerConnection = peerConnectionsRef.current.get(data.fromAddress);
      if (peerConnection && data.candidate) {
        peerConnection.addIceCandidate(data.candidate).catch(err => {
          console.error('[FallGuysGame3D] Failed to add ICE candidate:', err);
        });
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

  return (
    <div className="fall-guys-game-3d">
      <div 
        ref={canvasContainerRef}
        onClick={(e) => {
          // Focus canvas on click to ensure keyboard events work
          const canvas = e.currentTarget.querySelector('canvas');
          if (canvas) {
            canvas.focus();
          }
        }}
        tabIndex={0}
        style={{ width: '100%', height: '100%' }}
      >
        <Canvas 
          shadows 
          camera={{ position: [0, 12, 18], fov: 60 }} 
          tabIndex={0}
          gl={{ 
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
            antialias: true,
            stencil: false,
            depth: true
          }}
          onCreated={(state) => {
            // Handle WebGL context loss
            state.gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.error('[FallGuysGame3D] WebGL context lost!');
            });
            state.gl.domElement.addEventListener('webglcontextrestored', () => {
              console.log('[FallGuysGame3D] WebGL context restored!');
            });
          }}
        >
        <Scene
          lobby={lobby}
          socketClient={socketClient}
          address={address}
          onGameEnd={onGameEnd}
          voiceChatRef={voiceChatRef}
          playerSpeaking={playerSpeaking}
          apiClient={apiClient}
          onWinners={(top3) => {
            setTop3Players(top3);
            setShowWinners(true);
          }}
        />
      </Canvas>
      </div>
      
      {/* Winners Banner - Fixed to bottom */}
      {showWinners && top3Players.length > 0 && (
        <div className="winners-banner">
          <div className="winners-banner-content">
            <div className="winners-banner-title">🏆 Winners 🏆</div>
            <div className="winners-banner-list">
              {top3Players.map((player) => (
                <div key={player.walletAddress} className={`winners-banner-card rank-${player.position}`}>
                  <div className="winners-banner-rank-badge">
                    {player.position === 1 && '🥇'}
                    {player.position === 2 && '🥈'}
                    {player.position === 3 && '🥉'}
                  </div>
                  <div className="winners-banner-info">
                    <div className="winners-banner-name">{player.username || 'Anonymous'}</div>
                    <div className="winners-banner-position">#{player.position} Place</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Voice chat controls overlay */}
      <div className="fall-guys-voice-controls">
        <button
          onClick={() => {
            const newValue = !isVoiceEnabled;
            setIsVoiceEnabled(newValue);
            localStorage.setItem(`voice_settings_${address}`, JSON.stringify({
              enabled: newValue,
              pushToTalkKey,
            }));
          }}
          className={`voice-toggle-btn ${isVoiceEnabled ? 'active' : ''}`}
        >
          {isVoiceEnabled ? '🎤 Voice ON' : '🔇 Voice OFF'}
        </button>
        {isVoiceEnabled && (
          <div className="voice-status-indicator">
            <div className={`voice-pulse ${isPushingToTalk ? 'active' : ''}`}></div>
            <span>Hold <kbd>{pushToTalkKey.toUpperCase()}</kbd> to talk</span>
          </div>
        )}
      </div>
    </div>
  );
}
