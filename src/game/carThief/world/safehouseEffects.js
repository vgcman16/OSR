const SAFEHOUSE_FACILITY_EFFECTS = {
  'crash-cots': {
    name: 'Crash Cots',
    crewRestBonus: 0.3,
    summary: 'Crew rest recovery speed increased by 30%.',
  },
  'river-cache': {
    name: 'River Cache',
    passiveIncomeBonus: 180,
    summary: 'Generates an extra $180 in passive income per day.',
  },
  'reinforce-loading-bay': {
    name: 'Reinforce Loading Bay',
    overheadModifierBonus: -80,
    summary: 'Reduces daily overhead costs by $80.',
  },
  'workshop-bays': {
    name: 'Workshop Bays',
    overheadModifierBonus: -60,
    summary: 'Cuts daily overhead by $60 thanks to streamlined prep.',
  },
  'dead-drop-network': {
    name: 'Dead Drop Network',
    dailyHeatReductionBonus: 0.12,
    summary: 'Automatically removes an additional 0.12 heat per day.',
  },
  'operations-floor-plans': {
    name: 'Operations Floor Plans',
    overheadModifierBonus: -120,
    summary: 'Reduces daily overhead costs by $120 through better logistics.',
  },
  'ops-briefing-theater': {
    name: 'Ops Briefing Theater',
    crewRestBonus: 0.2,
    summary: 'Crew rest recovery speed increased by 20%.',
  },
  'rapid-response-shed': {
    name: 'Rapid Response Shed',
    dailyHeatReductionBonus: 0.1,
    summary: 'Automatically removes an additional 0.10 heat per day.',
  },
  'ghost-terminal-core': {
    name: 'Ghost Terminal Core',
    dailyHeatReductionBonus: 0.25,
    summary: 'Automatically removes an additional 0.25 heat per day.',
  },
  'ghost-terminal': {
    name: 'Ghost Terminal',
    dailyHeatReductionBonus: 0.45,
    summary: 'Automatically removes an additional 0.45 heat per day.',
  },
  'shell-company-hub': {
    name: 'Shell Company Hub',
    passiveIncomeBonus: 420,
    summary: 'Generates an extra $420 in passive income per day.',
  },
  'executive-front-desk': {
    name: 'Executive Front Desk',
    dailyHeatReductionBonus: 0.08,
    summary: 'Automatically removes an additional 0.08 heat per day.',
  },
  'rooftop-pad': {
    name: 'Rooftop Landing Pad',
    crewRestBonus: 0.15,
    summary: 'Crew rest recovery speed increased by 15%.',
  },
  'private-elevator-upfit': {
    name: 'Private Elevator Upfit',
    overheadModifierBonus: -90,
    summary: 'Reduces daily overhead costs by $90.',
  },
  'executive-war-room': {
    name: 'Executive War Room',
    passiveIncomeBonus: 260,
    summary: 'Generates an extra $260 in passive income per day.',
  },
  'quiet-network': {
    name: 'Quiet Network',
    dailyHeatReductionBonus: 0.15,
    summary: 'Automatically removes an additional 0.15 heat per day.',
  },
  'shadow-boardroom-designs': {
    name: 'Shadow Boardroom Designs',
    overheadModifierBonus: -110,
    summary: 'Reduces daily overhead costs by $110.',
  },
  'shadow-boardroom': {
    name: 'Shadow Boardroom',
    passiveIncomeBonus: 320,
    summary: 'Generates an extra $320 in passive income per day.',
  },
  'shell-finance-desk': {
    name: 'Shell Finance Desk',
    overheadModifierBonus: -150,
    summary: 'Reduces daily overhead costs by $150.',
  },
  'phantom-syndicate-expansion': {
    name: 'Phantom Syndicate Expansion',
    dailyHeatReductionBonus: 0.28,
    summary: 'Automatically removes an additional 0.28 heat per day.',
  },
  'phantom-syndicate-suite': {
    name: 'Phantom Syndicate Suite',
    dailyHeatReductionBonus: 0.4,
    summary: 'Automatically removes an additional 0.40 heat per day.',
  },
  'vip-concierge-ring': {
    name: 'VIP Concierge Ring',
    passiveIncomeBonus: 480,
    summary: 'Generates an extra $480 in passive income per day.',
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
    activeFacilityIds: [],
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
