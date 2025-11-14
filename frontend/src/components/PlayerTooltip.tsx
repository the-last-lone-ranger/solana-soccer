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
    if (!showTooltip || !tooltipRef.current || !triggerRef.current) return;

    const tooltip = tooltipRef.current;
    const trigger = triggerRef.current;
    
    // Get bounding rect from trigger or its first child (for display: contents)
    let rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && trigger.firstElementChild) {
      rect = trigger.firstElementChild.getBoundingClientRect();
    }
    
    // If still no valid rect, try to find the actual element
    if (rect.width === 0 && rect.height === 0) {
      const child = trigger.querySelector('img, .player-avatar, .player-avatar-modern, .player-badge');
      if (child) {
        rect = child.getBoundingClientRect();
      }
    }
    
    const tooltipHeight = tooltip.offsetHeight || 300; // Fallback height
    const tooltipWidth = tooltip.offsetWidth || 320; // Fallback width
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 12;
    const gap = 8; // Gap between trigger and tooltip
    
    // Default: position to the right of the avatar
    let left = rect.right + gap;
    let top = rect.top;
    
    // If tooltip goes off right edge, position to the left
    if (left + tooltipWidth > viewportWidth - padding) {
      left = rect.left - tooltipWidth - gap;
    }
    
    // If still off screen on left, center it horizontally
    if (left < padding) {
      left = Math.max(padding, rect.left + (rect.width / 2) - (tooltipWidth / 2));
    }
    
    // Adjust vertical position to keep tooltip in viewport
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    
    // Try to align top with avatar, but adjust if needed
    if (top + tooltipHeight > viewportHeight - padding) {
      // Tooltip would go below viewport, move it up
      top = viewportHeight - tooltipHeight - padding;
    }
    
    if (top < padding) {
      // Tooltip would go above viewport, move it down
      top = padding;
    }
    
    // Ensure tooltip doesn't go off screen horizontally
    if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setTooltipPosition({ top, left });
  }, [showTooltip]);

  const handleMouseMove = (e: React.MouseEvent) => {
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
      // Small delay to ensure tooltip is rendered and has dimensions
      const timer = setTimeout(() => {
        updateTooltipPosition();
      }, 10);
      return () => clearTimeout(timer);
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

