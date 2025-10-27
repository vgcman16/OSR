const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const sanitizeInstalledMods = (mods) => {
  if (!Array.isArray(mods)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  mods.forEach((entry) => {
    if (entry === null || entry === undefined) {
      return;
    }

    const value = String(entry).trim();
    if (!value || seen.has(value)) {
      return;
    }

    seen.add(value);
    normalized.push(value);
  });

  return normalized;
};

const VEHICLE_MOD_CATALOG = Object.freeze({
  'engine-tuning': {
    id: 'engine-tuning',
    label: 'Engine Tuning',
    description:
      'Dyno-tuned injectors and ECU maps push acceleration and top speed at the cost of extra attention.',
    summary: '+20 top speed, +1.2 acceleration, ~6% faster runs, +8% mission heat.',
    cost: 5200,
    effects: {
      topSpeedBonus: 20,
      accelerationBonus: 1.2,
      durationMultiplier: 0.94,
      heatMultiplier: 1.08,
      heatGainMultiplier: 1.1,
    },
  },
  'stealth-plating': {
    id: 'stealth-plating',
    label: 'Stealth Plating',
    description:
      'Composite shrouds and baffled exhaust dampers soak detection, trimming mission heat signatures.',
    summary: '-0.6 base heat, 18% heat multiplier reduction, +0.02 success bonus.',
    cost: 4800,
    effects: {
      handlingBonus: 0.4,
      heatMultiplier: 0.82,
      heatFlatAdjustment: -0.6,
      successBonus: 0.02,
    },
  },
  'signal-masker': {
    id: 'signal-masker',
    label: 'Signal Masker',
    description:
      'Layered RF spoofers blind trackers, shaving pursuit heat and calming response teams.',
    summary: 'Heat gain -0.3, 12% heat gain reduction, +0.015 success.',
    cost: 4100,
    effects: {
      heatGainFlat: -0.3,
      heatGainMultiplier: 0.88,
      successBonus: 0.015,
    },
  },
  'run-flat-tires': {
    id: 'run-flat-tires',
    label: 'Run-Flat Tires',
    description:
      'Kevlar-lined tires keep pace under fire, steadying handling and softening wear.',
    summary: '+0.5 handling, wear mitigation 0.25, 3% faster getaways.',
    cost: 3400,
    effects: {
      handlingBonus: 0.5,
      durationMultiplier: 0.97,
      wearMitigation: 0.25,
    },
  },
});

const aggregateVehicleModBonuses = (installedMods = [], catalog = VEHICLE_MOD_CATALOG) => {
  const totals = {
    topSpeedBonus: 0,
    accelerationBonus: 0,
    handlingBonus: 0,
    durationMultiplier: 1,
    heatMultiplier: 1,
    heatFlatAdjustment: 0,
    successBonus: 0,
    heatGainMultiplier: 1,
    heatGainFlat: 0,
    wearMitigation: 0,
  };

  const safeMods = sanitizeInstalledMods(installedMods);

  safeMods.forEach((modId) => {
    const config = catalog?.[modId];
    const effects = config?.effects ?? {};

    const addIfFinite = (value) => (Number.isFinite(value) ? value : 0);

    totals.topSpeedBonus += addIfFinite(effects.topSpeedBonus);
    totals.accelerationBonus += addIfFinite(effects.accelerationBonus);
    totals.handlingBonus += addIfFinite(effects.handlingBonus);

    if (Number.isFinite(effects.durationMultiplier) && effects.durationMultiplier > 0) {
      totals.durationMultiplier *= clamp(effects.durationMultiplier, 0.5, 1.5);
    }

    if (Number.isFinite(effects.heatMultiplier) && effects.heatMultiplier > 0) {
      totals.heatMultiplier *= clamp(effects.heatMultiplier, 0.3, 1.7);
    }

    totals.heatFlatAdjustment += addIfFinite(effects.heatFlatAdjustment);
    totals.successBonus += addIfFinite(effects.successBonus);

    if (Number.isFinite(effects.heatGainMultiplier) && effects.heatGainMultiplier > 0) {
      totals.heatGainMultiplier *= clamp(effects.heatGainMultiplier, 0.2, 2);
    }

    totals.heatGainFlat += addIfFinite(effects.heatGainFlat);
    totals.wearMitigation += addIfFinite(effects.wearMitigation);
  });

  totals.durationMultiplier = clamp(totals.durationMultiplier, 0.25, 1.6);
  totals.heatMultiplier = clamp(totals.heatMultiplier, 0.2, 2);
  totals.heatGainMultiplier = clamp(totals.heatGainMultiplier, 0.2, 2.2);
  totals.successBonus = clamp(totals.successBonus, -0.2, 0.25);
  totals.wearMitigation = clamp(totals.wearMitigation, -0.5, 0.75);

  return totals;
};

class Vehicle {
  constructor({
    id,
    model,
    topSpeed = 120,
    acceleration = 5,
    handling = 5,
    heat = 0,
    installedMods = [],
  } = {}) {
    this.id = id ?? `vehicle-${Math.random().toString(36).slice(2, 9)}`;
    this.model = model ?? 'Compact Cruiser';
    this.topSpeed = topSpeed;
    this.acceleration = acceleration;
    this.handling = handling;
    this.heat = heat;
    this.condition = 1;
    this.isStolen = false;
    this.status = 'idle';
    this.inUse = false;
    this.installedMods = sanitizeInstalledMods(installedMods);
    this.modBonuses = aggregateVehicleModBonuses(this.installedMods);
  }

  markStolen() {
    this.isStolen = true;
    this.status = 'idle';
    this.inUse = false;
  }

  applyWear(amount) {
    this.condition = Math.max(0, Math.min(1, this.condition - amount));
  }

  modifyHeat(amount) {
    this.heat = Math.max(0, this.heat + amount);
  }

  setStatus(status) {
    this.status = status;
    this.inUse = status === 'in-mission';
  }

  getInstalledMods() {
    return [...this.installedMods];
  }

  hasMod(modId) {
    if (!modId) {
      return false;
    }

    const value = String(modId).trim();
    return value ? this.installedMods.includes(value) : false;
  }

  installMod(modId, catalog = VEHICLE_MOD_CATALOG) {
    if (!modId) {
      return false;
    }

    const value = String(modId).trim();
    if (!value || this.installedMods.includes(value)) {
      return false;
    }

    this.installedMods.push(value);
    this.refreshModBonuses(catalog);
    return true;
  }

  removeMod(modId, catalog = VEHICLE_MOD_CATALOG) {
    if (!modId) {
      return false;
    }

    const value = String(modId).trim();
    if (!value) {
      return false;
    }

    const index = this.installedMods.indexOf(value);
    if (index === -1) {
      return false;
    }

    this.installedMods.splice(index, 1);
    this.refreshModBonuses(catalog);
    return true;
  }

  setInstalledMods(modIds = [], catalog = VEHICLE_MOD_CATALOG) {
    this.installedMods = sanitizeInstalledMods(modIds);
    this.refreshModBonuses(catalog);
  }

  refreshModBonuses(catalog = VEHICLE_MOD_CATALOG) {
    this.modBonuses = aggregateVehicleModBonuses(this.installedMods, catalog);
    return this.getModBonuses();
  }

  getModBonuses(catalog = VEHICLE_MOD_CATALOG) {
    if (!this.modBonuses) {
      this.modBonuses = aggregateVehicleModBonuses(this.installedMods, catalog);
    }

    return { ...this.modBonuses };
  }

  getEffectivePerformance(catalog = VEHICLE_MOD_CATALOG) {
    const bonuses = this.getModBonuses(catalog);
    return {
      topSpeed: Number.isFinite(this.topSpeed) ? this.topSpeed + (bonuses.topSpeedBonus ?? 0) : null,
      acceleration: Number.isFinite(this.acceleration)
        ? this.acceleration + (bonuses.accelerationBonus ?? 0)
        : null,
      handling: Number.isFinite(this.handling)
        ? this.handling + (bonuses.handlingBonus ?? 0)
        : null,
    };
  }
}

export { Vehicle, VEHICLE_MOD_CATALOG, aggregateVehicleModBonuses };
