/**
 * EXP and Level System
 * 
 * Sophisticated EXP calculation system that rewards players for wins.
 * EXP gains scale with game difficulty (bet amount) and player level.
 */

export interface ExpGainResult {
  expGained: number;
  newLevel: number;
  newExp: number;
  expToNextLevel: number;
  leveledUp: boolean;
}

/**
 * Calculate EXP required to reach a specific level
 * Uses exponential scaling: EXP = baseExp * (levelMultiplier ^ (level - 1))
 */
export function getExpRequiredForLevel(level: number): number {
  const baseExp = 100; // Base EXP required for level 2
  const levelMultiplier = 1.15; // 15% increase per level
  
  if (level <= 1) return 0;
  
  // Calculate cumulative EXP needed from level 1 to target level
  let totalExp = 0;
  for (let l = 2; l <= level; l++) {
    totalExp += baseExp * Math.pow(levelMultiplier, l - 2);
  }
  
  return Math.floor(totalExp);
}

/**
 * Calculate EXP required for the next level from current EXP
 */
export function getExpToNextLevel(currentLevel: number, currentExp: number): number {
  const expForCurrentLevel = getExpRequiredForLevel(currentLevel);
  const expForNextLevel = getExpRequiredForLevel(currentLevel + 1);
  return expForNextLevel - currentExp;
}

/**
 * Calculate EXP gain for a win
 * 
 * Base EXP formula:
 * - Base win: 50 EXP
 * - Bet multiplier: 1x for free, 1.5x for 0.05 SOL, 2x for 0.25 SOL
 * - Level scaling: Higher level players get slightly less EXP (to prevent snowballing)
 * - Score bonus: Small bonus based on performance (score / 1000)
 * 
 * @param betAmountSol - The bet amount (0 = free, 0.05 = low, 0.25 = medium)
 * @param currentLevel - Player's current level
 * @param score - Player's score in the game
 * @param isTeamWin - Whether this was a team win (lobby) vs solo win (match)
 */
export function calculateExpGain(
  betAmountSol: number,
  currentLevel: number,
  score: number = 0,
  isTeamWin: boolean = false
): number {
  // Base EXP for a win
  let baseExp = 50;
  
  // Bet amount multiplier
  let betMultiplier = 1.0;
  if (betAmountSol === 0.05) {
    betMultiplier = 1.5;
  } else if (betAmountSol === 0.25) {
    betMultiplier = 2.0;
  } else if (betAmountSol > 0.25) {
    // For custom bet amounts, scale linearly
    betMultiplier = 1.0 + (betAmountSol / 0.25);
  }
  
  // Level scaling - higher level players get slightly less EXP
  // This prevents high-level players from leveling too fast
  const levelPenalty = Math.max(0.7, 1.0 - (currentLevel - 1) * 0.01);
  
  // Score bonus - small bonus based on performance
  // Cap at 20% bonus for very high scores
  const scoreBonus = Math.min(0.2, score / 50000);
  
  // Team win bonus - team wins give slightly more EXP (teamwork!)
  const teamBonus = isTeamWin ? 1.1 : 1.0;
  
  // Calculate final EXP gain
  const expGain = Math.floor(
    baseExp * betMultiplier * levelPenalty * (1 + scoreBonus) * teamBonus
  );
  
  // Minimum EXP gain is always at least 10
  return Math.max(10, expGain);
}

/**
 * Add EXP to a player and calculate level ups
 * 
 * @param currentLevel - Player's current level
 * @param currentExp - Player's current EXP
 * @param expGain - EXP to add
 * @returns Result with new level, EXP, and level up status
 */
export function addExp(
  currentLevel: number,
  currentExp: number,
  expGain: number
): ExpGainResult {
  let newLevel = currentLevel;
  let newExp = currentExp + expGain;
  let leveledUp = false;
  
  // Check for level ups
  while (true) {
    const expForNextLevel = getExpRequiredForLevel(newLevel + 1);
    
    if (newExp >= expForNextLevel) {
      newLevel++;
      leveledUp = true;
      // Continue checking for multiple level ups
    } else {
      break;
    }
  }
  
  const expToNextLevel = getExpToNextLevel(newLevel, newExp);
  
  return {
    expGained: expGain,
    newLevel,
    newExp,
    expToNextLevel,
    leveledUp,
  };
}

/**
 * Get player's level and EXP information
 */
export function getPlayerLevelInfo(level: number, exp: number) {
  const expForCurrentLevel = getExpRequiredForLevel(level);
  const expForNextLevel = getExpRequiredForLevel(level + 1);
  const expToNextLevel = expForNextLevel - exp;
  const expInCurrentLevel = exp - expForCurrentLevel;
  const expNeededForCurrentLevel = expForNextLevel - expForCurrentLevel;
  const progressPercent = Math.min(100, (expInCurrentLevel / expNeededForCurrentLevel) * 100);
  
  return {
    level,
    exp,
    expToNextLevel,
    expInCurrentLevel,
    expNeededForCurrentLevel,
    progressPercent,
  };
}


