import { aggregateVehicleModBonuses, VEHICLE_MOD_CATALOG } from '../entities/vehicle.js';

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const summarizeEffects = (effects = {}) => {
  const parts = [];

  if (Number.isFinite(effects.payoutMultiplier) && effects.payoutMultiplier !== 1) {
    const deltaPercent = Math.round((effects.payoutMultiplier - 1) * 100);
    if (deltaPercent !== 0) {
      parts.push(`Payout ${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`);
    }
  }

  if (Number.isFinite(effects.payoutDelta) && effects.payoutDelta !== 0) {
    const amount = Math.round(effects.payoutDelta);
    parts.push(`Payout ${amount > 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString()}`);
  }

  if (Number.isFinite(effects.heatDelta) && Math.abs(effects.heatDelta) >= 0.05) {
    parts.push(`${effects.heatDelta > 0 ? '+' : ''}${effects.heatDelta.toFixed(1)} heat`);
  }

  if (Number.isFinite(effects.successDelta) && Math.abs(effects.successDelta) >= 0.005) {
    const deltaPercent = Math.round(effects.successDelta * 100);
    parts.push(`${deltaPercent > 0 ? '+' : ''}${deltaPercent}% success`);
  }

  if (Number.isFinite(effects.durationMultiplier) && effects.durationMultiplier !== 1) {
    const deltaPercent = Math.round((effects.durationMultiplier - 1) * 100);
    if (deltaPercent !== 0) {
      parts.push(`Duration ${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`);
    }
  }

  if (Number.isFinite(effects.durationDelta) && effects.durationDelta !== 0) {
    const delta = Math.round(effects.durationDelta);
    if (delta !== 0) {
      parts.push(`Duration ${delta > 0 ? '+' : ''}${delta}s`);
    }
  }

  if (Number.isFinite(effects.crewLoyaltyDelta) && effects.crewLoyaltyDelta !== 0) {
    parts.push(`Crew loyalty ${effects.crewLoyaltyDelta > 0 ? '+' : ''}${Math.round(effects.crewLoyaltyDelta)}`);
  }

  return parts.join(', ');
};

const buildTraitSummary = (crewMembers = []) => {
  const summary = {
    stealth: 0,
    tech: 0,
    driving: 0,
    tactics: 0,
    charisma: 0,
    muscle: 0,
  };

  crewMembers.forEach((member) => {
    if (!member || typeof member !== 'object') {
      return;
    }

    const traits = member.traits ?? {};
    Object.keys(summary).forEach((traitKey) => {
      const level = Number(traits[traitKey]);
      if (Number.isFinite(level) && level >= 3) {
        summary[traitKey] += 1;
      }
    });
  });

  return summary;
};

const rosterLabel = (crewNames = []) => {
  if (!Array.isArray(crewNames) || crewNames.length === 0) {
    return 'The crew';
  }

  if (crewNames.length === 1) {
    return crewNames[0];
  }

  if (crewNames.length === 2) {
    return `${crewNames[0]} & ${crewNames[1]}`;
  }

  const [first, second, ...rest] = crewNames;
  return `${first}, ${second}${rest.length ? ` +${rest.length}` : ''}`;
};

const RISK_TIER_ORDER = ['low', 'moderate', 'high', 'severe'];
const normalizeRiskTier = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return RISK_TIER_ORDER.includes(normalized) ? normalized : null;
};

const CRACKDOWN_TIER_ORDER = ['calm', 'alert', 'lockdown'];
const normalizeCrackdownTier = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return CRACKDOWN_TIER_ORDER.includes(normalized) ? normalized : null;
};

const buildMissionTagSet = (missionTags = [], missionCategory = null) => {
  const normalized = new Set();
  missionTags.forEach((tag) => {
    if (typeof tag === 'string' && tag.trim()) {
      normalized.add(tag.trim().toLowerCase());
    }
  });
  if (typeof missionCategory === 'string' && missionCategory.trim()) {
    normalized.add(missionCategory.trim().toLowerCase());
  }
  return normalized;
};

const coerceFinite = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildVehicleInfiltrationProfile = (vehicle) => {
  if (!vehicle || typeof vehicle !== 'object') {
    return null;
  }

  const installedMods = typeof vehicle.getInstalledMods === 'function'
    ? vehicle.getInstalledMods()
    : Array.isArray(vehicle.installedMods)
      ? vehicle.installedMods.slice()
      : [];

  const modBonuses = typeof vehicle.getModBonuses === 'function'
    ? vehicle.getModBonuses(VEHICLE_MOD_CATALOG)
    : aggregateVehicleModBonuses(installedMods, VEHICLE_MOD_CATALOG);

  const effectivePerformance = typeof vehicle.getEffectivePerformance === 'function'
    ? vehicle.getEffectivePerformance(VEHICLE_MOD_CATALOG)
    : {
        topSpeed: coerceFinite(vehicle.topSpeed),
        acceleration: coerceFinite(vehicle.acceleration),
        handling: coerceFinite(vehicle.handling),
      };

  const topSpeed = coerceFinite(effectivePerformance.topSpeed, coerceFinite(vehicle.topSpeed, 0));
  const acceleration = coerceFinite(
    effectivePerformance.acceleration,
    coerceFinite(vehicle.acceleration, 0),
  );
  const handling = coerceFinite(effectivePerformance.handling, coerceFinite(vehicle.handling, 0));
  const condition = coerceFinite(vehicle.condition, null);
  const heat = coerceFinite(vehicle.heat, null);

  const performanceScore =
    (topSpeed ? Math.max(0.4, topSpeed / 120) : 1)
    + (acceleration ? Math.max(0.4, acceleration / 5) : 1)
    + (handling ? Math.max(0.4, handling / 5) : 1);

  const heatMitigationScore =
    (Number.isFinite(modBonuses.heatMultiplier) && modBonuses.heatMultiplier < 1
      ? Math.min(0.6, 1 - modBonuses.heatMultiplier)
      : 0)
    + (Number.isFinite(modBonuses.heatGainMultiplier) && modBonuses.heatGainMultiplier < 1
      ? Math.min(0.5, 1 - modBonuses.heatGainMultiplier)
      : 0)
    + (Number.isFinite(modBonuses.heatFlatAdjustment) && modBonuses.heatFlatAdjustment < 0
      ? Math.min(0.3, Math.abs(modBonuses.heatFlatAdjustment))
      : 0);

  return {
    label: typeof vehicle.model === 'string' ? vehicle.model : 'Assigned vehicle',
    installedMods,
    modBonuses,
    effectivePerformance: {
      topSpeed,
      acceleration,
      handling,
    },
    topSpeed,
    acceleration,
    handling,
    condition,
    heat,
    performanceScore,
    heatMitigationScore,
    hasOverdriveFocus: performanceScore >= 3.2 || (topSpeed ?? 0) >= 150,
    hasStealthFocus:
      heatMitigationScore >= 0.25
      || installedMods.some((mod) =>
        typeof mod === 'string'
        && /stealth|ghost|signal|mask|cloak|specter|decoy/i.test(mod),
      ),
  };
};

const describeRiskTierBrief = (tier) => {
  switch (tier) {
    case 'severe':
      return 'severe-risk';
    case 'high':
      return 'high-risk';
    case 'moderate':
      return 'moderate-risk';
    case 'low':
    default:
      return 'low-risk';
  }
};

const describeCrackdownPosture = (tier) => {
  switch (tier) {
    case 'lockdown':
      return 'lockdown crackdown';
    case 'alert':
      return 'alert crackdown';
    case 'calm':
    default:
      return 'calm crackdown';
  }
};

const missionHasTag = (tagSet, tagsToMatch = []) => {
  if (!(tagSet instanceof Set) || !tagsToMatch?.length) {
    return false;
  }

  return tagsToMatch.some((tag) => tagSet.has(tag));
};

const safehouseHasFacility = (facilityIds = [], idsToMatch = []) => {
  if (!Array.isArray(facilityIds) || !idsToMatch?.length) {
    return false;
  }

  const normalized = facilityIds
    .map((id) => (typeof id === 'string' ? id.trim().toLowerCase() : ''))
    .filter(Boolean);
  return idsToMatch.some((match) => normalized.includes(match));
};

const STEP_LIBRARY = [
  {
    id: 'perimeter-breach',
    phaseLabel: 'Infiltration',
    badgeIcon: '🕶️',
    label: 'Stage the breach',
    required: true,
    priority: 100,
    matches: () => true,
    buildPrompt: ({ missionName, crewNames, riskTier }) => {
      const crewLabel = rosterLabel(crewNames);
      const missionLabel = missionName ? ` for ${missionName}` : '';
      const riskDescriptor = riskTier ? ` against ${describeRiskTierBrief(riskTier)} defenses` : '';
      return `${crewLabel} scout access points${missionLabel}${riskDescriptor}. How do they crack the perimeter?`;
    },
    buildChoices: ({ traitSummary }) => {
      const stealthBonus = traitSummary.stealth >= 2 ? ' Their stealth training keeps the noise floor low.' : '';
      const tacticsBonus = traitSummary.tactics >= 2 ? ' Tactical overlays keep the team synced.' : '';

      return [
        {
          id: 'ghost-the-grid',
          label: 'Ghost the security grid',
          description:
            'Lean on stealth and sensor spoofers to slip past patrols, buying safety at the cost of tempo.' +
            stealthBonus,
          narrative: 'They ghosted the perimeter, cycling cameras and dropping false signals as they slid inside.',
          effects: {
            durationMultiplier: 1.08,
            heatDelta: -0.8,
            successDelta: 0.05,
          },
        },
        {
          id: 'shock-entry',
          label: 'Shock entry push',
          description:
            'Hit the gate hard with breaching charges and drone noise, trading subtlety for speed and payout.',
          narrative: 'The crew blasted a path through, overwhelming the first response and surging forward.',
          effects: {
            payoutMultiplier: 1.06,
            heatDelta: 1.1,
            successDelta: -0.03,
            durationMultiplier: 0.93,
          },
        },
        {
          id: 'social-engineer',
          label: 'Social engineer the checkpoint',
          description:
            'Forge identities and bribe the door crew to glide inside. Keeps morale high but stirs minor chatter.' +
            tacticsBonus,
          narrative: 'Forged paperwork and quick bribes eased the crew through the checkpoint without firing a shot.',
          effects: {
            payoutMultiplier: 1.03,
            successDelta: 0.03,
            heatDelta: 0.3,
          },
        },
      ];
    },
  },
  {
    id: 'recon-overwatch',
    phaseLabel: 'Recon',
    badgeIcon: '📡',
    label: 'Secure overwatch lanes',
    priority: 95,
    matches: ({ riskTier, crackdownTier, missionTagSet }) =>
      riskTier === 'high'
        || riskTier === 'severe'
        || crackdownTier === 'alert'
        || crackdownTier === 'lockdown'
        || missionHasTag(missionTagSet, ['surveillance', 'intel', 'data-heist', 'cyber-raid']),
    buildPrompt: ({ missionName, riskTier, crackdownTier }) => {
      const targetLabel = missionName ? missionName : 'the target';
      const riskDescriptor = riskTier ? describeRiskTierBrief(riskTier) : 'the risk profile';
      const crackdownDescriptor = describeCrackdownPosture(crackdownTier);
      return `Overwatch teams map ${targetLabel}, balancing ${riskDescriptor} threats with the ${crackdownDescriptor}. What scouting pattern do they run?`;
    },
    buildChoices: ({ traitSummary }) => {
      const techEdge = traitSummary.tech >= 2 ? ' Specialist hackers accelerate sensor alignment.' : '';
      const tacticsEdge = traitSummary.tactics >= 2 ? ' Tactical overlays choreograph the recon lanes.' : '';

      return [
        {
          id: 'drone-net',
          label: 'Deploy the drone net',
          description:
            'Roll out silent drones to chart patrol arcs, trading minutes for crystal intel.' + techEdge,
          narrative: 'Micro-drones painted patrol patterns, feeding the crew a living map.',
          effects: {
            durationMultiplier: 1.06,
            successDelta: 0.04,
            heatDelta: -0.4,
          },
        },
        {
          id: 'street-lookouts',
          label: 'Blend with street lookouts',
          description:
            'Embed watchers in nearby stalls and cafés to phone in movements. Faster, but noisier.' + tacticsEdge,
          narrative: 'Lookouts streamed updates from the street, letting the crew slip between sweeps.',
          effects: {
            durationMultiplier: 0.96,
            heatDelta: 0.6,
            successDelta: -0.02,
          },
        },
        {
          id: 'skip-recon',
          label: 'Trust the intel packet',
          description:
            'Lean on cached intel and push ahead. Keeps tempo high but gambles on gaps staying quiet.',
          narrative: 'They pushed past recon, trusting their gut to stay ahead of the clock.',
          effects: {
            durationMultiplier: 0.92,
            successDelta: -0.03,
            heatDelta: 0.2,
            payoutMultiplier: 1.02,
          },
        },
      ];
    },
  },
  {
    id: 'objective-lockdown',
    phaseLabel: 'Execution',
    badgeIcon: '🎯',
    label: 'Secure the target',
    required: true,
    priority: 90,
    matches: () => true,
    buildPrompt: ({ missionName, crewNames, riskTier }) => {
      const crewLabel = rosterLabel(crewNames);
      const subject = missionName ? `the core objective of ${missionName}` : 'the target';
      const riskDescriptor = riskTier ? ` amid ${describeRiskTierBrief(riskTier)} resistance` : '';
      return `${crewLabel} breach ${subject}${riskDescriptor}. How do they handle the lockdown?`;
    },
    buildChoices: ({ traitSummary }) => {
      const techNote = traitSummary.tech >= 2 ? ' Specialist hackers cut through the ICE in record time.' : '';
      const muscleNote = traitSummary.muscle >= 2 ? ' Heavy hitters keep the opposition on its heels.' : '';

      return [
        {
          id: 'precision-siphon',
          label: 'Precision siphon',
          description:
            'Route the payload cleanly and leave the system intact. Safer, slower, but keeps the take stable.' +
            techNote,
          narrative: 'They ghosted the locks and siphoned the goods without tripping the failsafes.',
          effects: {
            durationMultiplier: 1.05,
            successDelta: 0.04,
            heatDelta: -0.4,
          },
        },
        {
          id: 'smash-and-grab',
          label: 'Smash-and-grab rush',
          description:
            'Crack the vault loud and fast to shave minutes. The payout swells but fallout grows.' + muscleNote,
          narrative: 'The crew tore the locks open, hauling the score before the timers could reset.',
          effects: {
            payoutMultiplier: 1.08,
            heatDelta: 1.3,
            successDelta: -0.04,
            durationMultiplier: 0.92,
          },
        },
        {
          id: 're-route-the-score',
          label: 'Re-route through ghost channels',
          description:
            'Patch the take through off-site relays to hide the trail. Calmer heat profile but costs loyalty work.',
          narrative: 'Ghost relays swallowed the payload, scattering the signal across the city grid.',
          effects: {
            payoutMultiplier: 0.97,
            heatDelta: -1.0,
            successDelta: 0.02,
            crewLoyaltyDelta: 1,
          },
        },
      ];
    },
  },
  {
    id: 'counter-crackdown-response',
    phaseLabel: 'Countermeasures',
    badgeIcon: '🚨',
    label: 'Blunt crackdown pursuit',
    priority: 88,
    matches: ({ crackdownTier }) => crackdownTier === 'alert' || crackdownTier === 'lockdown',
    buildPrompt: ({ missionName, crackdownTier }) => {
      const target = missionName ? missionName : 'the score';
      const crackdownLabel = describeCrackdownPosture(crackdownTier);
      return `Crackdown units shadow ${target}. How does the crew blunt the ${crackdownLabel}?`;
    },
    buildChoices: ({ safehouseFacilities = [], traitSummary }) => {
      const terminalBoost = safehouseHasFacility(safehouseFacilities, ['ghost-terminal', 'ghost-terminal-core']);
      const dropSupport = safehouseHasFacility(safehouseFacilities, ['dead-drop-network', 'informant-dead-drops']);
      const stealthEdge = traitSummary.stealth >= 2 ? ' Veteran infiltrators weave in false signals.' : '';

      return [
        {
          id: 'spoof-command-chain',
          label: 'Spoof the command chain',
          description:
            'Hijack the crackdown dispatch uplink to stall their response.' +
            (terminalBoost ? ' Ghost terminals amplify the spoof, stretching the delay.' : '') +
            stealthEdge,
          narrative: 'Hijacked dispatch loops fed the crackdown a sanitized feed while the crew pressed on.',
          effects: {
            durationMultiplier: 1.05,
            heatDelta: -0.9,
            successDelta: 0.03,
          },
        },
        {
          id: 'burn-contact-favors',
          label: 'Burn contact favors',
          description:
            'Lean on hush-money and local favors to redirect patrols.' +
            (dropSupport ? ' Dead drops keep the payoffs invisible.' : ''),
          narrative: 'Contacts rerouted pursuit teams, cash changing hands in the alleys while the crew slipped by.',
          effects: {
            payoutMultiplier: 0.98,
            heatDelta: -0.6,
            crewLoyaltyDelta: 1,
          },
        },
        {
          id: 'break-the-cordon',
          label: 'Break the cordon head-on',
          description:
            'Stage a coordinated strike on the rapid-response perimeter to buy raw speed.',
          narrative: 'They shattered the cordon with timed charges, sprinting through before the net reset.',
          effects: {
            durationMultiplier: 0.9,
            heatDelta: 0.9,
            successDelta: -0.02,
            payoutMultiplier: 1.04,
          },
        },
      ];
    },
  },
  {
    id: 'vehicle-overdrive',
    phaseLabel: 'Getaway',
    badgeIcon: '🚗',
    label: 'Tune the getaway vector',
    priority: 86,
    matches: ({ vehicleProfile }) => Boolean(vehicleProfile && (vehicleProfile.hasOverdriveFocus || vehicleProfile.hasStealthFocus)),
    buildPrompt: ({ missionName, vehicleProfile }) => {
      const vehicleLabel = vehicleProfile?.label ?? 'the crew wheels';
      const missionLabel = missionName ? ` for ${missionName}` : '';
      return `The crew calibrate ${vehicleLabel}${missionLabel}. Do they push for raw speed or ghost the dragnet?`;
    },
    buildChoices: ({ vehicleProfile = {}, traitSummary }) => {
      const { hasStealthFocus, hasOverdriveFocus } = vehicleProfile;
      const handlingEdge = traitSummary.driving >= 2 ? ' Veteran wheelmen squeeze every ounce of control.' : '';

      return [
        {
          id: 'silent-running',
          label: 'Silent running tune',
          description:
            'Dial the ride into stealth mode, masking signatures at the cost of a slower burn.' +
            (hasStealthFocus ? ' Installed stealth suites thrive on the low profile.' : ''),
          narrative: 'Baffled vents and RF scramblers muted the getaway, letting the crew vanish into traffic.',
          effects: {
            durationMultiplier: 1.04,
            heatDelta: -0.7,
            successDelta: 0.03,
          },
        },
        {
          id: 'thruster-dash',
          label: 'Thruster dash plan',
          description:
            'Push the throttle mapping for a brutal exit. Faster and richer, but heat flares.' +
            (hasOverdriveFocus ? ' Overdrive mods gulp the extra output without flinching.' : ''),
          narrative: 'Boost injectors lit up the streets as the crew rocketed out ahead of the dragnet.',
          effects: {
            durationMultiplier: 0.88,
            payoutMultiplier: 1.05,
            heatDelta: 0.9,
            successDelta: -0.04,
          },
        },
        {
          id: 'relay-handoff',
          label: 'Safehouse relay handoff',
          description:
            'Swap plates and crews mid-flight at prepped relays. Steadies odds but adds paperwork.' +
            handlingEdge,
          narrative: 'Mid-route relays swapped drivers and plates, shedding pursuit layers step by step.',
          effects: {
            durationMultiplier: 1.06,
            successDelta: 0.04,
            crewLoyaltyDelta: 1,
            heatDelta: -0.3,
          },
        },
      ];
    },
  },
  {
    id: 'data-ghost-siphon',
    phaseLabel: 'Payload',
    badgeIcon: '💾',
    label: 'Crack the data core',
    priority: 82,
    matches: ({ missionTagSet }) =>
      missionHasTag(missionTagSet, ['surveillance', 'data-heist', 'intel', 'cyber-raid', 'network']),
    buildPrompt: ({ missionName }) => {
      const target = missionName ? missionName : 'the target node';
      return `Sensitive intel inside ${target} waits on a razor-thin window. How does the crew siphon the data?`;
    },
    buildChoices: ({ traitSummary }) => {
      const techEdge = traitSummary.tech >= 2 ? ' Expert coders carve out exploit chains mid-stream.' : '';
      const charismaEdge = traitSummary.charisma >= 2 ? ' Smooth talkers keep analysts second-guessing the breach.' : '';

      return [
        {
          id: 'deep-packet-dive',
          label: 'Deep packet dive',
          description:
            'Spool mirrored nodes and exfil the data quietly. Slower, safer, and steadies success.' + techEdge,
          narrative: 'Shadow relays spun up quietly, copying shards until the full archive slid free.',
          effects: {
            durationMultiplier: 1.07,
            successDelta: 0.05,
            heatDelta: -0.4,
          },
        },
        {
          id: 'flash-burn',
          label: 'Flash-burn siphon',
          description:
            'Spike the core, copy everything, and torch the access log. Blisteringly fast but messy.',
          narrative: 'They flash-burned the vault, ripping the data before failsafes crashed the system.',
          effects: {
            durationMultiplier: 0.9,
            payoutMultiplier: 1.06,
            heatDelta: 1.0,
            successDelta: -0.05,
          },
        },
        {
          id: 'seed-backdoor',
          label: 'Seed a long-play backdoor',
          description:
            'Install a silent tap for recurring intel streams. Takes finesse but cements leverage.' + charismaEdge,
          narrative: 'A ghost backdoor took root, promising months of drip-fed intel after the crew slipped away.',
          effects: {
            payoutMultiplier: 1.02,
            successDelta: 0.03,
            crewLoyaltyDelta: 1,
          },
        },
      ];
    },
  },
  {
    id: 'safehouse-lifeline',
    phaseLabel: 'Logistics',
    badgeIcon: '🏠',
    label: 'Leverage the safehouse network',
    priority: 78,
    matches: ({ safehouseFacilities = [] }) =>
      safehouseHasFacility(
        safehouseFacilities,
        [
          'dead-drop-network',
          'ghost-terminal',
          'ghost-terminal-core',
          'escape-tunnel-grid',
          'ops-sim-lab',
          'shell-company-hub',
        ],
      ),
    buildPrompt: ({ missionName }) => {
      const missionLabel = missionName ? missionName : 'the op';
      return `Safehouse assets stand ready to backstop ${missionLabel}. Which logistics play anchors the run?`;
    },
    buildChoices: ({ safehouseFacilities = [], traitSummary }) => {
      const hasTunnels = safehouseHasFacility(safehouseFacilities, ['escape-tunnel-grid']);
      const hasShellHub = safehouseHasFacility(safehouseFacilities, ['shell-company-hub', 'shell-finance-desk']);
      const tacticsEdge = traitSummary.tactics >= 2 ? ' Coordinators choreograph the shifts flawlessly.' : '';

      return [
        {
          id: 'dead-drop-relay',
          label: 'Dead drop relay chain',
          description:
            'Cycle loot and comms through dead drops to scrub signatures.' +
            (hasShellHub ? ' Shell accounts launder the transfers instantly.' : ''),
          narrative: 'Courier relays kept the score moving, every packet vanishing into shell networks.',
          effects: {
            durationMultiplier: 1.05,
            heatDelta: -0.7,
            successDelta: 0.02,
          },
        },
        {
          id: 'ops-sim-dry-run',
          label: 'Ops sim dry run',
          description:
            'Run a last-minute sim lab rehearsal to sharpen execution. Adds prep time but tightens odds.' +
            tacticsEdge,
          narrative: 'Sim lab holo-scenarios ironed out the playbook before the crew moved.',
          effects: {
            durationMultiplier: 1.04,
            successDelta: 0.04,
            heatDelta: -0.2,
          },
        },
        {
          id: 'tunnel-exfil',
          label: 'Tunnel exfil staging',
          description:
            'Pre-stage tunnel grids and alternate exits for the pull-out.' +
            (hasTunnels ? ' Existing escape tunnels snap online instantly.' : ''),
          narrative: 'Hidden tunnel nodes synced with the plan, promising a clean vanish on the way out.',
          effects: {
            durationMultiplier: 0.97,
            successDelta: 0.02,
            heatDelta: -0.3,
          },
        },
      ];
    },
  },
  {
    id: 'escape-route',
    phaseLabel: 'Exfiltration',
    badgeIcon: '🏁',
    label: 'Run the escape',
    priority: 70,
    matches: ({ difficulty, riskTier }) => difficulty >= 3 || riskTier === 'moderate' || riskTier === 'high' || riskTier === 'severe',
    buildPrompt: ({ missionName, crewNames }) => {
      const crewLabel = rosterLabel(crewNames);
      const missionSuffix = missionName ? ` after ${missionName}` : '';
      return `${crewLabel} stitch together the exit lanes${missionSuffix}. What’s the getaway play?`;
    },
    buildChoices: ({ traitSummary }) => {
      const drivingNote = traitSummary.driving >= 2 ? ' Veteran wheelmen promise razor-fine control.' : '';
      const charismaNote = traitSummary.charisma >= 2 ? ' Social cover keeps the watchers second-guessing.' : '';

      return [
        {
          id: 'shadow-escape',
          label: 'Shadow escape convoy',
          description:
            'Split into staggered convoys and dive into service tunnels. Slow, but heat falls away.' + charismaNote,
          narrative: 'Layered convoys and ghost lights walked the crew out under the city’s nose.',
          effects: {
            durationMultiplier: 1.07,
            heatDelta: -1.1,
            successDelta: 0.03,
          },
        },
        {
          id: 'high-octane-sprint',
          label: 'High-octane sprint',
          description:
            'Punch the throttles and take the express route. Huge adrenaline spike, but risky.' + drivingNote,
          narrative: 'Engines screamed as the team blasted out, weaving through traffic before the cordon could close.',
          effects: {
            payoutMultiplier: 1.04,
            heatDelta: 1.0,
            successDelta: -0.05,
            durationMultiplier: 0.88,
          },
        },
        {
          id: 'safehouse-relay',
          label: 'Safehouse relay chain',
          description:
            'Bounce the crew through allied safehouses and false plates. Adds paperwork but cements loyalty.',
          narrative: 'Allied crews smuggled the team through relay points, buying anonymity with favors.',
          effects: {
            durationMultiplier: 1.12,
            heatDelta: -0.6,
            successDelta: 0.02,
            crewLoyaltyDelta: 1,
          },
        },
      ];
    },
  },
];

const pickStepTemplates = (mission, context = {}) => {
  if (!mission) {
    return [];
  }

  const difficulty = Number.isFinite(context.difficulty)
    ? context.difficulty
    : Number.isFinite(mission.difficulty)
      ? mission.difficulty
      : 3;

  const riskTier = normalizeRiskTier(context.riskTier ?? mission.riskTier) ?? 'low';
  const crackdownTier = normalizeCrackdownTier(context.crackdownTier ?? mission.crackdownTier);
  const missionTagSet = buildMissionTagSet(context.missionTags ?? mission.tags, mission.category);
  const safehouseFacilities = Array.isArray(context.safehouseFacilities)
    ? context.safehouseFacilities
    : [];
  const baseContext = {
    ...context,
    difficulty,
    riskTier,
    crackdownTier,
    missionTagSet,
    safehouseFacilities,
  };

  const matched = STEP_LIBRARY.filter((template) => {
    if (typeof template.matches === 'function') {
      try {
        return template.matches(baseContext);
      } catch (error) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (!matched.length) {
    return [];
  }

  const selected = [];
  matched.forEach((template) => {
    if (template.required && !selected.includes(template)) {
      selected.push(template);
    }
  });

  let targetCount;
  if (difficulty <= 1) {
    targetCount = 2;
  } else if (difficulty >= 6) {
    targetCount = 5;
  } else if (difficulty >= 4) {
    targetCount = 4;
  } else {
    targetCount = 3;
  }

  const optionalPhaseCount = matched.filter((template) => !template.required).length;
  const minimumCount = Math.min(
    matched.length,
    Math.min(6, Math.max(targetCount, selected.length + optionalPhaseCount)),
  );

  matched.forEach((template) => {
    if (selected.length >= minimumCount) {
      return;
    }
    if (!selected.includes(template)) {
      selected.push(template);
    }
  });

  return selected;
};

const instantiateStep = (template, context) => {
  if (!template) {
    return null;
  }

  const now = Date.now();
  const prompt = typeof template.buildPrompt === 'function' ? template.buildPrompt(context) : template.label;
  const rawChoices = typeof template.buildChoices === 'function' ? template.buildChoices(context) : [];
  const choices = Array.isArray(rawChoices)
    ? rawChoices
        .map((choice) => {
          if (!choice || typeof choice !== 'object') {
            return null;
          }

          const id = typeof choice.id === 'string' ? choice.id.trim() : null;
          const label = typeof choice.label === 'string' ? choice.label.trim() : null;
          const description = typeof choice.description === 'string' ? choice.description.trim() : null;
          if (!id || !label || !description) {
            return null;
          }

          const narrative = typeof choice.narrative === 'string' ? choice.narrative.trim() : null;
          const effects = choice.effects && typeof choice.effects === 'object' ? { ...choice.effects } : {};

          return {
            id,
            label,
            description,
            narrative,
            effects,
          };
        })
        .filter(Boolean)
    : [];

  if (!choices.length) {
    return null;
  }

  return {
    id: template.id,
    label: template.label,
    prompt,
    badgeIcon: template.badgeIcon ?? '🎯',
    phaseLabel: template.phaseLabel ?? 'Infiltration',
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    choices,
  };
};

const createInfiltrationSequence = (
  mission,
  {
    crewMembers = [],
    crewNames = [],
    missionTags = null,
    crackdownTier = null,
    safehouseFacilities = null,
    safehouseBonuses = null,
    vehicleProfile = null,
    vehicleImpact = null,
  } = {},
) => {
  if (!mission) {
    return null;
  }

  const traitSummary = buildTraitSummary(crewMembers);
  const difficulty = Number.isFinite(mission.difficulty) ? mission.difficulty : 3;
  const riskTier = normalizeRiskTier(mission.riskTier) ?? 'low';
  const normalizedCrackdownTier = normalizeCrackdownTier(crackdownTier ?? mission.crackdownTier ?? null);
  const normalizedMissionTags = Array.isArray(missionTags)
    ? missionTags.filter((tag) => typeof tag === 'string' && tag.trim())
    : Array.isArray(mission.tags)
      ? mission.tags.filter((tag) => typeof tag === 'string' && tag.trim())
      : [];
  const normalizedSafehouseFacilities = Array.isArray(safehouseFacilities)
    ? safehouseFacilities
    : [];

  const stepTemplates = pickStepTemplates(mission, {
    difficulty,
    riskTier,
    crackdownTier: normalizedCrackdownTier,
    missionTags: normalizedMissionTags,
    safehouseFacilities: normalizedSafehouseFacilities,
    vehicleProfile,
  });
  const steps = stepTemplates
    .map((template) => instantiateStep(template, {
      missionName: mission.name,
      crewNames,
      traitSummary,
      riskTier,
      crackdownTier: normalizedCrackdownTier,
      missionTags: normalizedMissionTags,
      safehouseFacilities: normalizedSafehouseFacilities,
      safehouseBonuses,
      vehicleProfile,
      vehicleImpact,
    }))
    .filter(Boolean);

  if (!steps.length) {
    return null;
  }

  return {
    id: `infiltration-${mission.id ?? 'mission'}-${Date.now().toString(36)}`,
    missionId: mission.id ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    steps,
    history: [],
    aggregateEffects: {
      payoutMultiplier: 1,
      payoutDelta: 0,
      heatDelta: 0,
      successDelta: 0,
      durationMultiplier: 1,
      durationDelta: 0,
      crewLoyaltyDelta: 0,
    },
    crewNames: Array.isArray(crewNames) ? crewNames.slice() : [],
  };
};

const getNextInfiltrationStep = (sequence) => {
  if (!sequence || !Array.isArray(sequence.steps)) {
    return null;
  }

  return sequence.steps.find((step) => step && step.status !== 'resolved') ?? null;
};

const applyInfiltrationChoice = (sequence, stepId, choiceId) => {
  if (!sequence || !Array.isArray(sequence.steps)) {
    return null;
  }

  const step = sequence.steps.find((entry) => entry?.id === stepId);
  if (!step || !Array.isArray(step.choices)) {
    return null;
  }

  const choice = step.choices.find((entry) => entry?.id === choiceId);
  if (!choice) {
    return null;
  }

  const now = Date.now();
  const effects = choice.effects ?? {};

  if (sequence.aggregateEffects) {
    if (Number.isFinite(effects.payoutMultiplier) && effects.payoutMultiplier !== 1) {
      sequence.aggregateEffects.payoutMultiplier *= effects.payoutMultiplier;
    }
    if (Number.isFinite(effects.payoutDelta) && effects.payoutDelta !== 0) {
      sequence.aggregateEffects.payoutDelta += Math.round(effects.payoutDelta);
    }
    if (Number.isFinite(effects.heatDelta) && effects.heatDelta !== 0) {
      sequence.aggregateEffects.heatDelta += effects.heatDelta;
    }
    if (Number.isFinite(effects.successDelta) && effects.successDelta !== 0) {
      sequence.aggregateEffects.successDelta += effects.successDelta;
    }
    if (Number.isFinite(effects.durationMultiplier) && effects.durationMultiplier !== 1) {
      sequence.aggregateEffects.durationMultiplier *= effects.durationMultiplier;
    }
    if (Number.isFinite(effects.durationDelta) && effects.durationDelta !== 0) {
      sequence.aggregateEffects.durationDelta += effects.durationDelta;
    }
    if (Number.isFinite(effects.crewLoyaltyDelta) && effects.crewLoyaltyDelta !== 0) {
      sequence.aggregateEffects.crewLoyaltyDelta += effects.crewLoyaltyDelta;
    }
  }

  const effectSummary = summarizeEffects(effects);
  const summaryParts = [`${step.label}: ${choice.label}`];
  if (choice.narrative) {
    summaryParts.push(choice.narrative);
  }
  if (effectSummary) {
    summaryParts.push(`Effects: ${effectSummary}`);
  }

  const historyEntry = {
    stepId: step.id,
    stepLabel: step.label,
    choiceId: choice.id,
    choiceLabel: choice.label,
    narrative: choice.narrative ?? null,
    resolvedAt: now,
    effects: { ...effects },
    effectSummary,
    summary: summaryParts.join(' ').trim(),
  };

  step.status = 'resolved';
  step.resolvedAt = now;
  step.resolvedChoiceId = choice.id;
  sequence.history.push(historyEntry);
  sequence.updatedAt = now;

  const nextStep = getNextInfiltrationStep(sequence);
  if (!nextStep) {
    sequence.status = 'resolved';
    sequence.completedAt = now;
  }

  return {
    step,
    choice,
    historyEntry,
    effectSummary,
  };
};

const cloneSequence = (sequence) => {
  if (!sequence || typeof sequence !== 'object') {
    return null;
  }

  const clone = {
    id: sequence.id,
    missionId: sequence.missionId ?? null,
    status: sequence.status,
    createdAt: sequence.createdAt ?? null,
    updatedAt: sequence.updatedAt ?? null,
    completedAt: sequence.completedAt ?? null,
    crewNames: Array.isArray(sequence.crewNames) ? sequence.crewNames.slice() : [],
    aggregateEffects: { ...sequence.aggregateEffects },
    history: Array.isArray(sequence.history)
      ? sequence.history.map((entry) => ({
          stepId: entry.stepId,
          stepLabel: entry.stepLabel,
          choiceId: entry.choiceId,
          choiceLabel: entry.choiceLabel,
          narrative: entry.narrative ?? null,
          resolvedAt: entry.resolvedAt ?? null,
          effectSummary: entry.effectSummary ?? null,
          summary: entry.summary ?? null,
        }))
      : [],
    steps: Array.isArray(sequence.steps)
      ? sequence.steps.map((step) => ({
          id: step.id,
          label: step.label,
          prompt: step.prompt,
          badgeIcon: step.badgeIcon,
          phaseLabel: step.phaseLabel,
          status: step.status,
          createdAt: step.createdAt ?? null,
          updatedAt: step.updatedAt ?? null,
          resolvedAt: step.resolvedAt ?? null,
          resolvedChoiceId: step.resolvedChoiceId ?? null,
          choices: Array.isArray(step.choices)
            ? step.choices.map((choice) => ({
                id: choice.id,
                label: choice.label,
                description: choice.description,
                narrative: choice.narrative ?? null,
                effects: { ...choice.effects },
              }))
            : [],
        }))
      : [],
  };

  return clone;
};

export {
  applyInfiltrationChoice,
  buildVehicleInfiltrationProfile,
  cloneSequence,
  createInfiltrationSequence,
  getNextInfiltrationStep,
  summarizeEffects as summarizeInfiltrationEffects,
};

