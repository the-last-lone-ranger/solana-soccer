import type { GameItem, ItemStats } from '@solana-defender/shared';
import { ItemRarity, ItemType } from '@solana-defender/shared';

// Item definitions - Expanded pool with many more items
const ITEM_POOL: Record<ItemRarity, GameItem[]> = {
  [ItemRarity.Common]: [
    { id: 'common_shield_1', name: 'Basic Shield', type: ItemType.Shield, rarity: ItemRarity.Common, description: 'A basic protective shield' },
    { id: 'common_shield_2', name: 'Wooden Buckler', type: ItemType.Shield, rarity: ItemRarity.Common, description: 'Simple wooden defense' },
    { id: 'common_shield_3', name: 'Rusty Plate', type: ItemType.Shield, rarity: ItemRarity.Common, description: 'Old but functional' },
    { id: 'common_weapon_1', name: 'Standard Blaster', type: ItemType.Weapon, rarity: ItemRarity.Common, description: 'A reliable blaster' },
    { id: 'common_weapon_2', name: 'Plasma Pistol', type: ItemType.Weapon, rarity: ItemRarity.Common, description: 'Entry-level energy weapon' },
    { id: 'common_weapon_3', name: 'Laser Rifle', type: ItemType.Weapon, rarity: ItemRarity.Common, description: 'Basic ranged weapon' },
    { id: 'common_weapon_4', name: 'Energy Sword', type: ItemType.Weapon, rarity: ItemRarity.Common, description: 'Melee energy blade' },
    { id: 'common_powerup_1', name: 'Speed Boost', type: ItemType.PowerUp, rarity: ItemRarity.Common, description: 'Temporary speed increase' },
    { id: 'common_powerup_2', name: 'Health Pack', type: ItemType.PowerUp, rarity: ItemRarity.Common, description: 'Restores health' },
    { id: 'common_powerup_3', name: 'Energy Cell', type: ItemType.PowerUp, rarity: ItemRarity.Common, description: 'Recharges energy' },
    { id: 'common_cosmetic_1', name: 'Basic Trail', type: ItemType.Cosmetic, rarity: ItemRarity.Common, description: 'Simple visual effect' },
    { id: 'common_cosmetic_2', name: 'Glow Stick', type: ItemType.Cosmetic, rarity: ItemRarity.Common, description: 'Basic glow effect' },
    { id: 'common_cosmetic_3', name: 'Color Shift', type: ItemType.Cosmetic, rarity: ItemRarity.Common, description: 'Changes player color' },
  ],
  [ItemRarity.Rare]: [
    { id: 'rare_shield_1', name: 'Reinforced Shield', type: ItemType.Shield, rarity: ItemRarity.Rare, description: 'A stronger shield' },
    { id: 'rare_shield_2', name: 'Energy Barrier', type: ItemType.Shield, rarity: ItemRarity.Rare, description: 'Electromagnetic protection' },
    { id: 'rare_shield_3', name: 'Crystal Barrier', type: ItemType.Shield, rarity: ItemRarity.Rare, description: 'Reflective crystal shield' },
    { id: 'rare_shield_4', name: 'Plasma Shield', type: ItemType.Shield, rarity: ItemRarity.Rare, description: 'Advanced energy defense' },
    { id: 'rare_weapon_1', name: 'Plasma Cannon', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'More powerful weapon' },
    { id: 'rare_weapon_2', name: 'Fusion Rifle', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'High-energy weapon' },
    { id: 'rare_weapon_3', name: 'Gravity Hammer', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'Heavy melee weapon' },
    { id: 'rare_weapon_4', name: 'Sniper Rifle', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'Long-range precision' },
    { id: 'rare_weapon_5', name: 'Rocket Launcher', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'Explosive damage' },
    { id: 'rare_powerup_1', name: 'Double Speed', type: ItemType.PowerUp, rarity: ItemRarity.Rare, description: '2x movement speed' },
    { id: 'rare_powerup_2', name: 'Shield Boost', type: ItemType.PowerUp, rarity: ItemRarity.Rare, description: 'Temporary invincibility' },
    { id: 'rare_powerup_3', name: 'Damage Amp', type: ItemType.PowerUp, rarity: ItemRarity.Rare, description: 'Increased damage output' },
    { id: 'rare_cosmetic_1', name: 'Neon Trail', type: ItemType.Cosmetic, rarity: ItemRarity.Rare, description: 'Cool visual effect' },
    { id: 'rare_cosmetic_2', name: 'Particle Burst', type: ItemType.Cosmetic, rarity: ItemRarity.Rare, description: 'Sparkle effects' },
    { id: 'rare_cosmetic_3', name: 'Hologram Skin', type: ItemType.Cosmetic, rarity: ItemRarity.Rare, description: 'Futuristic appearance' },
    { id: 'rare_cosmetic_4', name: 'Energy Aura', type: ItemType.Cosmetic, rarity: ItemRarity.Rare, description: 'Glowing energy field' },
  ],
  [ItemRarity.Epic]: [
    { id: 'epic_shield_1', name: 'Energy Barrier', type: ItemType.Shield, rarity: ItemRarity.Epic, description: 'Advanced protection' },
    { id: 'epic_shield_2', name: 'Quantum Shield', type: ItemType.Shield, rarity: ItemRarity.Epic, description: 'Phase-shifting defense' },
    { id: 'epic_shield_3', name: 'Void Barrier', type: ItemType.Shield, rarity: ItemRarity.Epic, description: 'Absorbs all damage' },
    { id: 'epic_shield_4', name: 'Diamond Aegis', type: ItemType.Shield, rarity: ItemRarity.Epic, description: 'Unbreakable protection' },
    { id: 'epic_weapon_1', name: 'Quantum Blaster', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Devastating weapon' },
    { id: 'epic_weapon_2', name: 'Void Cannon', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Reality-bending weapon' },
    { id: 'epic_weapon_3', name: 'Solar Flare', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Star-powered destruction' },
    { id: 'epic_weapon_4', name: 'Chaos Blade', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Unpredictable melee' },
    { id: 'epic_weapon_5', name: 'Time Dilation Rifle', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Slows targets' },
    { id: 'epic_powerup_1', name: 'Time Freeze', type: ItemType.PowerUp, rarity: ItemRarity.Epic, description: 'Freezes enemies briefly' },
    { id: 'epic_powerup_2', name: 'Full Restore', type: ItemType.PowerUp, rarity: ItemRarity.Epic, description: 'Complete health restore' },
    { id: 'epic_powerup_3', name: 'Ultimate Mode', type: ItemType.PowerUp, rarity: ItemRarity.Epic, description: 'All stats boosted' },
    { id: 'epic_cosmetic_1', name: 'Holographic Wings', type: ItemType.Cosmetic, rarity: ItemRarity.Epic, description: 'Epic visual upgrade' },
    { id: 'epic_cosmetic_2', name: 'Nebula Aura', type: ItemType.Cosmetic, rarity: ItemRarity.Epic, description: 'Cosmic visual effect' },
    { id: 'epic_cosmetic_3', name: 'Phantom Form', type: ItemType.Cosmetic, rarity: ItemRarity.Epic, description: 'Semi-transparent appearance' },
    { id: 'epic_cosmetic_4', name: 'Stellar Crown', type: ItemType.Cosmetic, rarity: ItemRarity.Epic, description: 'Star-studded crown' },
  ],
  [ItemRarity.Legendary]: [
    { id: 'legendary_weapon_1', name: 'Solana Destroyer', type: ItemType.Weapon, rarity: ItemRarity.Legendary, description: 'The ultimate weapon' },
    { id: 'legendary_weapon_2', name: 'Infinity Blade', type: ItemType.Weapon, rarity: ItemRarity.Legendary, description: 'Unlimited power' },
    { id: 'legendary_weapon_3', name: 'Reality Breaker', type: ItemType.Weapon, rarity: ItemRarity.Legendary, description: 'Breaks game physics' },
    { id: 'legendary_weapon_4', name: 'God Slayer', type: ItemType.Weapon, rarity: ItemRarity.Legendary, description: 'Mythical weapon' },
    { id: 'legendary_shield_1', name: 'Immortal Aegis', type: ItemType.Shield, rarity: ItemRarity.Legendary, description: 'Near invincibility' },
    { id: 'legendary_shield_2', name: 'Eternal Barrier', type: ItemType.Shield, rarity: ItemRarity.Legendary, description: 'Never breaks' },
    { id: 'legendary_shield_3', name: 'Divine Protection', type: ItemType.Shield, rarity: ItemRarity.Legendary, description: 'Godly defense' },
    { id: 'legendary_shield_4', name: 'Universe Shield', type: ItemType.Shield, rarity: ItemRarity.Legendary, description: 'Protects from everything' },
    { id: 'legendary_powerup_1', name: 'God Mode', type: ItemType.PowerUp, rarity: ItemRarity.Legendary, description: 'Temporary invincibility' },
    { id: 'legendary_powerup_2', name: 'Reality Warp', type: ItemType.PowerUp, rarity: ItemRarity.Legendary, description: 'Bend space-time' },
    { id: 'legendary_powerup_3', name: 'Divine Blessing', type: ItemType.PowerUp, rarity: ItemRarity.Legendary, description: 'All abilities maxed' },
    { id: 'legendary_cosmetic_1', name: 'Cosmic Aura', type: ItemType.Cosmetic, rarity: ItemRarity.Legendary, description: 'Legendary presence' },
    { id: 'legendary_cosmetic_2', name: 'Universe Form', type: ItemType.Cosmetic, rarity: ItemRarity.Legendary, description: 'Embodies the cosmos' },
    { id: 'legendary_cosmetic_3', name: 'Divine Radiance', type: ItemType.Cosmetic, rarity: ItemRarity.Legendary, description: 'Godly appearance' },
    { id: 'legendary_cosmetic_4', name: 'Infinity Glow', type: ItemType.Cosmetic, rarity: ItemRarity.Legendary, description: 'Infinite visual effects' },
  ],
};

// Base drop rates (without token bonuses) - Made much harder to earn
const BASE_DROP_RATES = {
  [ItemRarity.Common]: 0.05,    // 5% chance (was 15%)
  [ItemRarity.Rare]: 0.015,     // 1.5% chance (was 5%)
  [ItemRarity.Epic]: 0.005,     // 0.5% chance (was 2%)
  [ItemRarity.Legendary]: 0.001, // 0.1% chance (was 0.5%)
};

// Generate stats based on item type and rarity
function generateItemStats(itemType: ItemType, rarity: ItemRarity): ItemStats {
  const stats: ItemStats = {};
  
  // Base stat ranges by rarity
  const rarityMultipliers = {
    [ItemRarity.Common]: { min: 1, max: 5 },
    [ItemRarity.Rare]: { min: 5, max: 15 },
    [ItemRarity.Epic]: { min: 15, max: 30 },
    [ItemRarity.Legendary]: { min: 30, max: 50 },
  };
  
  const range = rarityMultipliers[rarity];
  const randomInRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  
  switch (itemType) {
    case ItemType.Weapon:
      stats.attack = randomInRange(range.min, range.max);
      stats.critChance = randomInRange(1, Math.floor(range.max / 3));
      stats.critDamage = randomInRange(Math.floor(range.min / 2), Math.floor(range.max / 2));
      break;
    case ItemType.Shield:
      stats.defense = randomInRange(range.min, range.max);
      stats.health = randomInRange(Math.floor(range.min / 2), Math.floor(range.max / 2));
      break;
    case ItemType.PowerUp:
      stats.speed = randomInRange(range.min, Math.floor(range.max * 1.5));
      stats.health = randomInRange(Math.floor(range.min / 2), range.max);
      break;
    case ItemType.Cosmetic:
      // Cosmetics have smaller stat bonuses but can have any stat
      const cosmeticRange = { min: Math.floor(range.min / 2), max: Math.floor(range.max / 2) };
      const statTypes = ['attack', 'defense', 'speed', 'health'];
      const selectedStat = statTypes[Math.floor(Math.random() * statTypes.length)];
      if (selectedStat === 'attack') stats.attack = randomInRange(cosmeticRange.min, cosmeticRange.max);
      else if (selectedStat === 'defense') stats.defense = randomInRange(cosmeticRange.min, cosmeticRange.max);
      else if (selectedStat === 'speed') stats.speed = randomInRange(cosmeticRange.min, cosmeticRange.max);
      else if (selectedStat === 'health') stats.health = randomInRange(cosmeticRange.min, cosmeticRange.max);
      break;
    case ItemType.Crown:
      // Crowns are special - they give balanced stats
      stats.attack = randomInRange(Math.floor(range.min / 2), Math.floor(range.max / 2));
      stats.defense = randomInRange(Math.floor(range.min / 2), Math.floor(range.max / 2));
      stats.speed = randomInRange(Math.floor(range.min / 2), Math.floor(range.max / 2));
      break;
  }
  
  return stats;
}

// Token multipliers
function getTokenMultiplier(tokenBalance: number, nftCount: number, hasKickItToken: boolean = false): number {
  let multiplier = 1.0;
  
  // Token balance bonus (capped at 2x)
  if (tokenBalance > 0) {
    const tokenBonus = Math.min(1 + (tokenBalance / 1000) * 0.1, 2.0);
    multiplier *= tokenBonus;
  }
  
  // NFT count bonus (capped at 1.5x)
  if (nftCount > 0) {
    const nftBonus = Math.min(1 + (nftCount / 10) * 0.05, 1.5);
    multiplier *= nftBonus;
  }
  
  // Kicking It ($SOCCER) token holder bonus - significant boost (2.5x multiplier)
  if (hasKickItToken) {
    multiplier *= 2.5;
  }
  
  return multiplier;
}

export function generateItemDrop(tokenBalance: number = 0, nftCount: number = 0, hasKickItToken: boolean = false): GameItem | null {
  const multiplier = getTokenMultiplier(tokenBalance, nftCount, hasKickItToken);
  
  // Calculate adjusted drop rates
  const adjustedRates = {
    [ItemRarity.Common]: BASE_DROP_RATES[ItemRarity.Common] * multiplier,
    [ItemRarity.Rare]: BASE_DROP_RATES[ItemRarity.Rare] * multiplier,
    [ItemRarity.Epic]: BASE_DROP_RATES[ItemRarity.Epic] * multiplier,
    [ItemRarity.Legendary]: BASE_DROP_RATES[ItemRarity.Legendary] * multiplier,
  };
  
  // Cap rates at reasonable maximums (lower caps to keep items rare)
  const cappedRates = {
    [ItemRarity.Common]: Math.min(adjustedRates[ItemRarity.Common], 0.15),
    [ItemRarity.Rare]: Math.min(adjustedRates[ItemRarity.Rare], 0.05),
    [ItemRarity.Epic]: Math.min(adjustedRates[ItemRarity.Epic], 0.02),
    [ItemRarity.Legendary]: Math.min(adjustedRates[ItemRarity.Legendary], 0.005),
  };
  
  const roll = Math.random();
  let cumulative = 0;
  
  // Check in order from legendary to common
  const rarities: ItemRarity[] = [
    ItemRarity.Legendary,
    ItemRarity.Epic,
    ItemRarity.Rare,
    ItemRarity.Common,
  ];
  
  for (const rarity of rarities) {
    cumulative += cappedRates[rarity];
    if (roll < cumulative) {
      // Select random item from this rarity pool
      const pool = ITEM_POOL[rarity];
      const item = pool[Math.floor(Math.random() * pool.length)];
      const stats = generateItemStats(item.type, rarity);
      return { ...item, stats };
    }
  }
  
  // No drop
  return null;
}

export function getDropChance(tokenBalance: number, nftCount: number, hasKickItToken: boolean = false): Record<ItemRarity, number> {
  const multiplier = getTokenMultiplier(tokenBalance, nftCount, hasKickItToken);
  
  return {
    [ItemRarity.Common]: Math.min(BASE_DROP_RATES[ItemRarity.Common] * multiplier, 0.15),
    [ItemRarity.Rare]: Math.min(BASE_DROP_RATES[ItemRarity.Rare] * multiplier, 0.05),
    [ItemRarity.Epic]: Math.min(BASE_DROP_RATES[ItemRarity.Epic] * multiplier, 0.02),
    [ItemRarity.Legendary]: Math.min(BASE_DROP_RATES[ItemRarity.Legendary] * multiplier, 0.005),
  };
}

