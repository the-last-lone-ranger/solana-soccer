import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../services/api.js';
import './PlayerTooltip.css';

interface EquippedItem {
  id: number;
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
}

interface PlayerTooltipProps {
  walletAddress: string;
  apiClient: ApiClient;
  children: React.ReactNode;
}

export function PlayerTooltip({ walletAddress, apiClient, children }: PlayerTooltipProps) {
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [hasCrown, setHasCrown] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const [playerStats, setPlayerStats] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadPlayerData = async () => {
    if (loading || !apiClient) return;
    
    setLoading(true);
    try {
      // Use getPlayerProfile to get full stats and equipped items
      if (typeof apiClient.getPlayerProfile === 'function') {
        const data = await apiClient.getPlayerProfile(walletAddress);
        setEquippedItems(data.equipped || []);
        setHasCrown(data.hasCrown || false);
        setUsername(data.username);
        setPlayerStats(data.stats);
        setAvatarUrl(data.avatarUrl);
      } else {
        // Fallback to getPlayerEquippedItems
        const data = await apiClient.getPlayerEquippedItems(walletAddress);
        setEquippedItems(data.equipped);
        setHasCrown(data.hasCrown);
        setUsername(data.username);
        setAvatarUrl(data.avatarUrl);
      }
    } catch (err) {
      console.error('Failed to load player data:', err);
      setEquippedItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set initial position immediately - ensure it's visible
    const viewportWidth = window.innerWidth;
    const padding = 20;
    const defaultWidth = 320;
    const calculatedLeft = Math.max(padding, viewportWidth - defaultWidth - padding);
    setTooltipPosition({ 
      top: padding, 
      left: calculatedLeft
    });
    
    // Small delay before showing tooltip
    timeoutRef.current = window.setTimeout(() => {
      setShowTooltip(true);
      loadPlayerData();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowTooltip(false);
  };

  const updateTooltipPosition = useCallback(() => {
    if (!showTooltip) return;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 20;
    const defaultWidth = 320;
    const defaultHeight = 400;
    
    // Simple fixed positioning: top-right corner
    // Calculate position that's guaranteed to be visible
    let tooltipWidth = defaultWidth;
    let tooltipHeight = defaultHeight;
    
    if (tooltipRef.current) {
      tooltipWidth = tooltipRef.current.offsetWidth || defaultWidth;
      tooltipHeight = tooltipRef.current.offsetHeight || defaultHeight;
    }
    
    // Position in top-right, ensuring it's always in viewport
    const top = padding;
    const left = Math.max(padding, Math.min(viewportWidth - tooltipWidth - padding, viewportWidth - defaultWidth - padding));
    const finalTop = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));
    const finalLeft = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));

    setTooltipPosition({ top: finalTop, left: finalLeft });
  }, [showTooltip]);

  const handleMouseMove = () => {
    // Just update position when mouse moves - simple fixed position
    updateTooltipPosition();
  };

  const getRarityColor = (rarity: string): string => {
    switch (rarity.toLowerCase()) {
      case 'common':
        return '#9d9d9d'; // WoW gray
      case 'uncommon':
        return '#1eff00'; // WoW green
      case 'rare':
        return '#0070dd'; // WoW blue
      case 'epic':
        return '#a335ee'; // WoW purple
      case 'legendary':
        return '#ff8000'; // WoW orange
      default:
        return '#9d9d9d';
    }
  };

  const getItemIcon = (itemType: string): string => {
    const icons: { [key: string]: string } = {
      'crown': '👑',
      'boots': '👢',
      'shoes': '👟',
      'gloves': '🧤',
      'helmet': '⛑️',
      'armor': '🛡️',
      'weapon': '⚔️',
      'accessory': '💍',
    };
    return icons[itemType.toLowerCase()] || '📦';
  };

  const getSlotName = (itemType: string): string => {
    const slots: { [key: string]: string } = {
      'crown': 'Head',
      'boots': 'Feet',
      'shoes': 'Feet',
      'gloves': 'Hands',
      'helmet': 'Head',
      'armor': 'Chest',
      'weapon': 'Main Hand',
      'accessory': 'Trinket',
    };
    return slots[itemType.toLowerCase()] || itemType;
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Update tooltip position when it becomes visible or content changes
  useEffect(() => {
    if (showTooltip) {
      // Update position immediately and after render
      updateTooltipPosition();
      
      // Update again after a short delay to account for content loading
      const timer = setTimeout(() => {
        updateTooltipPosition();
      }, 50);
      
      // Update on resize
      const handleResize = () => {
        updateTooltipPosition();
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [showTooltip, equippedItems, loading, updateTooltipPosition]);

  return (
    <div
      ref={triggerRef}
      className="player-tooltip-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="player-tooltip wow-inspection"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            opacity: 1,
            visibility: 'visible',
            display: 'block',
          }}
        >
          {/* Character Header */}
          <div className="wow-header">
            <div className="wow-character-info">
              {avatarUrl && (
                <div className="wow-avatar">
                  {avatarUrl.length <= 2 && /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(avatarUrl) ? (
                    <span className="wow-avatar-emoji">{avatarUrl}</span>
                  ) : (
                    <img src={avatarUrl} alt={username || ''} className="wow-avatar-img" />
                  )}
                </div>
              )}
              <div className="wow-name-section">
                <div className="wow-name-row">
                  <span className="wow-character-name">
                    {username || `${walletAddress.slice(0, 8)}...`}
                  </span>
                  {hasCrown && <span className="wow-crown">👑</span>}
                </div>
                <div className="wow-level">Level {playerStats ? Math.floor((playerStats.gamesPlayed || 0) / 10) + 1 : 1} Player</div>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          {playerStats && (
            <div className="wow-stats-section">
              <div className="wow-stat-row">
                <span className="wow-stat-label">Games Played</span>
                <span className="wow-stat-value">{playerStats.gamesPlayed || 0}</span>
              </div>
              <div className="wow-stat-row">
                <span className="wow-stat-label">High Score</span>
                <span className="wow-stat-value">{playerStats.highScore?.toLocaleString() || 0}</span>
              </div>
              <div className="wow-stat-row">
                <span className="wow-stat-label">Rounds Won</span>
                <span className="wow-stat-value">{playerStats.roundsWon || 0}</span>
              </div>
              {playerStats.totalSolWon > 0 && (
                <div className="wow-stat-row">
                  <span className="wow-stat-label">Total SOL Won</span>
                  <span className="wow-stat-value sol-value">{playerStats.totalSolWon.toFixed(2)} SOL</span>
                </div>
              )}
            </div>
          )}

          {/* Equipment Section */}
          <div className="wow-equipment-section">
            <div className="wow-section-title">Equipment</div>
            {loading ? (
              <div className="wow-loading">Inspecting character...</div>
            ) : equippedItems.length === 0 ? (
              <div className="wow-empty">No items equipped</div>
            ) : (
              <div className="wow-equipment-list">
                {equippedItems.map((item) => {
                  const rarityColor = getRarityColor(item.rarity);
                  return (
                    <div
                      key={item.id}
                      className="wow-equipment-item"
                      style={{ borderLeftColor: rarityColor }}
                    >
                      <div className="wow-item-header">
                        <span className="wow-item-icon">{getItemIcon(item.itemType)}</span>
                        <div className="wow-item-info">
                          <div className="wow-item-name-row">
                            <span
                              className="wow-item-name"
                              style={{ color: rarityColor }}
                            >
                              {item.itemName}
                            </span>
                          </div>
                          <div className="wow-item-slot">{getSlotName(item.itemType)}</div>
                        </div>
                      </div>
                      {item.stats && Object.keys(item.stats).length > 0 && (
                        <div className="wow-item-stats">
                          {Object.entries(item.stats).map(([key, value]: [string, any]) => (
                            <div key={key} className="wow-item-stat">
                              <span className="wow-stat-name">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="wow-stat-value">+{value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

