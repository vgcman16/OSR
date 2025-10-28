const clampNumber = (value, fallback = 0) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

const executeHeatMitigation = ({
  heatSystem,
  missionSystem,
  economySystem,
  reduction,
  cost = 0,
  label = 'Heat mitigation',
  metadata,
} = {}) => {
  if (!heatSystem || typeof heatSystem.applyMitigation !== 'function') {
    return { success: false, reason: 'heat-system-unavailable' };
  }

  if (!economySystem || typeof economySystem.adjustFunds !== 'function') {
    return { success: false, reason: 'economy-system-unavailable' };
  }

  const state = heatSystem.state ?? missionSystem?.state ?? economySystem?.state ?? null;
  const funds = clampNumber(state?.funds, 0);
  const normalizedCost = Number.isFinite(cost) && cost > 0 ? cost : 0;

  if (funds < normalizedCost) {
    return { success: false, reason: 'insufficient-funds', cost: normalizedCost, fundsAvailable: funds };
  }

  if (normalizedCost > 0) {
    economySystem.adjustFunds(-normalizedCost);
  }

  const mitigationTelemetry = heatSystem.applyMitigation(reduction, {
    label,
    fundsSpent: normalizedCost,
    metadata,
  });

  missionSystem?.syncHeatTier?.('heat-mitigation');

  return {
    success: true,
    cost: normalizedCost,
    heatBefore: mitigationTelemetry.heatBefore,
    heatAfter: mitigationTelemetry.heatAfter,
    heatDelta: mitigationTelemetry.heatDelta,
    reductionApplied: mitigationTelemetry.reductionApplied,
  };
};

export { executeHeatMitigation };
