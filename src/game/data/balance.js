export const difficultyProgression = [
  {
    level: 1,
    name: 'Lookout',
    missionInterval: 12000,
    policeAlertThreshold: 0.5,
    lootMultiplier: 1,
  },
  {
    level: 2,
    name: 'Wheelman',
    missionInterval: 10000,
    policeAlertThreshold: 0.35,
    lootMultiplier: 1.2,
  },
  {
    level: 3,
    name: 'Crew Chief',
    missionInterval: 8000,
    policeAlertThreshold: 0.2,
    lootMultiplier: 1.5,
  },
];

export const scoringRules = {
  baseLootValue: 1500,
  missionBonus: 800,
  comboMultiplierStep: 0.15,
  notorietyPenalty: 0.05,
};

export const missionCatalog = [
  {
    id: 'midtown-caper',
    displayName: 'Midtown Caper',
    baseDuration: 45000,
    description: 'Jack a luxury coupe from a guarded rooftop garage.',
  },
  {
    id: 'harbor-heist',
    displayName: 'Harbor Heist',
    baseDuration: 60000,
    description: 'Intercept a smuggler drop before the coast guard arrives.',
  },
  {
    id: 'warehouse-wipe',
    displayName: 'Warehouse Wipe',
    baseDuration: 55000,
    description: 'Swipe prototype engines without tripping silent alarms.',
  },
];

export const lootTable = [
  {
    id: 'luxury-sedan',
    label: 'Luxury Sedan',
    baseValue: 2400,
    heat: 0.2,
  },
  {
    id: 'armored-suv',
    label: 'Armored SUV',
    baseValue: 3600,
    heat: 0.35,
  },
  {
    id: 'prototype-bike',
    label: 'Prototype Bike',
    baseValue: 2900,
    heat: 0.25,
  },
];
