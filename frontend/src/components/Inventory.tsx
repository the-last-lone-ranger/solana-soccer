import { useEffect, useState } from 'react';
import { ApiClient } from '../services/api.js';
import './Inventory.css';

interface InventoryItem {
  id: number;
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
  equipped: boolean;
  foundAt: string;
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
      const profile = await apiClient.getProfile();
      setItems(profile.items || []);
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
            <div
              key={item.id}
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
          ))}
        </div>
      )}
    </div>
  );
}

