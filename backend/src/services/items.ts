import type { GameItem } from '@solana-defender/shared';
import { ItemRarity, ItemType } from '@solana-defender/shared';

// Item definitions
const ITEM_POOL: Record<ItemRarity, GameItem[]> = {
  [ItemRarity.Common]: [
    { id: 'common_shield_1', name: 'Basic Shield', type: ItemType.Shield, rarity: ItemRarity.Common, description: 'A basic protective shield' },
    { id: 'common_weapon_1', name: 'Standard Blaster', type: ItemType.Weapon, rarity: ItemRarity.Common, description: 'A reliable blaster' },
    { id: 'common_powerup_1', name: 'Speed Boost', type: ItemType.PowerUp, rarity: ItemRarity.Common, description: 'Temporary speed increase' },
  ],
  [ItemRarity.Rare]: [
    { id: 'rare_shield_1', name: 'Reinforced Shield', type: ItemType.Shield, rarity: ItemRarity.Rare, description: 'A stronger shield' },
    { id: 'rare_weapon_1', name: 'Plasma Cannon', type: ItemType.Weapon, rarity: ItemRarity.Rare, description: 'More powerful weapon' },
    { id: 'rare_cosmetic_1', name: 'Neon Trail', type: ItemType.Cosmetic, rarity: ItemRarity.Rare, description: 'Cool visual effect' },
  ],
  [ItemRarity.Epic]: [
    { id: 'epic_shield_1', name: 'Energy Barrier', type: ItemType.Shield, rarity: ItemRarity.Epic, description: 'Advanced protection' },
    { id: 'epic_weapon_1', name: 'Quantum Blaster', type: ItemType.Weapon, rarity: ItemRarity.Epic, description: 'Devastating weapon' },
    { id: 'epic_cosmetic_1', name: 'Holographic Wings', type: ItemType.Cosmetic, rarity: ItemRarity.Epic, description: 'Epic visual upgrade' },
  ],
  [ItemRarity.Legendary]: [
    { id: 'legendary_weapon_1', name: 'Solana Destroyer', type: ItemType.Weapon, rarity: ItemRarity.Legendary, description: 'The ultimate weapon' },
    { id: 'legendary_shield_1', name: 'Immortal Aegis', type: ItemType.Shield, rarity: ItemRarity.Legendary, description: 'Near invincibility' },
    { id: 'legendary_cosmetic_1', name: 'Cosmic Aura', type: ItemType.Cosmetic, rarity: ItemRarity.Legendary, description: 'Legendary presence' },
  ],
};

// Base drop rates (without token bonuses)
const BASE_DROP_RATES = {
  [ItemRarity.Common]: 0.15,    // 15% chance
  [ItemRarity.Rare]: 0.05,     // 5% chance
  [ItemRarity.Epic]: 0.02,     // 2% chance
  [ItemRarity.Legendary]: 0.005, // 0.5% chance
};

// Token multipliers
function getTokenMultiplier(tokenBalance: number, nftCount: number): number {
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
  
  return multiplier;
}

export function generateItemDrop(tokenBalance: number = 0, nftCount: number = 0): GameItem | null {
  const multiplier = getTokenMultiplier(tokenBalance, nftCount);
  
  // Calculate adjusted drop rates
  const adjustedRates = {
    [ItemRarity.Common]: BASE_DROP_RATES[ItemRarity.Common] * multiplier,
    [ItemRarity.Rare]: BASE_DROP_RATES[ItemRarity.Rare] * multiplier,
    [ItemRarity.Epic]: BASE_DROP_RATES[ItemRarity.Epic] * multiplier,
    [ItemRarity.Legendary]: BASE_DROP_RATES[ItemRarity.Legendary] * multiplier,
  };
  
  // Cap rates at reasonable maximums
  const cappedRates = {
    [ItemRarity.Common]: Math.min(adjustedRates[ItemRarity.Common], 0.5),
    [ItemRarity.Rare]: Math.min(adjustedRates[ItemRarity.Rare], 0.2),
    [ItemRarity.Epic]: Math.min(adjustedRates[ItemRarity.Epic], 0.1),
    [ItemRarity.Legendary]: Math.min(adjustedRates[ItemRarity.Legendary], 0.05),
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
      return { ...item };
    }
  }
  
  // No drop
  return null;
}

export function getDropChance(tokenBalance: number, nftCount: number): Record<ItemRarity, number> {
  const multiplier = getTokenMultiplier(tokenBalance, nftCount);
  
  return {
    [ItemRarity.Common]: Math.min(BASE_DROP_RATES[ItemRarity.Common] * multiplier, 0.5),
    [ItemRarity.Rare]: Math.min(BASE_DROP_RATES[ItemRarity.Rare] * multiplier, 0.2),
    [ItemRarity.Epic]: Math.min(BASE_DROP_RATES[ItemRarity.Epic] * multiplier, 0.1),
    [ItemRarity.Legendary]: Math.min(BASE_DROP_RATES[ItemRarity.Legendary] * multiplier, 0.05),
  };
}

