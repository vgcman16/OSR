class EconomySystem {
  constructor(state) {
    this.state = state;
    if (!Array.isArray(this.state.crew)) {
      this.state.crew = [];
    }
    if (!Number.isFinite(this.state.day)) {
      this.state.day = 1;
    }
    this.baseDailyOverhead = 500;
    this.dayLengthSeconds = 45;
    this.timeAccumulator = 0;
    this.lastExpenseReport = null;
    this.pendingExpenseReport = null;
  }

  getCrewPayroll() {
    const crew = Array.isArray(this.state.crew) ? this.state.crew : [];
    return crew.reduce((total, member) => {
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
  }

  getProjectedDailyExpenses() {
    const payroll = this.getCrewPayroll();
    const safePayroll = Number.isFinite(payroll) ? payroll : 0;
    return this.baseDailyOverhead + safePayroll;
  }

  getBaseDailyOverhead() {
    return this.baseDailyOverhead;
  }

  getLastExpenseReport() {
    return this.lastExpenseReport;
  }

  payCrew(trackInReport = false) {
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
    if (trackInReport && this.pendingExpenseReport) {
      this.pendingExpenseReport.payroll += safeUpkeep;
    }
    return safeUpkeep;
  }

  applyDailyExpenses() {
    this.state.funds -= this.baseDailyOverhead;
    if (this.pendingExpenseReport) {
      this.pendingExpenseReport.base += this.baseDailyOverhead;
    }
    return this.baseDailyOverhead;
  }

  adjustFunds(amount) {
    if (!Number.isFinite(this.state.funds)) {
      this.state.funds = 0;
    }
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
      this.pendingExpenseReport = {
        base: 0,
        payroll: 0,
        day: this.state.day + index,
        timestamp: Date.now(),
      };
      this.applyDailyExpenses();
      this.payCrew(true);
      this.state.day += 1;
      this.lastExpenseReport = {
        base: this.pendingExpenseReport.base,
        payroll: this.pendingExpenseReport.payroll,
        total: this.pendingExpenseReport.base + this.pendingExpenseReport.payroll,
        day: this.pendingExpenseReport.day + 1,
        timestamp: this.pendingExpenseReport.timestamp,
      };
      this.state.lastExpenseReport = this.lastExpenseReport;
      this.pendingExpenseReport = null;
    }
  }
}

export { EconomySystem };
