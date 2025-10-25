class HeatSystem {
  constructor(state) {
    this.state = state;
    this.decayRate = 0.05;
  }

  increase(amount) {
    this.state.heat = Math.min(10, this.state.heat + amount);
  }

  update(delta) {
    if (this.state.heat <= 0) {
      return;
    }

    const decay = this.decayRate * delta;
    this.state.heat = Math.max(0, this.state.heat - decay);
  }
}

export { HeatSystem };
