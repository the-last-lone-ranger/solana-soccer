import { useEffect, useState, useRef } from 'react';
import { ApiClient } from '../services/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import './PlayerProfile.css';

interface PlayerProfileProps {
  apiClient: ApiClient;
  walletAddress: string;
}

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

interface EquippedItem {
  id: number;
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
  stats?: ItemStats;
}

export function PlayerProfile({ apiClient, walletAddress }: PlayerProfileProps) {
  const { theme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [equipping, setEquipping] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Voice chat settings - load from profile
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState('v');
  const [editingPushToTalkKey, setEditingPushToTalkKey] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasLoaded) {
      const timer = setTimeout(() => {
        loadProfile();
        loadInventory();
        setHasLoaded(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getProfile();
      setProfile(data);
      setAvatarUrl(data.avatarUrl || '');
      
      // Load voice settings from profile
      if (data.voiceSettings) {
        setVoiceEnabled(data.voiceSettings.enabled || false);
        setPushToTalkKey(data.voiceSettings.pushToTalkKey || 'v');
        // Also sync to localStorage for backward compatibility
        localStorage.setItem(`voice_settings_${walletAddress}`, JSON.stringify({
          enabled: data.voiceSettings.enabled || false,
          pushToTalkKey: data.voiceSettings.pushToTalkKey || 'v',
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadInventory = async () => {
    try {
      // Pass walletAddress to get items for this specific player
      const data = await apiClient.getPlayerItems(walletAddress);
      setItems(data.items);
      setEquippedItems(data.equipped);
    } catch (err: any) {
      console.error('Failed to load inventory:', err);
    }
  };

  const handleAvatarChange = async () => {
    if (!avatarUrl.trim()) {
      setError('Please enter an avatar URL');
      return;
    }

    try {
      setSavingAvatar(true);
      setError(null);
      await apiClient.updateProfile(undefined, avatarUrl.trim());
      await loadProfile();
      setEditingAvatar(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // For now, we'll convert to data URL
    // In production, you'd upload to a storage service (IPFS, S3, etc.)
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      try {
        setSavingAvatar(true);
        setError(null);
        await apiClient.updateProfile(undefined, dataUrl);
        await loadProfile();
        setEditingAvatar(false);
      } catch (err: any) {
        setError(err.message || 'Failed to upload avatar');
      } finally {
        setSavingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEquip = async (itemId: string, itemType: string) => {
    try {
      setEquipping(itemId);
      setError(null);
      await apiClient.equipItem(itemId, itemType);
      await loadInventory();
    } catch (err: any) {
      setError(err.message || 'Failed to equip item');
    } finally {
      setEquipping(null);
    }
  };

  const handleUnequip = async (itemId: string) => {
    try {
      setEquipping(itemId);
      setError(null);
      await apiClient.unequipItem(itemId);
      await loadInventory();
    } catch (err: any) {
      setError(err.message || 'Failed to unequip item');
    } finally {
      setEquipping(null);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'common': return '#9ca3af';
      case 'rare': return '#3b82f6';
      case 'epic': return '#a855f7';
      case 'legendary': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getItemIcon = (itemType: string) => {
    switch (itemType.toLowerCase()) {
      case 'weapon': return '⚔️';
      case 'shield': return '🛡️';
      case 'crown': return '👑';
      case 'powerup': return '✨';
      case 'cosmetic': return '🎨';
      default: return '📦';
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

  // Equipment Slot Component
  const EquipmentSlot = ({ slot, item, rarityColor, onUnequip, equipping }: {
    slot: string;
    item?: EquippedItem;
    rarityColor: (rarity: string) => string;
    onUnequip: (itemId: string) => void;
    equipping: string | null;
  }) => {
    const slotLabels: Record<string, string> = {
      head: 'Head',
      shoulders: 'Shoulders',
      chest: 'Chest',
      legs: 'Legs',
      feet: 'Feet',
      hands: 'Hands',
      mainhand: 'Main Hand',
      offhand: 'Off Hand',
      trinket: 'Trinket',
    };

    return (
      <div className={`equipment-slot equipment-slot-${slot}`} title={slotLabels[slot] || slot}>
        {item ? (
          <div
            className={`equipped-item-slot ${item.rarity.toLowerCase()}`}
            style={{ '--rarity-color': rarityColor(item.rarity) } as React.CSSProperties}
            title={`${item.itemName} - ${item.rarity}`}
          >
            <div className="item-slot-icon">{getItemIcon(item.itemType)}</div>
            <div className="item-slot-glow" style={{ '--rarity-color': rarityColor(item.rarity) } as React.CSSProperties}></div>
            <button
              className="unequip-slot-btn"
              onClick={(e) => {
                e.stopPropagation();
                onUnequip(item.itemId);
              }}
              disabled={equipping === item.itemId}
              title="Unequip"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="empty-slot" title={`No ${slotLabels[slot] || slot} equipped`}>
            <div className="slot-icon-placeholder">+</div>
          </div>
        )}
      </div>
    );
  };

  const saveVoiceSettings = async () => {
    try {
      await apiClient.updateVoiceSettings(voiceEnabled, pushToTalkKey.toLowerCase());
      // Also save to localStorage for backward compatibility
      const settings = {
        enabled: voiceEnabled,
        pushToTalkKey: pushToTalkKey.toLowerCase(),
      };
      localStorage.setItem(`voice_settings_${walletAddress}`, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save voice settings:', err);
      // Fallback to localStorage if API fails
      const settings = {
        enabled: voiceEnabled,
        pushToTalkKey: pushToTalkKey.toLowerCase(),
      };
      localStorage.setItem(`voice_settings_${walletAddress}`, JSON.stringify(settings));
    }
  };

  const handleVoiceEnabledChange = async (enabled: boolean) => {
    setVoiceEnabled(enabled);
    try {
      await apiClient.updateVoiceSettings(enabled, pushToTalkKey.toLowerCase());
      // Also save to localStorage for backward compatibility
      const settings = {
        enabled,
        pushToTalkKey: pushToTalkKey.toLowerCase(),
      };
      localStorage.setItem(`voice_settings_${walletAddress}`, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save voice settings:', err);
      // Fallback to localStorage if API fails
      const settings = {
        enabled,
        pushToTalkKey: pushToTalkKey.toLowerCase(),
      };
      localStorage.setItem(`voice_settings_${walletAddress}`, JSON.stringify(settings));
    }
  };

  const handlePushToTalkKeyChange = (key: string) => {
    // Only allow single character keys
    if (key.length > 1) return;
    setPushToTalkKey(key.toLowerCase() || 'v');
  };

  const handleSavePushToTalkKey = () => {
    if (pushToTalkKey.length === 0) {
      setPushToTalkKey('v');
    }
    saveVoiceSettings();
    setEditingPushToTalkKey(false);
  };

  const handleKeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.toLowerCase();
    // Ignore modifier keys
    if (key === 'shift' || key === 'control' || key === 'alt' || key === 'meta') return;
    handlePushToTalkKeyChange(key);
  };

  if (loading) {
    return <div className="player-profile loading">Loading profile...</div>;
  }

  if (error && !profile) {
    return (
      <div className="player-profile error">
        <p>{error}</p>
        <button onClick={() => { loadProfile(); loadInventory(); }}>Retry</button>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className={`player-profile player-profile-${theme}`}>
      <div className="profile-header">
        <div className="avatar-section">
          <div className="avatar-container">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="profile-avatar" />
            ) : (
              <div className="profile-avatar-placeholder">
                {profile.username?.[0]?.toUpperCase() || walletAddress[0]?.toUpperCase() || '?'}
              </div>
            )}
            <button
              className="avatar-edit-btn"
              onClick={() => setEditingAvatar(!editingAvatar)}
              title="Change avatar"
            >
              ✏️
            </button>
          </div>
          {editingAvatar && (
            <div className="avatar-editor">
              <input
                type="text"
                placeholder="Enter image URL"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="avatar-url-input"
              />
              <div className="avatar-editor-actions">
                <button
                  onClick={handleAvatarChange}
                  disabled={savingAvatar}
                  className="save-avatar-btn"
                >
                  {savingAvatar ? 'Saving...' : 'Save URL'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={savingAvatar}
                  className="upload-avatar-btn"
                >
                  📁 Upload File
                </button>
                <button
                  onClick={() => {
                    setEditingAvatar(false);
                    setAvatarUrl(profile.avatarUrl || '');
                  }}
                  className="cancel-avatar-btn"
                >
                  Cancel
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>
        <div className="profile-title-section">
          <h2>{profile.username || walletAddress.slice(0, 8) + '...'}</h2>
          {profile.hasCrown && <div className="crown-badge">👑 THE CROWN</div>}
          {profile.isLeader && <div className="leader-badge">🏆 #1 LEADER</div>}
          
          {/* Wallet Information - Moved here, to the right of avatar */}
          <div className="wallet-section-inline">
            <div className="wallet-card-inline">
              <div className="wallet-label">💼 Connected Wallet</div>
              <div className="wallet-value" title={walletAddress}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            </div>
            {profile.inGameWalletAddress && (
              <div className="wallet-card-inline">
                <div className="wallet-label">💼 Deposit Address</div>
                <div className="wallet-value deposit-address" title={profile.inGameWalletAddress}>
                  {profile.inGameWalletAddress.slice(0, 6)}...{profile.inGameWalletAddress.slice(-4)}
                </div>
                <button
                  className="copy-address-btn-inline"
                  onClick={() => {
                    navigator.clipboard.writeText(profile.inGameWalletAddress);
                    alert('Deposit address copied to clipboard!');
                  }}
                >
                  📋 Copy
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Game Stats Section */}
      <div className="profile-stats-section">
        <h3>📊 Game Statistics</h3>
        <div className="profile-stats">
          <div className="stat-card">
            <div className="stat-label">Games Played</div>
            <div className="stat-value">{profile.stats?.gamesPlayed || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">High Score</div>
            <div className="stat-value">{profile.stats?.highScore?.toLocaleString() || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Score</div>
            <div className="stat-value">{profile.stats?.totalScore?.toLocaleString() || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Items Found</div>
            <div className="stat-value">{items.length}</div>
          </div>
        </div>
      </div>

      {/* WoW-Inspired Character Panel */}
      <div className="character-panel-section">
        <h3>⚔️ Character</h3>
        <div className="character-panel">
          <div className="character-avatar-container">
            {/* Character Avatar */}
            <div className="character-avatar-wrapper">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Character" className="character-avatar" />
              ) : (
                <div className="character-avatar-placeholder">
                  {profile.username?.[0]?.toUpperCase() || walletAddress[0]?.toUpperCase() || '?'}
                </div>
              )}
              
              {/* Equipment Slots positioned around avatar */}
              <div className="equipment-slots">
                {/* Head Slot (Crown) */}
                <EquipmentSlot
                  slot="head"
                  item={equippedItems.find(item => item.itemType === 'crown')}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Shoulders */}
                <EquipmentSlot
                  slot="shoulders"
                  item={equippedItems.find(item => item.itemType === 'cosmetic' && item.itemName.toLowerCase().includes('shoulder'))}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Chest */}
                <EquipmentSlot
                  slot="chest"
                  item={equippedItems.find(item => item.itemType === 'cosmetic' && (item.itemName.toLowerCase().includes('chest') || item.itemName.toLowerCase().includes('armor')))}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Legs */}
                <EquipmentSlot
                  slot="legs"
                  item={equippedItems.find(item => item.itemType === 'cosmetic' && item.itemName.toLowerCase().includes('leg'))}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Feet */}
                <EquipmentSlot
                  slot="feet"
                  item={equippedItems.find(item => item.itemType === 'cosmetic' && item.itemName.toLowerCase().includes('boot'))}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Hands */}
                <EquipmentSlot
                  slot="hands"
                  item={equippedItems.find(item => item.itemType === 'cosmetic' && item.itemName.toLowerCase().includes('glove'))}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Main Hand (Weapon) */}
                <EquipmentSlot
                  slot="mainhand"
                  item={equippedItems.find(item => item.itemType === 'weapon')}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Off Hand (Shield) */}
                <EquipmentSlot
                  slot="offhand"
                  item={equippedItems.find(item => item.itemType === 'shield')}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
                
                {/* Trinket (PowerUp) */}
                <EquipmentSlot
                  slot="trinket"
                  item={equippedItems.find(item => item.itemType === 'powerup')}
                  rarityColor={getRarityColor}
                  onUnequip={handleUnequip}
                  equipping={equipping}
                />
              </div>
            </div>
          </div>
          
          {/* Equipment List */}
          {equippedItems.length > 0 && (
            <div className="equipped-items-list">
              <h4>Equipped Items</h4>
              <div className="equipped-items-mini">
                {equippedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`equipped-item-mini ${item.rarity.toLowerCase()}`}
                    style={{ '--rarity-color': getRarityColor(item.rarity) } as React.CSSProperties}
                    title={`${item.itemName} - ${item.itemType} (${item.rarity})`}
                  >
                    <div className="item-icon-mini">{getItemIcon(item.itemType)}</div>
                    <div className="item-info-mini">
                      <div className="item-name-mini">{item.itemName}</div>
                      <div className="item-type-mini">{item.itemType}</div>
                      {renderItemStats(item.stats)}
                    </div>
                    <button
                      className="unequip-btn-mini"
                      onClick={() => handleUnequip(item.itemId)}
                      disabled={equipping === item.itemId}
                      title="Unequip"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="inventory-section">
        <h3>🎒 Full Inventory ({items.length})</h3>
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
                  {item.equipped && <span className="equipped-indicator">✓</span>}
                </div>
                <div className="item-type">{item.itemType}</div>
                <div className="item-rarity">{item.rarity}</div>
                <button
                  className={`equip-btn ${item.equipped ? 'unequip' : ''}`}
                  onClick={() =>
                    item.equipped
                      ? handleUnequip(item.itemId)
                      : handleEquip(item.itemId, item.itemType)
                  }
                  disabled={equipping === item.itemId}
                >
                  {equipping === item.itemId
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

      <div className="voice-settings-section">
        <h3>🎤 Voice Chat Settings</h3>
        <div className="voice-settings-content">
          <div className="setting-row">
            <div className="setting-label">
              <span>Enable Microphone</span>
              <span className="setting-description">Allow voice chat during gameplay</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => handleVoiceEnabledChange(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          
          {voiceEnabled && (
            <div className="setting-row">
              <div className="setting-label">
                <span>Push-to-Talk Key</span>
                <span className="setting-description">Hold this key to talk (default: V)</span>
              </div>
              <div className="push-to-talk-key-selector">
                {editingPushToTalkKey ? (
                  <>
                    <input
                      ref={keyInputRef}
                      type="text"
                      value={pushToTalkKey.toUpperCase()}
                      onChange={(e) => handlePushToTalkKeyChange(e.target.value)}
                      onKeyDown={handleKeyCapture}
                      onBlur={handleSavePushToTalkKey}
                      className="key-input"
                      maxLength={1}
                      autoFocus
                    />
                    <button
                      onClick={handleSavePushToTalkKey}
                      className="save-key-btn"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingPushToTalkKey(false);
                        const saved = localStorage.getItem(`voice_settings_${walletAddress}`);
                        if (saved) {
                          setPushToTalkKey(JSON.parse(saved).pushToTalkKey);
                        }
                      }}
                      className="cancel-key-btn"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <kbd className="key-display">{pushToTalkKey.toUpperCase()}</kbd>
                    <button
                      onClick={() => {
                        setEditingPushToTalkKey(true);
                        setTimeout(() => keyInputRef.current?.focus(), 0);
                      }}
                      className="edit-key-btn"
                    >
                      Change
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
