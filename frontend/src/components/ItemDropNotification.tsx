import { useEffect, useState } from 'react';
import type { GameItem } from '@solana-defender/shared';
import './ItemDropNotification.css';

interface ItemDropNotificationProps {
  item: GameItem | null;
  onClose: () => void;
}

export function ItemDropNotification({ item, onClose }: ItemDropNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (item) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [item, onClose]);

  if (!item || !visible) return null;

  const rarityColors = {
    common: '#ffffff',
    rare: '#00ffff',
    epic: '#ff00ff',
    legendary: '#ffd700',
  };

  return (
    <div className={`item-drop-notification ${item.rarity}`}>
      <div className="item-drop-content">
        <div className="item-icon">✨</div>
        <div className="item-info">
          <div className="item-name">{item.name}</div>
          <div className="item-rarity" style={{ color: rarityColors[item.rarity as keyof typeof rarityColors] }}>
            {item.rarity.toUpperCase()}
          </div>
          <div className="item-description">{item.description}</div>
        </div>
        <button onClick={() => { setVisible(false); onClose(); }} className="close-btn">×</button>
      </div>
    </div>
  );
}

