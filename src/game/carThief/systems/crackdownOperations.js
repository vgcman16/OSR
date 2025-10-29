const CRACKDOWN_OPERATION_DEFINITIONS = {
  calm: [
    {
      id: 'calm-sabotage-sensor-net',
      name: 'Spoof the Sensor Net',
      difficulty: 1,
      payout: 9000,
      heat: 1,
      duration: 30,
      description: 'Feed false patrol data into enforcement systems to keep them complacent.',
      crackdownEffects: {
        heatReduction: 0.9,
        heatPenaltyOnFailure: 0.45,
      },
    },
    {
      id: 'calm-disable-rapid-response',
      name: 'Ghost the Rapid Response Wing',
      difficulty: 2,
      payout: 12000,
      heat: 1,
      duration: 36,
      description: 'Stage a quiet raid that sidelines crackdown responders before they mobilize.',
      crackdownEffects: {
        heatReduction: 1.1,
        heatPenaltyOnFailure: 0.55,
      },
    },
    {
      id: 'calm-hijack-patrol-roster',
      name: 'Hijack Patrol Roster',
      difficulty: 2,
      payout: 13500,
      heat: 1,
      duration: 38,
      description: 'Forge rota orders that sideline elite crackdown units for a full cycle.',
      crackdownEffects: {
        heatReduction: 1.3,
        heatPenaltyOnFailure: 0.65,
      },
    },
    {
      id: 'calm-burn-sting-budget',
      name: 'Burn the Sting Budget',
      difficulty: 2,
      payout: 14500,
      heat: 1,
      duration: 40,
      description: 'Bleed enforcement coffers with bogus requisitions before raids launch.',
      crackdownEffects: {
        heatReduction: 1.5,
        heatPenaltyOnFailure: 0.75,
      },
    },
  ],
  alert: [
    {
      id: 'alert-sabotage-dragnet',
      name: 'Sabotage Dragnet Towers',
      difficulty: 2,
      payout: 11000,
      heat: 1,
      duration: 36,
      description: 'Hit crackdown comms towers to loosen the dragnet covering your jobs.',
      crackdownEffects: {
        heatReduction: 1.2,
        heatPenaltyOnFailure: 0.6,
      },
    },
    {
      id: 'alert-intercept-convoy',
      name: 'Intercept Enforcement Convoy',
      difficulty: 3,
      payout: 15000,
      heat: 1,
      duration: 42,
      description: 'Ambush a rapid-response convoy to steal enforcement intel and cool the streets.',
      crackdownEffects: {
        heatReduction: 1.6,
        heatPenaltyOnFailure: 0.8,
      },
    },
    {
      id: 'alert-sow-counterintel',
      name: 'Sow Counter-Intel Doubt',
      difficulty: 3,
      payout: 17000,
      heat: 1,
      duration: 46,
      description: 'Flood crackdown analysts with conflicting leads until the dragnet fractures.',
      crackdownEffects: {
        heatReduction: 1.8,
        heatPenaltyOnFailure: 0.9,
      },
    },
    {
      id: 'alert-exfiltrate-informant',
      name: 'Extract the Crackdown Informant',
      difficulty: 4,
      payout: 20000,
      heat: 1,
      duration: 50,
      description: 'Lift a key snitch from custody to steal their case files and crash the alert.',
      crackdownEffects: {
        heatReduction: 2.1,
        heatPenaltyOnFailure: 1.05,
      },
    },
  ],
  lockdown: [
    {
      id: 'lockdown-blackout-grid',
      name: 'Blackout the City Grid',
      difficulty: 3,
      payout: 16000,
      heat: 1,
      duration: 48,
      description: 'Cut power to a crackdown command grid to force a redeploy and relieve pressure.',
      crackdownEffects: {
        heatReduction: 2.2,
        heatPenaltyOnFailure: 1,
      },
    },
    {
      id: 'lockdown-safehouse-defense',
      name: 'Defend the Safehouse Ring',
      difficulty: 4,
      payout: 19000,
      heat: 1,
      duration: 54,
      description: 'Stage a defensive op that protects your hideouts and rolls back the crackdown.',
      crackdownEffects: {
        heatReduction: 2.8,
        heatPenaltyOnFailure: 1.2,
      },
    },
    {
      id: 'lockdown-break-command-loop',
      name: 'Break the Command Loop',
      difficulty: 5,
      payout: 23000,
      heat: 1,
      duration: 60,
      description: 'Cripple crackdown command uplinks so local captains revert to defensive postures.',
      crackdownEffects: {
        heatReduction: 3.1,
        heatPenaltyOnFailure: 1.4,
      },
    },
    {
      id: 'lockdown-topple-execution-squads',
      name: 'Topple the Execution Squads',
      difficulty: 5,
      payout: 25500,
      heat: 1,
      duration: 66,
      description: 'Lead a decisive strike that dismantles the elite enforcement squads on standby.',
      crackdownEffects: {
        heatReduction: 3.6,
        heatPenaltyOnFailure: 1.6,
      },
    },
  ],
};

const getCrackdownOperationTemplates = (tier) => {
  const normalizedTier = typeof tier === 'string' ? tier.toLowerCase() : 'calm';
  const operations = CRACKDOWN_OPERATION_DEFINITIONS[normalizedTier];
  if (!Array.isArray(operations) || !operations.length) {
    return [];
  }

  return operations.map((operation) => ({
    ...operation,
    category: 'crackdown-operation',
    crackdownTier: normalizedTier,
    ignoreCrackdownRestrictions: true,
    crackdownEffects: operation.crackdownEffects ? { ...operation.crackdownEffects } : {},
  }));
};

export { getCrackdownOperationTemplates };
