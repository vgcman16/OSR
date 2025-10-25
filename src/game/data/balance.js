export const difficultyProgression = [
  { name: 'Rookie', lootMultiplier: 1.0, policeAlertThreshold: 0.75 },
  { name: 'Wheelman', lootMultiplier: 1.2, policeAlertThreshold: 0.65 },
  { name: 'Ghost Driver', lootMultiplier: 1.4, policeAlertThreshold: 0.55 },
  { name: 'Mastermind', lootMultiplier: 1.6, policeAlertThreshold: 0.45 },
];

export const missionCatalog = [
  {
    id: 'downtown-smash',
    displayName: 'Downtown Smash & Grab',
    description: 'Hit the jewelry stores before the heat arrives.',
    baseDuration: 45000,
    lootTarget: 3,
  },
  {
    id: 'pier-heist',
    displayName: 'Pier Heist',
    description: 'Load the speedboat with contraband crates.',
    baseDuration: 60000,
    lootTarget: 4,
  },
  {
    id: 'uptown-boost',
    displayName: 'Uptown Boost',
    description: 'Steal high-end rides without scratching them.',
    baseDuration: 55000,
    lootTarget: 3,
  },
  {
    id: 'airport-run',
    displayName: 'Airport Run',
    description: 'Rush the cargo before security rotations.',
    baseDuration: 65000,
    lootTarget: 5,
  },
];

export const lootTable = [
  { id: 'microchips', label: 'Crate of Microchips', baseValue: 1200, heat: 0.12 },
  { id: 'diamonds', label: 'Satchel of Diamonds', baseValue: 1600, heat: 0.2 },
  { id: 'art', label: 'Stolen Artwork', baseValue: 2200, heat: 0.25 },
  { id: 'cash', label: 'Bank Bonds', baseValue: 900, heat: 0.08 },
];

export const scoringRules = {
  baseLootValue: 500,
  missionBonus: 2500,
  comboMultiplierStep: 0.1,
};

export function getLastDifficultyTier() {
  return difficultyProgression[difficultyProgression.length - 1];
}
