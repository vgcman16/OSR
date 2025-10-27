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
