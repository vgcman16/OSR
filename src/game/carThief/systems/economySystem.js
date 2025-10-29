import { getActiveSafehouseFromState } from '../world/safehouse.js';
import { computeSafehouseFacilityBonuses } from '../world/safehouseEffects.js';
import { advanceCrewGearVendorsForNewDay } from './crewGearVendors.js';

const DAY_LENGTH_SECONDS = 45;

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
    this.dayLengthSeconds = DAY_LENGTH_SECONDS;
    this.timeAccumulator = 0;
    this.lastExpenseReport = null;
    this.pendingExpenseReport = null;
  }

  getActiveSafehouse() {
    return getActiveSafehouseFromState(this.state);
  }

  getSafehouseOverheadModifier() {
    const safehouse = this.getActiveSafehouse();
    if (!safehouse || typeof safehouse.getOverheadModifier !== 'function') {
      return 0;
    }

    const modifier = safehouse.getOverheadModifier();
    const facilityBonuses = computeSafehouseFacilityBonuses(safehouse);
    const facilityModifier = Number.isFinite(facilityBonuses.overheadModifierBonus)
      ? facilityBonuses.overheadModifierBonus
      : 0;

    const safeModifier = Number.isFinite(modifier) ? modifier : 0;
    return safeModifier + facilityModifier;
  }

  getSafehousePassiveIncome() {
    const safehouse = this.getActiveSafehouse();
    if (!safehouse || typeof safehouse.getPassiveIncome !== 'function') {
      return 0;
    }

    const income = safehouse.getPassiveIncome();
    const facilityBonuses = computeSafehouseFacilityBonuses(safehouse);
    const facilityIncome = Number.isFinite(facilityBonuses.passiveIncomeBonus)
      ? facilityBonuses.passiveIncomeBonus
      : 0;

    const safeIncome = Number.isFinite(income) ? income : 0;
    return safeIncome + facilityIncome;
  }

  getActiveStorageCapacity() {
    const safehouse = this.getActiveSafehouse();
    if (!safehouse || typeof safehouse.getStorageCapacity !== 'function') {
      return null;
    }

    const capacity = safehouse.getStorageCapacity();
    if (!Number.isFinite(capacity) || capacity < 0) {
      return null;
    }

    return capacity;
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
    const overheadModifier = this.getSafehouseOverheadModifier();
    const passiveIncome = this.getSafehousePassiveIncome();

    const projected = this.baseDailyOverhead + overheadModifier + safePayroll - passiveIncome;
    return Math.max(0, projected);
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
    if (!Number.isFinite(this.state.funds)) {
      this.state.funds = 0;
    }

    const overheadModifier = this.getSafehouseOverheadModifier();
    const totalOverhead = Math.max(0, this.baseDailyOverhead + overheadModifier);

    this.state.funds -= totalOverhead;
    if (this.pendingExpenseReport) {
      this.pendingExpenseReport.base += this.baseDailyOverhead;
      this.pendingExpenseReport.safehouseOverhead += overheadModifier;
    }
    return totalOverhead;
  }

  applySafehouseDailyEconomyEffects() {
    const passiveIncome = this.getSafehousePassiveIncome();
    if (!Number.isFinite(passiveIncome) || passiveIncome <= 0) {
      return 0;
    }

    if (!Number.isFinite(this.state.funds)) {
      this.state.funds = 0;
    }

    this.state.funds += passiveIncome;
    if (this.pendingExpenseReport) {
      this.pendingExpenseReport.safehouseIncome += passiveIncome;
    }

    return passiveIncome;
  }

  recoverCrewFatigue(days = 1) {
    const crew = Array.isArray(this.state.crew) ? this.state.crew : [];
    let fatigueAdjusted = false;
    const safehouse = this.getActiveSafehouse();
    const facilityBonuses = computeSafehouseFacilityBonuses(safehouse);
    const restBonus = Number.isFinite(facilityBonuses.crewRestBonus)
      ? facilityBonuses.crewRestBonus
      : 0;
    const recoveryMultiplier = 1 + Math.max(0, restBonus);
    crew.forEach((member) => {
      if (!member || typeof member !== 'object') {
        return;
      }

      const before = Number(member.fatigue);

      if (typeof member.applyRestRecovery === 'function') {
        member.applyRestRecovery(days, { recoveryMultiplier });
      } else if (typeof member.recoverFatigue === 'function') {
        member.recoverFatigue(days, { recoveryMultiplier });
      }

      const after = Number(member.fatigue);
      if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
        fatigueAdjusted = true;
      }
    });

    if (fatigueAdjusted && this.state) {
      this.state.lastCrewRecoveryTimestamp = Date.now();
      this.state.needsHudRefresh = true;
    }
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
        safehouseOverhead: 0,
        safehouseIncome: 0,
        day: this.state.day + index,
        timestamp: Date.now(),
      };
      this.applyDailyExpenses();
      this.payCrew(true);
      this.applySafehouseDailyEconomyEffects();
      this.recoverCrewFatigue(1);
      this.state.day += 1;
      const { restocked } = advanceCrewGearVendorsForNewDay(this.state);
      if (this.state) {
        this.state.needsHudRefresh = true;
        this.state.lastEconomyTickAt = Date.now();
        if (restocked) {
          this.state.lastVendorRefreshAt = Date.now();
        }
      }
      const total =
        this.pendingExpenseReport.base +
        this.pendingExpenseReport.payroll +
        this.pendingExpenseReport.safehouseOverhead -
        this.pendingExpenseReport.safehouseIncome;
      this.lastExpenseReport = {
        base: this.pendingExpenseReport.base,
        payroll: this.pendingExpenseReport.payroll,
        safehouseOverhead: this.pendingExpenseReport.safehouseOverhead,
        safehouseIncome: this.pendingExpenseReport.safehouseIncome,
        total,
        day: this.pendingExpenseReport.day + 1,
        timestamp: this.pendingExpenseReport.timestamp,
      };
      this.state.lastExpenseReport = this.lastExpenseReport;
      this.pendingExpenseReport = null;
    }
  }
}

export { EconomySystem };
