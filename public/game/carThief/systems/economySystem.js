class EconomySystem {
  constructor(state) {
    this.state = state;
    this.dailyExpenses = 500;
  }

  payCrew() {
    const upkeep = this.state.crew.reduce((total, member) => total + member.upkeep, 0);
    this.state.funds -= upkeep;
    return upkeep;
  }

  applyDailyExpenses() {
    this.state.funds -= this.dailyExpenses;
    return this.dailyExpenses;
  }

  adjustFunds(amount) {
    this.state.funds += amount;
  }

  update() {
    // Placeholder for cashflow forecasting.
  }
}

export { EconomySystem };
