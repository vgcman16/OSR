const defaultHeatTiers = [
  { name: 'calm', label: 'Calm', threshold: 0 },
  { name: 'alert', label: 'Alert', threshold: 3 },
  { name: 'lockdown', label: 'Lockdown', threshold: 7 },
];

class HeatSystem {
  constructor(state, { decayRate = 0.05, tiers = defaultHeatTiers } = {}) {
    this.state = state;
    this.decayRate = decayRate;
    this.tiers = Array.isArray(tiers) && tiers.length ? [...tiers] : defaultHeatTiers;
    this.tiers.sort((a, b) => a.threshold - b.threshold);

    if (!Number.isFinite(this.state.heat)) {
      this.state.heat = 0;
    }

    this.updateHeatTier();
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
