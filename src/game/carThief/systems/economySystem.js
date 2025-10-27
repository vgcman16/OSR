class EconomySystem {
  constructor(state) {
    this.state = state;
    if (!Array.isArray(this.state.crew)) {
      this.state.crew = [];
    }
    if (!Number.isFinite(this.state.day)) {
      this.state.day = 1;
    }
    this.dailyExpenses = 500;
    this.dayLengthSeconds = 45;
    this.timeAccumulator = 0;
  }

  payCrew() {
    const crew = Array.isArray(this.state.crew) ? this.state.crew : [];
    const upkeep = crew.reduce((total, member) => {
      if (!member || typeof member !== 'object') {
        return total;
      }

      const normalizedUpkeep = Number(member.upkeep);

      if (!Number.isFinite(normalizedUpkeep) || normalizedUpkeep < 0) {
        return total;
      }

      const nextTotal = total + normalizedUpkeep;

      return Number.isFinite(nextTotal) ? nextTotal : total;
    }, 0);

    const safeUpkeep = Number.isFinite(upkeep) ? upkeep : 0;

    if (!Number.isFinite(this.state.funds)) {
      this.state.funds = 0;
    }

    this.state.funds -= safeUpkeep;
    return safeUpkeep;
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
