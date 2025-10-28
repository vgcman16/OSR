import { VEHICLE_MOD_CATALOG } from '../entities/vehicle.js';

const VEHICLE_MOD_RECIPES = Object.freeze({
  'engine-tuning': {
    id: 'engine-tuning',
    modId: 'engine-tuning',
    partsCost: 16,
    fundsCost: 1500,
  },
  'stealth-plating': {
    id: 'stealth-plating',
    modId: 'stealth-plating',
    partsCost: 14,
    fundsCost: 1300,
  },
  'signal-masker': {
    id: 'signal-masker',
    modId: 'signal-masker',
    partsCost: 12,
    fundsCost: 1100,
  },
  'run-flat-tires': {
    id: 'run-flat-tires',
    modId: 'run-flat-tires',
    partsCost: 9,
    fundsCost: 900,
  },
});

const cloneRecipe = (recipe) => {
  if (!recipe) {
    return null;
  }

  const normalizedParts = Number.isFinite(recipe.partsCost) ? Math.max(0, Math.round(recipe.partsCost)) : 0;
  const normalizedFunds = Number.isFinite(recipe.fundsCost) ? Math.max(0, Math.round(recipe.fundsCost)) : 0;

  return {
    id: recipe.id ?? recipe.modId,
    modId: recipe.modId,
    partsCost: normalizedParts,
    fundsCost: normalizedFunds,
  };
};

const getVehicleModRecipe = (modId) => {
  if (!modId) {
    return null;
  }

  const key = String(modId).trim();
  if (!key) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(VEHICLE_MOD_CATALOG, key)) {
    return null;
  }

  const recipe = VEHICLE_MOD_RECIPES[key];
  if (!recipe) {
    return null;
  }

  return cloneRecipe(recipe);
};

const getVehicleModRecipes = () => Object.values(VEHICLE_MOD_RECIPES).map((recipe) => cloneRecipe(recipe)).filter(Boolean);

const assessVehicleModAffordability = (recipe, { partsAvailable = 0, fundsAvailable = 0 } = {}) => {
  const normalizedRecipe = cloneRecipe(recipe);
  if (!normalizedRecipe) {
    return {
      recipe: null,
      affordable: false,
      partsShortfall: 0,
      fundsShortfall: 0,
    };
  }

  const partsOnHand = Number.isFinite(partsAvailable) ? Math.max(0, Math.floor(partsAvailable)) : 0;
  const fundsOnHand = Number.isFinite(fundsAvailable) ? Math.max(0, Math.floor(fundsAvailable)) : 0;

  const partsShortfall = Math.max(0, normalizedRecipe.partsCost - partsOnHand);
  const fundsShortfall = Math.max(0, normalizedRecipe.fundsCost - fundsOnHand);

  return {
    recipe: normalizedRecipe,
    affordable: partsShortfall === 0 && fundsShortfall === 0,
    partsShortfall,
    fundsShortfall,
  };
};

const canAffordVehicleMod = (recipe, resources) => assessVehicleModAffordability(recipe, resources).affordable;

export {
  VEHICLE_MOD_RECIPES,
  getVehicleModRecipe,
  getVehicleModRecipes,
  assessVehicleModAffordability,
  canAffordVehicleMod,
};
