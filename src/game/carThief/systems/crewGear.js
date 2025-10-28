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
  'wheelman-escape-pack': {
    id: 'wheelman-escape-pack',
    label: 'Wheelman Escape Pack',
    description: 'Pre-rigged exfil caches tuned for wheelmen to blast through roadblocks.',
    cost: 3600,
    apply: ({ member, vehicle }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const isWheelman = specialty === 'wheelman';
      const handling = Number(vehicle?.handling);
      const handlingBonus = Number.isFinite(handling) && handling >= 6 ? 0.01 : 0;

      const durationMultiplier = isWheelman ? 0.88 : 0.94;
      const heatMultiplier = isWheelman ? 0.94 : 0.97;
      const successBonus = (isWheelman ? 0.03 : 0.017) + handlingBonus;

      const segments = [
        `Wheelman Escape Pack: ${percentLabel(1 - durationMultiplier)} faster exits.`,
        `${percentLabel(successBonus)} success from staged routes.`,
      ];
      if (handlingBonus > 0) {
        segments.push('High-handling ride adds an extra +1% success.');
      }
      if (isWheelman) {
        segments.push('Wheelman mastery bleeds pursuit heat by 6%.');
      } else {
        segments.push('Shared playbooks still trim a little pursuit heat.');
      }

      return {
        durationMultiplier,
        payoutMultiplier: 1,
        heatMultiplier,
        successBonus,
        summary: segments.join(' '),
      };
    },
  },
  'signal-forger-kit': {
    id: 'signal-forger-kit',
    label: 'Signal Forger Kit',
    description: 'Quantum scramblers rewrite surveillance logs during high-pressure infiltrations.',
    cost: 4800,
    apply: ({ member, mission, baseHeat = 0 }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const specialist = specialty === 'hacker' || specialty === 'infiltrator';
      const crackdownTier = typeof mission?.crackdownTier === 'string'
        ? mission.crackdownTier.toLowerCase()
        : typeof mission?.activeCrackdownTier === 'string'
          ? mission.activeCrackdownTier.toLowerCase()
          : '';
      const crackdownBonus = crackdownTier === 'lockdown' ? 0.04 : crackdownTier === 'alert' ? 0.02 : 0;
      const highHeat = Number.isFinite(baseHeat) && baseHeat >= 1.3;

      const baseHeatMultiplier = specialist ? 0.9 : 0.95;
      const heatMultiplier = highHeat ? baseHeatMultiplier - 0.05 : baseHeatMultiplier;
      const durationMultiplier = specialist ? 0.97 : 1;
      const successBonus = (specialist ? 0.03 : 0.015) + crackdownBonus;

      const parts = [`Signal Forger Kit: heat ${percentLabel(1 - heatMultiplier)} lower.`];
      if (specialist) {
        parts.push('Specialist protocols shave mission time by 3%.');
      }
      if (crackdownBonus > 0) {
        parts.push(`Crackdown bonus adds ${percentLabel(crackdownBonus)} success.`);
      }

      return {
        durationMultiplier,
        payoutMultiplier: 1,
        heatMultiplier,
        successBonus,
        summary: parts.join(' '),
      };
    },
  },
  'ops-sim-tablet': {
    id: 'ops-sim-tablet',
    label: 'Ops Sim Tablet',
    description: 'Portable sim rigs let tacticians rehearse scenarios minutes before launch.',
    cost: 4100,
    apply: ({ member }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const planner = specialty === 'tactician' || specialty === 'spotter';

      const durationMultiplier = planner ? 0.92 : 0.96;
      const payoutMultiplier = planner ? 1.07 : 1.03;
      const successBonus = planner ? 0.025 : 0.015;

      return {
        durationMultiplier,
        payoutMultiplier,
        heatMultiplier: 1,
        successBonus,
        summary:
          `Ops Sim Tablet: ${percentLabel(1 - durationMultiplier)} faster prep, ${percentLabel(payoutMultiplier - 1)} payout bump, ${percentLabel(successBonus)} success.`,
      };
    },
  },
  'holo-decoy-projector': {
    id: 'holo-decoy-projector',
    label: 'Holo Decoy Projector',
    description: 'Deployable holograms mislead response teams when the crackdown tightens.',
    cost: 4550,
    apply: ({ member, mission }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const face = specialty === 'face' || specialty === 'infiltrator';
      const crackdownTier = typeof mission?.crackdownTier === 'string'
        ? mission.crackdownTier.toLowerCase()
        : typeof mission?.activeCrackdownTier === 'string'
          ? mission.activeCrackdownTier.toLowerCase()
          : '';
      const crackdownBonus = crackdownTier === 'lockdown' ? 0.06 : crackdownTier === 'alert' ? 0.03 : 0;

      const heatMultiplier = face ? 0.88 : 0.93;
      const successBonus = (face ? 0.028 : 0.018) + crackdownBonus;

      const lines = [`Holo Decoy Projector: heat ${percentLabel(1 - heatMultiplier)} softer.`];
      if (crackdownBonus > 0) {
        lines.push(`Crackdown diversion adds ${percentLabel(crackdownBonus)} success.`);
      }
      if (face) {
        lines.push('Face crews squeeze extra credibility from the ruse.');
      }

      return {
        durationMultiplier: 1,
        payoutMultiplier: 1,
        heatMultiplier,
        successBonus,
        summary: lines.join(' '),
      };
    },
  },
  'urban-camouflage-kit': {
    id: 'urban-camouflage-kit',
    label: 'Urban Camouflage Kit',
    description: 'Adaptive fabrics, burner IDs, and cover scripts keep crews invisible mid-sweep.',
    cost: 3950,
    apply: ({ mission, baseHeat = 0 }) => {
      const crackdownTier = typeof mission?.crackdownTier === 'string'
        ? mission.crackdownTier.toLowerCase()
        : typeof mission?.activeCrackdownTier === 'string'
          ? mission.activeCrackdownTier.toLowerCase()
          : '';
      const crackdownBonus = crackdownTier === 'lockdown' ? 0.05 : crackdownTier === 'alert' ? 0.025 : 0;
      const highHeat = Number.isFinite(baseHeat) && baseHeat >= 1.25;

      const heatMultiplier = highHeat ? 0.9 : 0.94;
      const durationMultiplier = highHeat ? 0.97 : 0.99;
      const successBonus = 0.015 + crackdownBonus;

      const segments = [`Urban Camouflage Kit: heat ${percentLabel(1 - heatMultiplier)} softer.`];
      if (highHeat) {
        segments.push('High-heat routes trigger quick-change drills (-3% duration).');
      }
      if (crackdownBonus > 0) {
        segments.push(`Crackdown cover adds ${percentLabel(crackdownBonus)} success.`);
      }

      return {
        durationMultiplier,
        payoutMultiplier: 1,
        heatMultiplier,
        successBonus,
        summary: segments.join(' '),
      };
    },
  },
  'overwatch-uplink': {
    id: 'overwatch-uplink',
    label: 'Overwatch Uplink',
    description: 'Secure drones feed live overlays to tacticians, spotters, and wheelmen.',
    cost: 4300,
    apply: ({ member, vehicle }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const commandSpecialist = specialty === 'tactician' || specialty === 'spotter';
      const wheelman = specialty === 'wheelman';
      const handling = Number(vehicle?.handling);
      const handlingBonus = Number.isFinite(handling) && handling >= 6 ? 0.01 : 0;

      const durationMultiplier = commandSpecialist ? 0.92 : wheelman ? 0.94 : 0.97;
      const heatMultiplier = commandSpecialist ? 0.94 : 0.97;
      const payoutMultiplier = commandSpecialist ? 1.02 : 1.01;
      const successBonus = (commandSpecialist ? 0.03 : wheelman ? 0.022 : 0.018) + handlingBonus;

      const notes = [
        `Overwatch Uplink: ${percentLabel(1 - durationMultiplier)} faster execution.`,
        `${percentLabel(successBonus)} success from live targeting.`,
      ];
      if (handlingBonus > 0) {
        notes.push('High-handling ride adds an extra +1% success.');
      }
      if (commandSpecialist) {
        notes.push('Command specialists bleed pursuit heat by 6%.');
      }

      return {
        durationMultiplier,
        payoutMultiplier,
        heatMultiplier,
        successBonus,
        summary: notes.join(' '),
      };
    },
  },
  'holo-breach-belt': {
    id: 'holo-breach-belt',
    label: 'Holo Breach Belt',
    description: 'Projection grids map vault seams so infiltrators clip timers and heat.',
    cost: 5050,
    apply: ({ member, mission }) => {
      const specialty = typeof member?.specialty === 'string' ? member.specialty.toLowerCase() : '';
      const infiltrator = specialty === 'infiltrator' || specialty === 'hacker';
      const difficulty = Number.isFinite(mission?.difficulty) ? mission.difficulty : 2;
      const toughContract = difficulty >= 3;

      const durationMultiplier = toughContract ? 0.94 : 0.97;
      const payoutMultiplier = infiltrator ? 1.05 : 1.03;
      const heatMultiplier = infiltrator ? 0.9 : 0.94;
      const successBonus = (infiltrator ? 0.035 : 0.02) + (toughContract ? 0.01 : 0);

      const details = [
        `Holo Breach Belt: ${percentLabel(1 - durationMultiplier)} faster penetration.`,
        `${percentLabel(payoutMultiplier - 1)} payout bump.`,
        `Heat ${percentLabel(1 - heatMultiplier)} softer.`,
      ];
      if (toughContract) {
        details.push('High difficulty unlocks another +1% success.');
      }
      if (infiltrator) {
        details.push('Specialists coax extra success from the mapping grid.');
      }

      return {
        durationMultiplier,
        payoutMultiplier,
        heatMultiplier,
        successBonus,
        summary: details.join(' '),
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
