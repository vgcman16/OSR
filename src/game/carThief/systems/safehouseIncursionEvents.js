import { getFacilityEffectConfig } from '../world/safehouseEffects.js';
import { collectSafehouseFacilityIds } from './missionEvents.js';

const SAFEHOUSE_BADGE = { type: 'safehouse-alert', icon: '🏠', label: 'Safehouse Alert' };

const capitalize = (value = '') => {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const prettifyId = (id = '') => {
  if (!id || typeof id !== 'string') {
    return '';
  }
  return id
    .split('-')
    .filter(Boolean)
    .map((segment) => capitalize(segment))
    .join(' ');
};

const resolveFacilityName = (facilityId) => {
  const config = getFacilityEffectConfig(facilityId);
  if (config?.name) {
    return config.name;
  }
  return prettifyId(facilityId) || 'Safehouse Facility';
};

const resolveSafehouseLabel = (safehouse) => {
  if (!safehouse || typeof safehouse !== 'object') {
    return 'Safehouse';
  }
  const name = typeof safehouse.name === 'string' ? safehouse.name.trim() : '';
  const location = typeof safehouse.location === 'string' ? safehouse.location.trim() : '';
  if (name && location) {
    return `${name} — ${location}`;
  }
  if (name) {
    return name;
  }
  if (location) {
    return `${location} Safehouse`;
  }
  return 'Safehouse';
};

const buildFacilityAlertProfile = (
  alertId,
  facilityIds,
  {
    label,
    badgeIcon = '🏗️',
    baseWeight = 1.15,
    triggerProgress = 0.32,
    minDifficulty = 1,
    maxDifficulty = 6,
    cooldownDays = 2,
    buildContent,
  },
) => ({
  alertId,
  facilityIds,
  label,
  badgeIcon,
  baseWeight,
  triggerProgress,
  minDifficulty,
  maxDifficulty,
  cooldownDays,
  buildContent,
});

const facilityAlertProfiles = [
  buildFacilityAlertProfile('safehouse-ghost-terminal-trace', ['ghost-terminal', 'ghost-terminal-core'], {
    label: 'Ghost Terminal Trace',
    badgeIcon: '💻',
    baseWeight: 1.3,
    triggerProgress: 0.28,
    minDifficulty: 2,
    buildContent: ({ facilityId, facilityName, safehouseLabel }) => {
      const description =
        `Corporate trace monitors flag spikes on the ${facilityName} uplink inside ${safehouseLabel}. ` +
        'If the trace completes, it exposes the crew staging lanes.';

      const alertSummary = `${facilityName} flagged by trace watchers — scrub signals before they triangulate the uplink.`;

      return {
        description,
        choices: [
          {
            id: 'safehouse-ghost-terminal-trace-scrub',
            label: 'Scrub the uplink',
            description: 'Divert techs to purge the trace, slowing the run but bleeding off heat.',
            narrative: `${safehouseLabel} rerouted spare cores to scrub the Ghost Terminal trace before it could publish.`,
            effects: {
              durationMultiplier: 1.12,
              heatDelta: -1.3,
              successDelta: 0.04,
              facilityDowntime: {
                facilityId,
                durationDays: 1,
                summary: `${facilityName} offline while technicians reseed clean routes.`,
                penalties: [
                  `${facilityName} bonuses temporarily disabled.`,
                  'Daily heat bleed paused until systems cycle back online.',
                ],
              },
            },
          },
          {
            id: 'safehouse-ghost-terminal-trace-decoy',
            label: 'Overclock decoy routes',
            description: 'Flood the trace with decoys, pushing pace at the cost of visibility.',
            narrative: `${safehouseLabel} weaponized the Ghost Terminal decoys, buying speed at the cost of attention.`,
            effects: {
              payoutMultiplier: 1.08,
              heatDelta: 1.5,
              successDelta: -0.05,
              facilityDowntime: {
                facilityId,
                durationDays: 2,
                summary: `${facilityName} cooling systems after decoy overclock.`,
                penalties: [
                  `${facilityName} heat-masking offline during recovery.`,
                  'Mission heat reduction bonuses unavailable.',
                ],
              },
            },
          },
        ],
        alertSummary,
      };
    },
  }),
  buildFacilityAlertProfile('safehouse-dead-drop-compromise', ['dead-drop-network', 'quiet-network'], {
    label: 'Dead Drop Compromise',
    badgeIcon: '📦',
    baseWeight: 1.2,
    triggerProgress: 0.36,
    cooldownDays: 3,
    buildContent: ({ facilityId, facilityName, safehouseLabel }) => {
      const description =
        `${facilityName} handlers report tampered caches near ${safehouseLabel}. ` +
        'Someone is fishing for the crew’s supply lines while the mission is live.';
      const alertSummary = `${facilityName} caches show tampering — purge compromised drops or pay watchers to look away.`;

      return {
        description,
        choices: [
          {
            id: 'safehouse-dead-drop-purge',
            label: 'Purge the compromised drops',
            description: 'Burn the tainted caches; lose some supplies but settle the heat spike.',
            narrative: `${safehouseLabel} burned the compromised drops and shifted the crew to clean caches.`,
            effects: {
              payoutMultiplier: 0.94,
              heatDelta: -1.1,
              successDelta: 0.03,
              facilityDowntime: {
                facilityId,
                durationDays: 2,
                summary: `${facilityName} rebuilding routes after purging compromised caches.`,
                penalties: [
                  `${facilityName} bonuses suspended during restock.`,
                  'Daily heat bleed offline until couriers reset.',
                ],
              },
            },
          },
          {
            id: 'safehouse-dead-drop-payoff',
            label: 'Buy the watchers off',
            description: 'Pay the lurking spotters to hold off, keeping supplies flowing but raising exposure.',
            narrative: `${safehouseLabel} bought the watchers off, trading discretion for a warmer footprint.`,
            effects: {
              payoutMultiplier: 1.06,
              heatDelta: 1.2,
              successDelta: -0.02,
              facilityDowntime: {
                facilityId,
                durationDays: 1,
                summary: `${facilityName} rerouting couriers after the payoff.`,
                penalties: [
                  `${facilityName} benefits reduced while drops are rotated.`,
                  'Daily heat mitigation paused.',
                ],
              },
            },
          },
        ],
        alertSummary,
      };
    },
  }),
  buildFacilityAlertProfile('safehouse-rapid-response-mobilized', ['rapid-response-shed', 'ops-briefing-theater'], {
    label: 'Rapid Response Mobilized',
    badgeIcon: '🚨',
    baseWeight: 1.25,
    triggerProgress: 0.42,
    minDifficulty: 2,
    buildContent: ({ facilityId, facilityName, safehouseLabel }) => {
      const description =
        `Emergency crews from ${facilityName} spin up to intercept patrol chatter near ${safehouseLabel}. ` +
        'Deploying them now keeps the mission steady but stretches the schedule.';
      const alertSummary = `${facilityName} spins up containment teams — decide whether to deploy them or lock down.`;

      return {
        description,
        choices: [
          {
            id: 'safehouse-rapid-response-deploy',
            label: 'Deploy containment team',
            description: 'Send the rapid response crew to stall patrols, boosting safety at extra cost.',
            narrative: `${safehouseLabel} deployed its rapid response crew, clearing a path at the cost of fresh heat.`,
            effects: {
              successDelta: 0.05,
              heatDelta: 0.9,
              durationMultiplier: 1.08,
              facilityDowntime: {
                facilityId,
                durationDays: 1,
                summary: `${facilityName} crews standing down to recharge after deployment.`,
                penalties: [
                  `${facilityName} speed and safety bonuses offline.`,
                  'Mission duration perks disabled until squads reset.',
                ],
              },
            },
          },
          {
            id: 'safehouse-rapid-response-lockdown',
            label: 'Lock the shed and hunker',
            description: 'Seal the bay and keep crews in reserve, slowing progress but chilling attention.',
            narrative: `${safehouseLabel} locked down ${facilityName}, stretching the run but cooling the search radius.`,
            effects: {
              durationMultiplier: 1.15,
              heatDelta: -1.2,
              payoutMultiplier: 0.97,
              facilityDowntime: {
                facilityId,
                durationDays: 2,
                summary: `${facilityName} sealed for cooldown drills.`,
                penalties: [
                  `${facilityName} bonuses unavailable during lockdown.`,
                  'Mission speed benefits suspended.',
                ],
              },
            },
          },
        ],
        alertSummary,
      };
    },
  }),
];

const heatAlertProfiles = [
  {
    alertId: 'safehouse-heat-alert-sweep',
    heatTiers: ['alert'],
    label: 'Perimeter Recon Sweep',
    badgeIcon: '🔥',
    baseWeight: 1.18,
    triggerProgress: 0.24,
    cooldownDays: 1,
    buildContent: ({ safehouseLabel }) => {
      const description =
        `City heat tier is at Alert. Recon teams sweep the blocks around ${safehouseLabel}, ` +
        'threatening to pin the crew between the site and the safehouse.';
      const alertSummary = 'Alert-tier sweeps probe the safehouse perimeter — either reroute support or ride out the dragnet.';

      return {
        description,
        choices: [
          {
            id: 'safehouse-heat-alert-reroute',
            label: 'Reroute support teams',
            description: 'Pull runners off the mission to spoof patrol patterns, stabilizing heat at a time cost.',
            narrative: `${safehouseLabel} rerouted support teams to ghost the patrol sweep, slowing the push but cooling the board.`,
            effects: {
              durationMultiplier: 1.1,
              heatDelta: -0.9,
              successDelta: 0.03,
            },
          },
          {
            id: 'safehouse-heat-alert-push',
            label: 'Push through the sweep',
            description: 'Keep the plan moving and trust the crew, accepting a hotter exit lane.',
            narrative: `${safehouseLabel} kept pressure on despite the alert-tier sweep, banking on speed over stealth.`,
            effects: {
              payoutMultiplier: 1.05,
              heatDelta: 1.1,
              successDelta: -0.04,
            },
          },
        ],
        alertSummary,
      };
    },
  },
  {
    alertId: 'safehouse-heat-lockdown-dragnet',
    heatTiers: ['lockdown'],
    label: 'Lockdown Dragnet',
    badgeIcon: '🛑',
    baseWeight: 1.35,
    triggerProgress: 0.18,
    cooldownDays: 2,
    buildContent: ({ safehouseLabel }) => {
      const description =
        `Lockdown protocols choke the zone around ${safehouseLabel}. ` +
        'Agents monitor every alley; any mistake exposes the mission staging area.';
      const alertSummary = 'Lockdown dragnet squeezes the safehouse — spend resources to misdirect or brace for heat spikes.';

      return {
        description,
        choices: [
          {
            id: 'safehouse-heat-lockdown-misdirect',
            label: 'Run a misdirection op',
            description: 'Burn favors to spin up decoy convoys, cutting heat but extending the timeline.',
            narrative: `${safehouseLabel} spun up decoy convoys to misdirect the lockdown dragnet.`,
            effects: {
              durationMultiplier: 1.18,
              heatDelta: -1.6,
              successDelta: 0.05,
            },
          },
          {
            id: 'safehouse-heat-lockdown-hold',
            label: 'Hold position and brace',
            description: 'Keep assets tight and power through; profits stay intact but heat will spike hard.',
            narrative: `${safehouseLabel} held position under the lockdown dragnet, protecting the score at the cost of exposure.`,
            effects: {
              payoutMultiplier: 1.07,
              heatDelta: 1.8,
              successDelta: -0.06,
            },
          },
        ],
        alertSummary,
      };
    },
  },
];

const facilityProfileById = facilityAlertProfiles.reduce((map, profile) => {
  profile.facilityIds.forEach((facilityId) => {
    map.set(facilityId, profile);
  });
  return map;
}, new Map());

const heatProfileByTier = heatAlertProfiles.reduce((map, profile) => {
  profile.heatTiers.forEach((tier) => {
    map.set(tier, profile);
  });
  return map;
}, new Map());

const buildEventPayload = ({
  alertId,
  label,
  badgeIcon,
  baseWeight,
  triggerProgress,
  minDifficulty,
  maxDifficulty,
  cooldownDays,
  buildContent,
  context,
  facilityId = null,
  heatTier = null,
}) => {
  const safehouseLabel = resolveSafehouseLabel(context.safehouse);
  const facilityName = facilityId ? resolveFacilityName(facilityId) : null;
  const content = buildContent({
    facilityId,
    facilityName: facilityName ?? 'Safehouse Facility',
    safehouseLabel,
    heatTier,
  });

  if (!content || !Array.isArray(content.choices) || !content.choices.length) {
    return null;
  }

  const event = {
    id: alertId,
    label,
    description: content.description ?? `${label} triggered at the safehouse.`,
    triggerProgress,
    minDifficulty,
    maxDifficulty,
    baseWeight,
    riskTiers: ['low', 'moderate', 'high'],
    crackdownTiers: ['calm', 'alert', 'lockdown'],
    choices: content.choices.map((choice) => {
      const cloned = { ...choice };
      if (cloned.effects && typeof cloned.effects === 'object') {
        const effects = { ...cloned.effects };
        if (effects.facilityDowntime && typeof effects.facilityDowntime === 'object') {
          effects.facilityDowntime = {
            ...effects.facilityDowntime,
            facilityId: facilityId ?? effects.facilityDowntime.facilityId ?? null,
          };
        }
        cloned.effects = effects;
      }
      return cloned;
    }),
    badges: [
      { ...SAFEHOUSE_BADGE },
      facilityName
        ? { type: 'facility', icon: badgeIcon, label: facilityName }
        : { type: 'heat-tier', icon: badgeIcon, label: capitalize(heatTier ?? 'alert') },
    ],
    triggered: false,
    resolved: false,
    safehouseAlertId: alertId,
    safehouseAlertCooldownDays: cooldownDays,
    facilityId,
    facilityName,
    heatTier,
    source: 'safehouse-incursion',
  };

  const alert = {
    id: alertId,
    label,
    summary: content.alertSummary ?? `${label} active around ${safehouseLabel}.`,
    status: 'alert',
    severity: heatTier === 'lockdown' ? 'critical' : 'warning',
    facilityId,
    facilityName,
    heatTier,
    safehouseId: context.safehouse?.id ?? null,
    safehouseLabel,
    cooldownDays,
    triggeredAt: Date.now(),
  };

  return { event, alert };
};

const buildSafehouseIncursionEvents = (mission, context = {}) => {
  const safehouse = context.safehouse ?? null;
  const currentHeatTier = typeof context.heatTier === 'string' ? context.heatTier.trim().toLowerCase() : null;

  const generatedEvents = [];
  const generatedAlerts = [];
  const usedAlertIds = new Set();

  const facilityIds = new Set(
    collectSafehouseFacilityIds(safehouse)
      .map((id) => (typeof id === 'string' ? id.trim().toLowerCase() : null))
      .filter(Boolean),
  );

  facilityIds.forEach((facilityId) => {
    const profile = facilityProfileById.get(facilityId);
    if (!profile || usedAlertIds.has(profile.alertId)) {
      return;
    }

    const payload = buildEventPayload({
      ...profile,
      context: { ...context, safehouse },
      facilityId,
    });

    if (!payload) {
      return;
    }

    generatedEvents.push(payload.event);
    generatedAlerts.push(payload.alert);
    usedAlertIds.add(profile.alertId);
  });

  if (currentHeatTier) {
    const heatProfile = heatProfileByTier.get(currentHeatTier);
    if (heatProfile && !usedAlertIds.has(heatProfile.alertId)) {
      const payload = buildEventPayload({
        ...heatProfile,
        context: { ...context, safehouse },
        heatTier: currentHeatTier,
      });
      if (payload) {
        generatedEvents.push(payload.event);
        generatedAlerts.push(payload.alert);
        usedAlertIds.add(heatProfile.alertId);
      }
    }
  }

  if (!generatedEvents.length) {
    return { events: [], alerts: [] };
  }

  return { events: generatedEvents, alerts: generatedAlerts };
};

export { buildSafehouseIncursionEvents };
