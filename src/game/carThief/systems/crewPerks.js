const percentLabel = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;

const staticPerk = ({
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

const CREW_PERK_REGISTRY = {
  'Ghost Operative perk: -10% heat, +3% success.': staticPerk({
    heatMultiplier: 0.9,
    successBonus: 0.03,
    summary: 'Ghost Operative perk: heat -10%, success +3%.',
  }),
  'Street Racer perk: -12% duration, +2% success.': staticPerk({
    durationMultiplier: 0.88,
    successBonus: 0.02,
    summary: 'Street Racer perk: duration -12%, success +2%.',
  }),
  'Syndicate Fixer perk: +6% payout, -4% heat.': staticPerk({
    payoutMultiplier: 1.06,
    heatMultiplier: 0.96,
    summary: 'Syndicate Fixer perk: payout +6%, heat -4%.',
  }),
  'Garage Prodigy perk: +8% payout, +2% success.': staticPerk({
    payoutMultiplier: 1.08,
    successBonus: 0.02,
    summary: 'Garage Prodigy perk: payout +8%, success +2%.',
  }),
  'Street Enforcer perk: +5% payout, +2.5% success.': staticPerk({
    payoutMultiplier: 1.05,
    successBonus: 0.025,
    summary: 'Street Enforcer perk: payout +5%, success +2.5%.',
  }),
  'Signal Scrambler: Gains +5% success when stealth support is assigned.': {
    apply: ({ member, support = {} }) => {
      const allies = Array.isArray(support.stealth) ? support.stealth : [];
      const contributors = allies.filter((ally) => ally && ally.id !== member?.id);
      if (!contributors.length) {
        return null;
      }
      const allyNames = contributors.map((ally) => ally.name ?? 'Stealth specialist');
      return {
        durationMultiplier: 1,
        payoutMultiplier: 1,
        heatMultiplier: 1,
        successBonus: 0.05,
        summary: `Signal Scrambler: ${percentLabel(0.05)} success with stealth support from ${allyNames.join(', ')}.`,
      };
    },
  },
  'Phantom Overwatch: Adds a light heat reduction bonus when deployed.': staticPerk({
    heatMultiplier: 0.96,
    summary: 'Phantom Overwatch: heat -4%.',
  }),
  'Custom Fabrication: Unlocks bonus vehicle mod options.': staticPerk({
    payoutMultiplier: 1.03,
    summary: 'Custom Fabrication: payout +3% from bespoke mods.',
  }),
  'Dyno Whisperer: Vehicle wear reduced after missions they lead.': staticPerk({
    durationMultiplier: 0.96,
    summary: 'Dyno Whisperer: duration -4% thanks to tuned rigs.',
  }),
  'Favors on Call: Adds a small payout bonus when negotiating.': staticPerk({
    payoutMultiplier: 1.05,
    summary: 'Favors on Call: payout +5% from extra leverage.',
  }),
  'Smokescreen Retainer: Crackdown heat gains eased after successful missions.': staticPerk({
    heatMultiplier: 0.94,
    summary: 'Smokescreen Retainer: heat -6% post-op.',
  }),
  'Frontline Veteran: Crew heat spikes drop when they anchor the team.': staticPerk({
    heatMultiplier: 0.9,
    summary: 'Frontline Veteran: heat -10% while leading the line.',
  }),
  'Zone Commander: Adds success momentum against high-heat jobs.': {
    apply: ({ mission, baseHeat = 0 }) => {
      const difficulty = Number(mission?.difficulty);
      const highHeat = baseHeat >= 1.5 || (Number.isFinite(difficulty) && difficulty >= 3);
      if (!highHeat) {
        return null;
      }
      return {
        durationMultiplier: 1,
        payoutMultiplier: 1,
        heatMultiplier: 1,
        successBonus: 0.04,
        summary: 'Zone Commander: +4% success versus high-heat targets.',
      };
    },
  },
  'Convoy Raider: Unlocks bonus getaway options.': staticPerk({
    durationMultiplier: 0.93,
    summary: 'Convoy Raider: duration -7% via expanded getaway routes.',
  }),
  'Ghost Lines: Adds a modest success boost on high-speed exits.': {
    apply: ({ mission, vehicle }) => {
      const duration = Number.isFinite(mission?.duration)
        ? mission.duration
        : Number.isFinite(mission?.baseDuration)
          ? mission.baseDuration
          : null;
      const vehicleSpeed = Number(vehicle?.topSpeed);
      const fastVehicle = Number.isFinite(vehicleSpeed) && vehicleSpeed >= 130;
      const fastMission = Number.isFinite(duration) && duration <= 34;
      if (!(fastVehicle || fastMission)) {
        return null;
      }
      const reason = fastVehicle && fastMission
        ? 'fast rig and sprint plan'
        : fastVehicle
          ? 'high-speed rig'
          : 'short sprint duration';
      return {
        durationMultiplier: 1,
        payoutMultiplier: 1,
        heatMultiplier: 1,
        successBonus: 0.04,
        summary: `Ghost Lines: +4% success on ${reason}.`,
      };
    },
  },
};

export const getCrewPerkEffect = (perkLabel, context = {}) => {
  if (!perkLabel) {
    return null;
  }
  const normalized = String(perkLabel);
  const entry = CREW_PERK_REGISTRY[normalized];
  if (!entry || typeof entry.apply !== 'function') {
    return null;
  }
  const result = entry.apply(context) ?? null;
  if (!result) {
    return null;
  }

  return {
    durationMultiplier: Number.isFinite(result.durationMultiplier) && result.durationMultiplier > 0
      ? result.durationMultiplier
      : 1,
    payoutMultiplier: Number.isFinite(result.payoutMultiplier) && result.payoutMultiplier > 0
      ? result.payoutMultiplier
      : 1,
    heatMultiplier: Number.isFinite(result.heatMultiplier) && result.heatMultiplier > 0
      ? result.heatMultiplier
      : 1,
    successBonus: Number.isFinite(result.successBonus) ? result.successBonus : 0,
    summary: result.summary ?? normalized,
  };
};

export const getCrewPerkSummaries = () =>
  Object.keys(CREW_PERK_REGISTRY).map((label) => ({
    label,
  }));

