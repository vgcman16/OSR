const percentLabel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return '0%';
  }
  return `${numeric > 0 ? '+' : ''}${Math.round(numeric * 100)}%`;
};

const staticGearEffect = ({
  durationMultiplier = 1,
  payoutMultiplier = 1,
  heatMultiplier = 1,
  successBonus = 0,
  summary,
}) => ({
  apply: () => ({
    durationMultiplier,
    payoutMultiplier,
    heatMultiplier,
    successBonus,
    summary,
  }),
});

const CREW_GEAR_CATALOG = {
  'thermal-shroud': {
    id: 'thermal-shroud',
    label: 'Thermal Shroud',
    description: 'Active cooling mesh that masks exhaust heat during infiltration.',
    cost: 4200,
    ...staticGearEffect({
      heatMultiplier: 0.94,
      summary: 'Thermal Shroud: heat -6% from cooled signatures.',
    }),
  },
  'relay-drone': {
    id: 'relay-drone',
    label: 'Relay Drone',
    description: 'Autonomous scout that feeds updated escape routes mid-mission.',
    cost: 4700,
    ...staticGearEffect({
      durationMultiplier: 0.95,
      successBonus: 0.02,
      summary: 'Relay Drone: 5% faster execution, +2% success from live routing.',
    }),
  },
  'signal-disruptor': {
    id: 'signal-disruptor',
    label: 'Signal Disruptor',
    description: 'Pulsed scrambler that shines when pressure spikes on high-heat jobs.',
    cost: 5200,
    apply: ({ mission, baseHeat = 0 }) => {
      const difficulty = Number(mission?.difficulty);
      const heatPressure = baseHeat >= 1.4;
      const toughContract = Number.isFinite(difficulty) && difficulty >= 3;
      if (!heatPressure && !toughContract) {
        return {
          durationMultiplier: 1,
          payoutMultiplier: 1,
          heatMultiplier: 0.98,
          successBonus: 0,
          summary: 'Signal Disruptor: heat -2% on routine runs.',
        };
      }

      const contextLabel = heatPressure && toughContract
        ? 'high-heat, high-risk contracts'
        : heatPressure
          ? 'high-heat routes'
          : 'high-difficulty contracts';

      return {
        durationMultiplier: 1,
        payoutMultiplier: 1,
        heatMultiplier: 0.92,
        successBonus: 0.03,
        summary: `Signal Disruptor: heat -8%, ${percentLabel(0.03)} success on ${contextLabel}.`,
      };
    },
  },
};

const normalizeEffectResult = (gearId, effect = {}) => {
  if (!effect) {
    return null;
  }

  return {
    id: gearId,
    durationMultiplier:
      Number.isFinite(effect.durationMultiplier) && effect.durationMultiplier > 0
        ? effect.durationMultiplier
        : 1,
    payoutMultiplier:
      Number.isFinite(effect.payoutMultiplier) && effect.payoutMultiplier > 0
        ? effect.payoutMultiplier
        : 1,
    heatMultiplier:
      Number.isFinite(effect.heatMultiplier) && effect.heatMultiplier > 0
        ? effect.heatMultiplier
        : 1,
    successBonus: Number.isFinite(effect.successBonus) ? effect.successBonus : 0,
    summary: effect.summary ?? '',
  };
};

export const getCrewGearEffect = (gearId, context = {}) => {
  if (!gearId) {
    return null;
  }

  const normalizedId = String(gearId);
  const entry = CREW_GEAR_CATALOG[normalizedId];
  if (!entry) {
    return null;
  }

  const payload = { ...context, gear: entry };
  const effect = typeof entry.apply === 'function' ? entry.apply(payload) : entry;
  const normalized = normalizeEffectResult(normalizedId, effect);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    label: entry.label ?? normalizedId,
    summary: normalized.summary || entry.label || normalizedId,
  };
};

export const getCrewGearSummaries = () =>
  Object.values(CREW_GEAR_CATALOG).map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
  }));

export { CREW_GEAR_CATALOG };
