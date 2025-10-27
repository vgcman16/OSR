import { getActiveSafehouseFromState } from '../world/safehouse.js';

const defaultHeatTiers = [
  { name: 'calm', label: 'Calm', threshold: 0 },
  { name: 'alert', label: 'Alert', threshold: 3 },
  { name: 'lockdown', label: 'Lockdown', threshold: 7 },
];

const DAY_LENGTH_SECONDS = 45;

class HeatSystem {
  constructor(state, { decayRate = 0.05, tiers = defaultHeatTiers } = {}) {
    this.state = state;
    this.decayRate = decayRate;
    this.tiers = Array.isArray(tiers) && tiers.length ? [...tiers] : defaultHeatTiers;
    this.tiers.sort((a, b) => a.threshold - b.threshold);

    if (!Number.isFinite(this.state.heat)) {
      this.state.heat = 0;
    }

    this.dayLengthSeconds = DAY_LENGTH_SECONDS;
    this.timeAccumulator = 0;

    this.updateHeatTier();
  }

  getActiveSafehouse() {
    return getActiveSafehouseFromState(this.state);
  }

  getSafehouseHeatReduction() {
    const safehouse = this.getActiveSafehouse();
    if (!safehouse || typeof safehouse.getHeatReduction !== 'function') {
      return 0;
    }

    const reduction = safehouse.getHeatReduction();
    return Number.isFinite(reduction) ? reduction : 0;
  }

  applySafehouseDailyMitigation() {
    const reduction = this.getSafehouseHeatReduction();
    if (!Number.isFinite(reduction) || reduction <= 0) {
      return 0;
    }

    const beforeHeat = Number.isFinite(this.state.heat) ? this.state.heat : 0;
    const targetHeat = Math.max(0, beforeHeat - reduction);
    this.state.heat = targetHeat;
    this.updateHeatTier();
    return beforeHeat - targetHeat;
  }

  getTierForHeat(heatValue) {
    const numericHeat = Number.isFinite(heatValue) ? heatValue : 0;
    let activeTier = this.tiers[0];

    for (const tier of this.tiers) {
      if (numericHeat >= tier.threshold) {
        activeTier = tier;
      } else {
        break;
      }
    }

    return activeTier;
  }

  updateHeatTier() {
    const tier = this.getTierForHeat(this.state.heat);
    this.state.heatTier = tier?.name ?? 'calm';
    return tier;
  }

  getCurrentTier() {
    return this.updateHeatTier().name;
  }

  getCurrentTierConfig() {
    return this.getTierForHeat(this.state.heat);
  }

  increase(amount) {
    this.state.heat = Math.min(10, this.state.heat + amount);
    this.updateHeatTier();
  }

  applyMitigation(reduction, { label = 'Heat mitigation', fundsSpent = 0, metadata = {} } = {}) {
    const numericHeat = Number.isFinite(this.state.heat) ? this.state.heat : 0;
    const normalizedReduction = Number.isFinite(reduction) && reduction > 0 ? reduction : 0;
    const targetHeat = Math.max(0, numericHeat - normalizedReduction);

    if (!Array.isArray(this.state.heatMitigationLog)) {
      this.state.heatMitigationLog = [];
    }

    const telemetry = {
      type: 'heat-mitigation',
      label,
      fundsSpent: Number.isFinite(fundsSpent) ? fundsSpent : 0,
      heatBefore: numericHeat,
      heatAfter: targetHeat,
      heatDelta: targetHeat - numericHeat,
      reductionApplied: numericHeat - targetHeat,
      timestamp: Date.now(),
    };

    if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
      telemetry.metadata = { ...metadata };
    }

    this.state.heatMitigationLog.unshift(telemetry);
    if (this.state.heatMitigationLog.length > 20) {
      this.state.heatMitigationLog.length = 20;
    }

    this.state.heat = targetHeat;
    this.updateHeatTier();

    return telemetry;
  }

  update(delta) {
    this.timeAccumulator += delta;

    if (this.timeAccumulator >= this.dayLengthSeconds) {
      const elapsedDays = Math.floor(this.timeAccumulator / this.dayLengthSeconds);
      this.timeAccumulator -= elapsedDays * this.dayLengthSeconds;

      for (let index = 0; index < elapsedDays; index += 1) {
        this.applySafehouseDailyMitigation();
      }
    }

    if (this.state.heat <= 0) {
      this.state.heat = 0;
      this.updateHeatTier();
      return;
    }

    const decay = this.decayRate * delta;
    this.state.heat = Math.max(0, this.state.heat - decay);
    this.updateHeatTier();
  }
}

export { HeatSystem };
