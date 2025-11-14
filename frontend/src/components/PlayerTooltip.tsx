import { useState, useEffect, useRef } from 'react';
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

  const loadEquippedItems = async () => {
    if (loading || !apiClient) return;
    
    // Check if method exists
    if (typeof apiClient.getPlayerEquippedItems !== 'function') {
      console.error('apiClient.getPlayerEquippedItems is not a function', apiClient);
      return;
    }
    
    setLoading(true);
    try {
      const data = await apiClient.getPlayerEquippedItems(walletAddress);
      setEquippedItems(data.equipped);
      setHasCrown(data.hasCrown);
      setUsername(data.username);
    } catch (err) {
      console.error('Failed to load equipped items:', err);
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
      loadEquippedItems();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowTooltip(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!showTooltip || !tooltipRef.current || !triggerRef.current) return;

    const tooltip = tooltipRef.current;
    const trigger = triggerRef.current;
    const rect = trigger.getBoundingClientRect();
    
    // Position tooltip above the trigger, centered
    let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
    let top = rect.top - tooltip.offsetHeight - 8;

    // Adjust if tooltip goes off screen
    if (left < 10) left = 10;
    if (left + tooltip.offsetWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltip.offsetWidth - 10;
    }
    if (top < 10) {
      // Show below instead
      top = rect.bottom + 8;
    }

    setTooltipPosition({ top, left });
  };

  const getRarityColor = (rarity: string): string => {
    switch (rarity.toLowerCase()) {
      case 'common':
        return '#9b9a97';
      case 'uncommon':
        return '#4a9eff';
      case 'rare':
        return '#9d4edd';
      case 'epic':
        return '#f72585';
      case 'legendary':
        return '#ffd60a';
      default:
        return '#9b9a97';
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
          className="player-tooltip"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-username">
              {username || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
            </span>
            {hasCrown && <span className="crown-icon">👑</span>}
          </div>
          <div className="tooltip-content">
            {loading ? (
              <div className="tooltip-loading">Loading...</div>
            ) : equippedItems.length === 0 ? (
              <div className="tooltip-empty">No equipped items</div>
            ) : (
              <div className="tooltip-items">
                {equippedItems.map((item) => (
                  <div
                    key={item.id}
                    className="tooltip-item"
                    style={{
                      borderColor: getRarityColor(item.rarity),
                    }}
                  >
                    <span className="item-name">{item.itemName}</span>
                    <span
                      className="item-rarity"
                      style={{ color: getRarityColor(item.rarity) }}
                    >
                      {item.rarity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

