class EconomySystem {
  constructor(state) {
    this.state = state;
    this.dailyExpenses = 500;
    this.dayLengthSeconds = 45;
    this.timeAccumulator = 0;
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

  update(delta) {
    this.timeAccumulator += delta;
    if (this.timeAccumulator < this.dayLengthSeconds) {
      return;
    }

    const elapsedDays = Math.floor(this.timeAccumulator / this.dayLengthSeconds);
    this.timeAccumulator -= elapsedDays * this.dayLengthSeconds;

    for (let index = 0; index < elapsedDays; index += 1) {
      this.applyDailyExpenses();
      this.payCrew();
      this.state.day += 1;
    }
  }
}

export { EconomySystem };
