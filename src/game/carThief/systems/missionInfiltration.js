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

const STEP_LIBRARY = [
  {
    id: 'perimeter-breach',
    phaseLabel: 'Infiltration',
    badgeIcon: '🕶️',
    label: 'Stage the breach',
    buildPrompt: ({ missionName, crewNames }) => {
      const crewLabel = rosterLabel(crewNames);
      const missionLabel = missionName ? ` for ${missionName}` : '';
      return `${crewLabel} scout access points${missionLabel}. How do they crack the perimeter?`;
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
    id: 'objective-lockdown',
    phaseLabel: 'Execution',
    badgeIcon: '🎯',
    label: 'Secure the target',
    buildPrompt: ({ missionName, crewNames }) => {
      const crewLabel = rosterLabel(crewNames);
      const subject = missionName ? `the core objective of ${missionName}` : 'the target';
      return `${crewLabel} breach ${subject}. How do they handle the lockdown?`;
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
    id: 'escape-route',
    phaseLabel: 'Exfiltration',
    badgeIcon: '🏁',
    label: 'Run the escape',
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

const pickStepTemplates = (mission) => {
  if (!mission) {
    return [];
  }

  const difficulty = Number.isFinite(mission.difficulty) ? mission.difficulty : 3;
  const steps = [];

  steps.push(STEP_LIBRARY[0]);
  steps.push(STEP_LIBRARY[1]);

  if (difficulty >= 3) {
    steps.push(STEP_LIBRARY[2]);
  }

  return steps;
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

const createInfiltrationSequence = (mission, { crewMembers = [], crewNames = [] } = {}) => {
  if (!mission) {
    return null;
  }

  const traitSummary = buildTraitSummary(crewMembers);
  const stepTemplates = pickStepTemplates(mission);
  const steps = stepTemplates
    .map((template) => instantiateStep(template, {
      missionName: mission.name,
      crewNames,
      traitSummary,
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
  cloneSequence,
  createInfiltrationSequence,
  getNextInfiltrationStep,
  summarizeEffects as summarizeInfiltrationEffects,
};

