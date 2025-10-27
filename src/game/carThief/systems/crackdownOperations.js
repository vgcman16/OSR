const CRACKDOWN_OPERATION_DEFINITIONS = {
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
