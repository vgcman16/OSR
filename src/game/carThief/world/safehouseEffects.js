const clampMultiplier = (value, { min = 0.2, max = 2 } = {}) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(min, Math.min(max, value));
};

const SAFEHOUSE_FACILITY_EFFECTS = {
  'crash-cots': {
    name: 'Crash Cots',
    crewRestBonus: 0.3,
    summary: 'Crew rest recovery speed increased by 30%.',
  },
  'river-cache': {
    name: 'River Cache',
    passiveIncomeBonus: 180,
    missionHeatFlatAdjustment: -0.1,
    summary: 'Generates $180/day and quietly removes 0.1 heat per mission.',
    missionEffectSummary: 'River cache sheds 0.1 mission heat via covert disposal runs.',
  },
  'reinforce-loading-bay': {
    name: 'Reinforce Loading Bay',
    overheadModifierBonus: -80,
    missionHeatFlatAdjustment: -0.05,
    summary: 'Reduces daily overhead by $80 and trims 0.05 mission heat via freight reroutes.',
    missionEffectSummary: 'Reinforced loading bay scrubs 0.05 heat from each score.',
  },
  'workshop-bays': {
    name: 'Workshop Bays',
    overheadModifierBonus: -60,
    missionDurationMultiplier: 0.98,
    summary: 'Cuts daily overhead by $60 and speeds prep 2% with ready bays.',
    missionEffectSummary: 'Workshop bays shave 2% off prep-heavy timers.',
  },
  'dead-drop-network': {
    name: 'Dead Drop Network',
    dailyHeatReductionBonus: 0.12,
    missionHeatMultiplier: 0.98,
    summary: 'Auto-sheds 0.12 heat daily and softens mission heat signatures by 2%.',
    missionEffectSummary: 'Dead drops dampen mission heat by 2%.',
  },
  'operations-floor-plans': {
    name: 'Operations Floor Plans',
    overheadModifierBonus: -120,
    missionSuccessBonus: 0.008,
    summary: 'Reduces overhead by $120 and adds 0.8% success via optimized logistics.',
    missionEffectSummary: 'Ops floor plans add +0.8% mission success from refined playbooks.',
  },
  'ops-briefing-theater': {
    name: 'Ops Briefing Theater',
    crewRestBonus: 0.2,
    missionSuccessBonus: 0.01,
    summary: 'Crew rest recovery +20% and +1% success from live briefings.',
    missionEffectSummary: 'Briefing theater adds +1% success on every contract.',
  },
  'rapid-response-shed': {
    name: 'Rapid Response Shed',
    dailyHeatReductionBonus: 0.1,
    missionDurationMultiplier: 0.97,
    summary: 'Auto-sheds 0.10 heat daily and trims mission timers by 3%.',
    missionEffectSummary: 'Rapid response shed clips 3% off getaway windows.',
  },
  'ghost-terminal-core': {
    name: 'Ghost Terminal Core',
    dailyHeatReductionBonus: 0.25,
    missionHeatFlatAdjustment: -0.2,
    summary: 'Auto-sheds 0.25 heat daily and removes 0.2 heat from each mission.',
    missionEffectSummary: 'Ghost terminal core bleeds 0.2 heat from every operation.',
  },
  'ghost-terminal': {
    name: 'Ghost Terminal',
    dailyHeatReductionBonus: 0.45,
    missionHeatMultiplier: 0.92,
    summary: 'Auto-sheds 0.45 heat daily and slashes mission heat by 8%.',
    missionEffectSummary: 'Ghost terminal slashes mission heat by 8%.',
  },
  'shell-company-hub': {
    name: 'Shell Company Hub',
    passiveIncomeBonus: 420,
    missionPayoutMultiplier: 1.04,
    summary: 'Generates $420/day and boosts payouts 4% via corporate fronts.',
    missionEffectSummary: 'Shell company hub adds +4% mission payout.',
  },
  'executive-front-desk': {
    name: 'Executive Front Desk',
    dailyHeatReductionBonus: 0.08,
    missionHeatMultiplier: 0.97,
    summary: 'Auto-sheds 0.08 heat daily and trims mission heat by 3%.',
    missionEffectSummary: 'Executive front desk clips 3% from mission heat signatures.',
  },
  'rooftop-pad': {
    name: 'Rooftop Landing Pad',
    crewRestBonus: 0.15,
    missionDurationMultiplier: 0.98,
    summary: 'Crew rest +15% and mission timers 2% faster via rooftop drops.',
    missionEffectSummary: 'Rooftop pad speeds missions by 2%.',
  },
  'private-elevator-upfit': {
    name: 'Private Elevator Upfit',
    overheadModifierBonus: -90,
    missionDurationMultiplier: 0.96,
    summary: 'Reduces overhead by $90 and accelerates missions 4% with private lifts.',
    missionEffectSummary: 'Private elevator cuts 4% off mission timers.',
  },
  'executive-war-room': {
    name: 'Executive War Room',
    passiveIncomeBonus: 260,
    missionSuccessBonus: 0.012,
    summary: 'Generates $260/day and adds 1.2% success from negotiation prep.',
    missionEffectSummary: 'Executive war room adds +1.2% mission success.',
  },
  'quiet-network': {
    name: 'Quiet Network',
    dailyHeatReductionBonus: 0.15,
    missionHeatMultiplier: 0.94,
    summary: 'Auto-sheds 0.15 heat daily and dampens mission heat by 6%.',
    missionEffectSummary: 'Quiet network trims mission heat by 6%.',
  },
  'shadow-boardroom-designs': {
    name: 'Shadow Boardroom Designs',
    overheadModifierBonus: -110,
    missionSuccessBonus: 0.01,
    summary: 'Reduces overhead $110 and adds +1% success via civic influence drafts.',
    missionEffectSummary: 'Shadow boardroom plans add +1% success.',
  },
  'shadow-boardroom': {
    name: 'Shadow Boardroom',
    passiveIncomeBonus: 320,
    missionSuccessBonus: 0.018,
    summary: 'Generates $320/day and adds 1.8% success through lobby pressure.',
    missionEffectSummary: 'Shadow boardroom adds +1.8% mission success.',
  },
  'shell-finance-desk': {
    name: 'Shell Finance Desk',
    overheadModifierBonus: -150,
    heatMitigationCostReduction: 1200,
    missionPayoutMultiplier: 1.02,
    summary: 'Reduces overhead $150, adds +2% payouts, and cuts heat buys by $1,200.',
    missionEffectSummary: 'Shell finance desk boosts payouts +2% and discounts heat buys.',
  },
  'phantom-syndicate-expansion': {
    name: 'Phantom Syndicate Expansion',
    dailyHeatReductionBonus: 0.28,
    missionHeatFlatAdjustment: -0.2,
    summary: 'Auto-sheds 0.28 heat daily and scrubs 0.2 heat from missions.',
    missionEffectSummary: 'Phantom expansion removes 0.2 mission heat.',
  },
  'phantom-syndicate-suite': {
    name: 'Phantom Syndicate Suite',
    dailyHeatReductionBonus: 0.4,
    missionHeatMultiplier: 0.9,
    heatMitigationMultiplier: 1.15,
    summary: 'Auto-sheds 0.40 heat daily, slashes mission heat 10%, and amplifies mitigation 15%.',
    missionEffectSummary: 'Phantom syndicate suite cuts mission heat 10% and boosts heat buys.',
  },
  'vip-concierge-ring': {
    name: 'VIP Concierge Ring',
    passiveIncomeBonus: 480,
    missionPayoutMultiplier: 1.05,
    summary: 'Generates $480/day and lifts payouts 5% from exclusive clientele.',
    missionEffectSummary: 'VIP concierge ring adds +5% mission payout.',
  },
  'ops-sim-lab': {
    name: 'Ops Sim Lab',
    missionDurationMultiplier: 0.97,
    missionPayoutMultiplier: 1.03,
    missionSuccessBonus: 0.01,
    summary: 'Mission rehearsals trim 3% off timers and add 3% payout.',
    missionEffectSummary: 'Ops sim lab adds +1% success and tightens timings/payouts.',
  },
  'escape-tunnel-grid': {
    name: 'Escape Tunnel Grid',
    missionDurationMultiplier: 0.95,
    missionHeatMultiplier: 0.96,
    summary: 'Hidden exits cut 5% from escapes and ease heat by 4%.',
    missionEffectSummary: 'Escape tunnels shorten missions and blunt heat signatures.',
  },
  'informant-dead-drops': {
    name: 'Informant Dead Drops',
    heatMitigationBonus: 0.5,
    heatMitigationMultiplier: 1.1,
    heatMitigationCostReduction: 1000,
    summary: 'Dead drops amplify heat buys (+0.5 heat, +10% potency, -$1,000 cost).',
    missionEffectSummary: 'Informant network supercharges paid heat mitigation.',
  },
};

const collectFacilities = (safehouse) => {
  if (!safehouse) {
    return [];
  }

  const facilities = [];
  if (typeof safehouse.getUnlockedAmenities === 'function') {
    facilities.push(...safehouse.getUnlockedAmenities());
  }
  if (typeof safehouse.getActiveProjects === 'function') {
    facilities.push(...safehouse.getActiveProjects());
  }
  return facilities;
};

const computeSafehouseFacilityBonuses = (safehouse) => {
  const totals = {
    passiveIncomeBonus: 0,
    overheadModifierBonus: 0,
    dailyHeatReductionBonus: 0,
    crewRestBonus: 0,
    missionDurationMultiplier: 1,
    missionSuccessBonus: 0,
    missionPayoutMultiplier: 1,
    missionHeatMultiplier: 1,
    missionHeatFlatAdjustment: 0,
    heatMitigationBonus: 0,
    heatMitigationMultiplier: 1,
    heatMitigationCostReduction: 0,
    activeFacilityIds: [],
    missionEffectSummaries: [],
  };

  const facilities = collectFacilities(safehouse);
  if (!facilities.length) {
    return totals;
  }

  const activeIds = new Set();
  facilities.forEach((facility) => {
    const id = facility?.id;
    if (!id) {
      return;
    }
    activeIds.add(id);
    const config = SAFEHOUSE_FACILITY_EFFECTS[id];
    if (!config) {
      return;
    }

    if (Number.isFinite(config.passiveIncomeBonus)) {
      totals.passiveIncomeBonus += config.passiveIncomeBonus;
    }
    if (Number.isFinite(config.overheadModifierBonus)) {
      totals.overheadModifierBonus += config.overheadModifierBonus;
    }
    if (Number.isFinite(config.dailyHeatReductionBonus)) {
      totals.dailyHeatReductionBonus += config.dailyHeatReductionBonus;
    }
    if (Number.isFinite(config.crewRestBonus)) {
      totals.crewRestBonus += config.crewRestBonus;
    }
    if (Number.isFinite(config.missionDurationMultiplier)) {
      totals.missionDurationMultiplier *= clampMultiplier(config.missionDurationMultiplier, {
        min: 0.6,
        max: 1.1,
      });
    }
    if (Number.isFinite(config.missionPayoutMultiplier)) {
      totals.missionPayoutMultiplier *= clampMultiplier(config.missionPayoutMultiplier, {
        min: 0.8,
        max: 1.5,
      });
    }
    if (Number.isFinite(config.missionHeatMultiplier)) {
      totals.missionHeatMultiplier *= clampMultiplier(config.missionHeatMultiplier, {
        min: 0.4,
        max: 1.4,
      });
    }
    if (Number.isFinite(config.missionHeatFlatAdjustment)) {
      totals.missionHeatFlatAdjustment += config.missionHeatFlatAdjustment;
    }
    if (Number.isFinite(config.missionSuccessBonus)) {
      totals.missionSuccessBonus += config.missionSuccessBonus;
    }
    if (Number.isFinite(config.heatMitigationBonus)) {
      totals.heatMitigationBonus += config.heatMitigationBonus;
    }
    if (Number.isFinite(config.heatMitigationMultiplier)) {
      totals.heatMitigationMultiplier *= clampMultiplier(config.heatMitigationMultiplier, {
        min: 0.5,
        max: 1.8,
      });
    }
    if (Number.isFinite(config.heatMitigationCostReduction)) {
      totals.heatMitigationCostReduction += config.heatMitigationCostReduction;
    }
    if (config.missionEffectSummary) {
      totals.missionEffectSummaries.push(config.missionEffectSummary);
    }
  });

  totals.activeFacilityIds = Array.from(activeIds);
  return totals;
};

const getFacilityEffectConfig = (id) => {
  if (!id) {
    return null;
  }
  return SAFEHOUSE_FACILITY_EFFECTS[id] ?? null;
};

export { SAFEHOUSE_FACILITY_EFFECTS, computeSafehouseFacilityBonuses, getFacilityEffectConfig };
