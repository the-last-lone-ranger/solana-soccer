import { useEffect, useState, useRef, useCallback } from 'react';
import { ApiClient } from '../services/api.js';
import './Inventory.css';

interface ItemStats {
  attack?: number;
  defense?: number;
  speed?: number;
  health?: number;
  critChance?: number;
  critDamage?: number;
}

interface InventoryItem {
  id: number;
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
  equipped: boolean;
  foundAt: string;
  stats?: ItemStats;
}

interface InventoryProps {
  apiClient: ApiClient;
}

export function Inventory({ apiClient }: InventoryProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<number | null>(null);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use getPlayerItems to get items with stats (no walletAddress = current user)
      const data = await apiClient.getPlayerItems();
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleEquip = async (itemId: string, itemType: string) => {
    try {
      setEquipping(parseInt(itemId));
      setError(null);
      await apiClient.equipItem(itemId, itemType);
      await loadInventory(); // Reload to update equipped status
    } catch (err: any) {
      setError(err.message || 'Failed to equip item');
    } finally {
      setEquipping(null);
    }
  };

  const handleUnequip = async (itemId: string, itemType: string) => {
    try {
      setEquipping(parseInt(itemId));
      setError(null);
      await apiClient.unequipItem(itemId, itemType);
      await loadInventory(); // Reload to update equipped status
    } catch (err: any) {
      setError(err.message || 'Failed to unequip item');
    } finally {
      setEquipping(null);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'common':
        return '#9ca3af';
      case 'rare':
        return '#3b82f6';
      case 'epic':
        return '#a855f7';
      case 'legendary':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const renderItemStats = (stats?: ItemStats) => {
    if (!stats || Object.keys(stats).length === 0) return null;

    const statLabels: Record<string, string> = {
      attack: '⚔️ Attack',
      defense: '🛡️ Defense',
      speed: '⚡ Speed',
      health: '❤️ Health',
      critChance: '🎯 Crit Chance',
      critDamage: '💥 Crit Damage',
    };

    return (
      <div className="item-stats">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key} className="item-stat">
            <span className="stat-label">{statLabels[key] || key}:</span>
            <span className="stat-value">+{value}</span>
          </div>
        ))}
      </div>
    );
  };

  // Item Tooltip Component
  const ItemTooltip = ({ item, rarityColor, children }: {
    item: InventoryItem;
    rarityColor: (rarity: string) => string;
    children: React.ReactNode;
  }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const timeoutRef = useRef<number | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setShowTooltip(true);
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
      const tooltipHeight = tooltip.offsetHeight || 200;
      const tooltipWidth = tooltip.offsetWidth || 250;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const padding = 10;
      
      let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      let top = rect.top - tooltipHeight - 8;

      if (left < padding) {
        left = padding;
      } else if (left + tooltipWidth > viewportWidth - padding) {
        left = viewportWidth - tooltipWidth - padding;
      }

      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;
      
      if (spaceAbove >= tooltipHeight + 8) {
        top = rect.top - tooltipHeight - 8;
      } else if (spaceBelow >= tooltipHeight + 8) {
        top = rect.bottom + 8;
      } else {
        if (spaceBelow > spaceAbove) {
          top = rect.bottom + 8;
          if (top + tooltipHeight > viewportHeight - padding) {
            top = viewportHeight - tooltipHeight - padding;
          }
        } else {
          top = rect.top - tooltipHeight - 8;
          if (top < padding) {
            top = padding;
          }
        }
      }

      setTooltipPosition({ top, left });
    }, [showTooltip]);

    const handleMouseMove = () => {
      updateTooltipPosition();
    };

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (showTooltip) {
        const timer = setTimeout(() => {
          updateTooltipPosition();
        }, 10);
        return () => clearTimeout(timer);
      }
    }, [showTooltip, updateTooltipPosition]);

    return (
      <div
        ref={triggerRef}
        className="item-tooltip-trigger"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {children}
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="item-tooltip"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
            }}
          >
            <div className="item-tooltip-header">
              <span className="item-tooltip-item-name">{item.itemName}</span>
              <span
                className="item-tooltip-rarity"
                style={{ color: rarityColor(item.rarity) }}
              >
                {item.rarity}
              </span>
            </div>
            <div className="item-tooltip-type">{item.itemType}</div>
            {item.equipped && (
              <div className="item-tooltip-equipped">✓ Equipped</div>
            )}
            {item.stats && Object.keys(item.stats).length > 0 && (
              <div className="item-tooltip-stats">
                {Object.entries(item.stats).map(([key, value]) => {
                  const statLabels: Record<string, string> = {
                    attack: '⚔️ Attack',
                    defense: '🛡️ Defense',
                    speed: '⚡ Speed',
                    health: '❤️ Health',
                    critChance: '🎯 Crit Chance',
                    critDamage: '💥 Crit Damage',
                  };
                  return (
                    <div key={key} className="item-tooltip-stat">
                      <span className="stat-label">{statLabels[key] || key}:</span>
                      <span className="stat-value">+{value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="inventory">
        <div className="loading">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="inventory">
      <h2>🎒 Inventory</h2>
      {error && <div className="error-message">{error}</div>}
      
      {items.length === 0 ? (
        <div className="empty-inventory">
          <p>No items found yet. Play games to discover rare items!</p>
        </div>
      ) : (
        <div className="inventory-grid">
          {items.map((item) => (
            <ItemTooltip key={item.id} item={item} rarityColor={getRarityColor}>
              <div
                className={`inventory-item ${item.rarity.toLowerCase()} ${item.equipped ? 'equipped' : ''}`}
                style={{ '--rarity-color': getRarityColor(item.rarity) } as React.CSSProperties}
              >
                <div className="item-header">
                  <span className="item-name">{item.itemName}</span>
                  <span className="item-rarity">{item.rarity}</span>
                </div>
                <div className="item-type">{item.itemType}</div>
                {item.equipped && (
                  <div className="equipped-badge">✓ Equipped</div>
                )}
                {renderItemStats(item.stats)}
                <button
                  className={`equip-btn ${item.equipped ? 'unequip' : ''}`}
                  onClick={() =>
                    item.equipped
                      ? handleUnequip(item.itemId, item.itemType)
                      : handleEquip(item.itemId, item.itemType)
                  }
                  disabled={equipping === item.id}
                >
                  {equipping === item.id
                    ? '...'
                    : item.equipped
                    ? 'Unequip'
                    : 'Equip'}
                </button>
              </div>
            </ItemTooltip>
          ))}
        </div>
      )}
    </div>
  );
}

