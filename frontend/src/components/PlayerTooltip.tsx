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

  const updateTooltipPosition = useCallback(() => {
    if (!showTooltip || !tooltipRef.current || !triggerRef.current) return;

    const tooltip = tooltipRef.current;
    const trigger = triggerRef.current;
    const rect = trigger.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight || 200; // Fallback height
    const tooltipWidth = tooltip.offsetWidth || 250; // Fallback width
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 10;
    
    // Calculate preferred position (above, centered)
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    let top = rect.top - tooltipHeight - 8;

    // Adjust horizontal position if tooltip goes off screen
    if (left < padding) {
      left = padding;
    } else if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }

    // Adjust vertical position - check if tooltip fits above
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    
    if (spaceAbove >= tooltipHeight + 8) {
      // Enough space above - position above
      top = rect.top - tooltipHeight - 8;
    } else if (spaceBelow >= tooltipHeight + 8) {
      // Not enough space above, but enough below - position below
      top = rect.bottom + 8;
    } else {
      // Not enough space either way - position where it fits best
      if (spaceBelow > spaceAbove) {
        // More space below, position below but constrain to viewport
        top = rect.bottom + 8;
        if (top + tooltipHeight > viewportHeight - padding) {
          top = viewportHeight - tooltipHeight - padding;
        }
      } else {
        // More space above, position above but constrain to viewport
        top = rect.top - tooltipHeight - 8;
        if (top < padding) {
          top = padding;
        }
      }
    }

    setTooltipPosition({ top, left });
  }, [showTooltip]);

  const handleMouseMove = (e: React.MouseEvent) => {
    updateTooltipPosition();
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

