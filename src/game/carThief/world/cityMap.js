const clampMetric = (value, { min = 0, max = 100, fallback = 50 } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric < min) {
    return min;
  }

  if (numeric > max) {
    return max;
  }

  return numeric;
};

const DEFAULT_CAMPAIGN_BLUEPRINTS = {
  Downtown: [
    {
      id: 'downtown-campaign-setup',
      name: 'Skytech Insider Lift',
      stage: 0,
      description: 'Coordinate a deep cover lift to seed assets inside SkyTech.',
      requirements: { influence: 58, intelLevel: 52 },
      rewardPreview: 'Unlock SkyTech server ghosting for the next phase.',
      contract: {
        id: 'downtown-campaign-stage-1',
        name: 'SkyTech Ghost Protocol',
        description:
          'Plant a ghost access node inside SkyTech to prep a multi-part corporate raid.',
        difficulty: 3,
        payout: 28000,
        heat: 2,
        duration: 52,
        category: 'campaign-operation',
        riskTier: 'high',
      },
    },
    {
      id: 'downtown-campaign-heist',
      name: 'Skyline Vault Run',
      stage: 1,
      description: 'Exploit the ghost node to steal prototype drives from the skyline vault.',
      requirements: { influence: 64, intelLevel: 58 },
      rewardPreview: 'High-capacity prototype getaway van blueprint.',
      contract: {
        id: 'downtown-campaign-stage-2',
        name: 'Skyline Vault Run',
        description:
          'Ride the freight elevators from the ghosted floors to yank prototype drives and escape by drone lift.',
        difficulty: 4,
        payout: 42000,
        heat: 3,
        duration: 64,
        category: 'vehicle-heist',
        riskTier: 'severe',
        vehicleReward: {
          label: 'Skyline Prototype Hauler',
          summary: 'Specialized heavy van tuned for corporate exfiltration.',
          storageRequired: 2,
          vehicleBlueprint: {
            model: 'Skyline Prototype Hauler',
            topSpeed: 154,
            acceleration: 6,
            handling: 6.2,
            heat: 1.2,
          },
        },
      },
    },
    {
      id: 'downtown-campaign-defence',
      name: 'Corporate Retaliation',
      stage: 2,
      description: 'Defend embedded assets during a retaliatory corporate sweep.',
      requirements: { influence: 70, intelLevel: 64, crackdownPressure: 55 },
      rewardPreview: 'Permanent intel boost for Downtown campaign districts.',
      contract: {
        id: 'downtown-campaign-stage-3',
        name: 'Corporate Retaliation',
        description:
          'Hold the ghost node while extracting teams counter-sweep the retaliating security force.',
        difficulty: 5,
        payout: 52000,
        heat: 4,
        duration: 70,
        category: 'defense-operation',
        riskTier: 'severe',
      },
    },
  ],
  'Industrial Docks': [
    {
      id: 'docks-campaign-smugglers',
      name: 'Freeport Smuggler Accord',
      stage: 0,
      description: 'Broker safe passage with the Freeport smugglers guild.',
      requirements: { influence: 54, intelLevel: 46 },
      rewardPreview: 'Unlock smuggler manifests for high value shipments.',
      contract: {
        id: 'docks-campaign-stage-1',
        name: 'Smuggler Accord',
        description:
          'Infiltrate the Freeport guild meeting and secure transit routes through covert leverage.',
        difficulty: 2,
        payout: 20000,
        heat: 1,
        duration: 44,
        category: 'campaign-operation',
        riskTier: 'moderate',
      },
    },
    {
      id: 'docks-campaign-intercept',
      name: 'Armored Rail Intercept',
      stage: 1,
      description: 'Leverage smuggler routes to intercept an armored rail transfer.',
      requirements: { influence: 60, intelLevel: 52 },
      rewardPreview: 'Unlock contraband resale bonus and reduced mission heat.',
      contract: {
        id: 'docks-campaign-stage-2',
        name: 'Armored Rail Intercept',
        description:
          'Stage a rolling ambush using rerouted manifests to seize classified cargo mid-transit.',
        difficulty: 3,
        payout: 36000,
        heat: 2,
        duration: 56,
        category: 'vehicle-heist',
        riskTier: 'high',
      },
    },
    {
      id: 'docks-campaign-defence',
      name: 'Harbor Siege Holdout',
      stage: 2,
      description: 'Hold the docks when syndicate rivals mount a siege.',
      requirements: { influence: 66, intelLevel: 58, crackdownPressure: 50 },
      rewardPreview: 'Permanent dockside passive income bonus.',
      contract: {
        id: 'docks-campaign-stage-3',
        name: 'Harbor Siege Holdout',
        description:
          'Organize a defensive grid across cranes and trawlers to repel rival crews.',
        difficulty: 4,
        payout: 46000,
        heat: 3,
        duration: 62,
        category: 'defense-operation',
        riskTier: 'severe',
      },
    },
  ],
  'Suburban Hills': [
    {
      id: 'hills-campaign-infiltration',
      name: 'Estate Staff Infiltration',
      stage: 0,
      description: 'Embed operatives among estate service staff.',
      requirements: { influence: 52, intelLevel: 46 },
      rewardPreview: 'Gain rotating safehouse upgrades from estate skims.',
      contract: {
        id: 'hills-campaign-stage-1',
        name: 'Estate Staff Infiltration',
        description:
          'Swap in loyal staff during a gala and tap surveillance feeds across the hills.',
        difficulty: 3,
        payout: 32000,
        heat: 2,
        duration: 50,
        category: 'campaign-operation',
        riskTier: 'high',
      },
    },
    {
      id: 'hills-campaign-heist',
      name: 'Collector Hangar Lift',
      stage: 1,
      description: 'Extract the crown jewel concept car under the collector’s nose.',
      requirements: { influence: 58, intelLevel: 54 },
      rewardPreview: 'Exclusive collector concept hypercar.',
      contract: {
        id: 'hills-campaign-stage-2',
        name: 'Collector Hangar Lift',
        description:
          'Parade the concept car out during a showcase using forged clearance and covert escort.',
        difficulty: 4,
        payout: 48000,
        heat: 3,
        duration: 58,
        category: 'vehicle-heist',
        riskTier: 'severe',
        vehicleReward: {
          label: 'Concept Hypercar',
          summary: 'Limited-run hypercar with experimental aero package.',
          storageRequired: 1,
          vehicleBlueprint: {
            model: 'Concept Hypercar',
            topSpeed: 175,
            acceleration: 6.8,
            handling: 6.6,
            heat: 1.3,
          },
        },
      },
    },
    {
      id: 'hills-campaign-retaliation',
      name: 'Neighborhood Suppression',
      stage: 2,
      description: 'Crush the HOA-funded suppression force targeting your assets.',
      requirements: { influence: 64, intelLevel: 60, crackdownPressure: 60 },
      rewardPreview: 'Permanent security dampening for Suburban Hills.',
      contract: {
        id: 'hills-campaign-stage-3',
        name: 'Neighborhood Suppression',
        description:
          'Disable armored patrols and media drones coordinating a suburban lockdown.',
        difficulty: 5,
        payout: 54000,
        heat: 4,
        duration: 66,
        category: 'defense-operation',
        riskTier: 'severe',
      },
    },
  ],
  'Old Town': [
    {
      id: 'oldtown-campaign-brokerage',
      name: 'Bazaar Brokerage',
      stage: 0,
      description: 'Broker truce between rival bazaar factions to secure passage.',
      requirements: { influence: 62, intelLevel: 52 },
      rewardPreview: 'Unlock underground courier network intel.',
      contract: {
        id: 'oldtown-campaign-stage-1',
        name: 'Bazaar Brokerage',
        description:
          'Mediate the truce by exposing the enforcer double-agent destabilizing the bazaar.',
        difficulty: 3,
        payout: 26000,
        heat: 1,
        duration: 48,
        category: 'campaign-operation',
        riskTier: 'moderate',
      },
    },
    {
      id: 'oldtown-campaign-sabotage',
      name: 'Catacomb Sabotage',
      stage: 1,
      description: 'Sabotage crackdown supply caches stored in the catacombs.',
      requirements: { influence: 66, intelLevel: 56 },
      rewardPreview: 'Unlocks heat dampening passive for Old Town missions.',
      contract: {
        id: 'oldtown-campaign-stage-2',
        name: 'Catacomb Sabotage',
        description:
          'Rig suppression ordnance across the catacombs to derail the crackdown staging effort.',
        difficulty: 4,
        payout: 38000,
        heat: 2,
        duration: 54,
        category: 'campaign-operation',
        riskTier: 'high',
      },
    },
    {
      id: 'oldtown-campaign-evac',
      name: 'Old Town Evac Corridor',
      stage: 2,
      description: 'Evacuate community leaders before the final sweep.',
      requirements: { influence: 70, intelLevel: 60, crackdownPressure: 45 },
      rewardPreview: 'Secures permanent influence boost in Old Town.',
      contract: {
        id: 'oldtown-campaign-stage-3',
        name: 'Old Town Evac Corridor',
        description:
          'Escort the leadership convoy through alley mazes while evading enforcer dragnets.',
        difficulty: 5,
        payout: 50000,
        heat: 3,
        duration: 60,
        category: 'defense-operation',
        riskTier: 'severe',
      },
    },
  ],
};

const buildGenericCampaignBlueprint = (district) => {
  const label = district?.name ?? 'District';
  return [
    {
      id: `${label.toLowerCase().replace(/\s+/g, '-')}-campaign-setup`,
      name: `${label} Campaign Kickoff`,
      stage: 0,
      description: 'Secure leverage to unlock the district campaign.',
      requirements: { influence: 55, intelLevel: 50 },
      rewardPreview: 'Unlock bespoke district storyline contracts.',
      contract: {
        id: `${label.toLowerCase().replace(/\s+/g, '-')}-campaign-stage-1`,
        name: `${label} Campaign Kickoff`,
        description: 'Execute a bespoke op to launch the district storyline.',
        difficulty: 3,
        payout: 30000,
        heat: 2,
        duration: 48,
        category: 'campaign-operation',
        riskTier: 'high',
      },
    },
  ];
};

const normalizeRequirementValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeCampaignRequirements = (requirements = {}) => {
  if (!requirements || typeof requirements !== 'object') {
    return {};
  }

  const normalized = {};
  ['influence', 'intelLevel', 'crackdownPressure'].forEach((key) => {
    if (requirements[key] !== undefined && requirements[key] !== null) {
      const numeric = normalizeRequirementValue(requirements[key]);
      if (numeric !== null) {
        normalized[key] = numeric;
      }
    }
  });

  return normalized;
};

const cloneCampaignContract = (contract = {}) => {
  if (!contract || typeof contract !== 'object') {
    return null;
  }

  const vehicleReward =
    contract.vehicleReward && typeof contract.vehicleReward === 'object'
      ? {
          ...contract.vehicleReward,
          vehicleBlueprint:
            contract.vehicleReward.vehicleBlueprint &&
            typeof contract.vehicleReward.vehicleBlueprint === 'object'
              ? (() => {
                  const blueprint = { ...contract.vehicleReward.vehicleBlueprint };
                  if (typeof blueprint.image === 'string') {
                    const trimmed = blueprint.image.trim();
                    blueprint.image = trimmed || undefined;
                    if (!trimmed) {
                      delete blueprint.image;
                    }
                  } else if ('image' in blueprint) {
                    delete blueprint.image;
                  }
                  return blueprint;
                })()
              : undefined,
        }
      : undefined;

  const pointOfInterest =
    contract.pointOfInterest && typeof contract.pointOfInterest === 'object'
      ? { ...contract.pointOfInterest }
      : undefined;

  return {
    ...contract,
    vehicleReward,
    pointOfInterest,
  };
};

const normalizeCampaignMilestone = (milestone, index, district) => {
  const fallbackId = `${district?.id ?? district?.name ?? 'district'}-milestone-${index + 1}`;
  const id = typeof milestone?.id === 'string' && milestone.id.trim() ? milestone.id.trim() : fallbackId;
  const stage = Number.isFinite(milestone?.stage) ? Math.max(0, Math.floor(milestone.stage)) : index;
  const status = (milestone?.status === 'completed' ? 'completed' : 'pending');

  return {
    id,
    stage,
    name: milestone?.name ?? `Campaign Stage ${stage + 1}`,
    description: milestone?.description ?? '',
    requirements: normalizeCampaignRequirements(milestone?.requirements ?? {}),
    rewardPreview: milestone?.rewardPreview ?? null,
    contract: cloneCampaignContract(milestone?.contract ?? {}),
    status,
    completedAt: Number.isFinite(milestone?.completedAt) ? milestone.completedAt : null,
  };
};

const normalizeCampaignState = (campaign, district) => {
  const baseBlueprints = DEFAULT_CAMPAIGN_BLUEPRINTS[district?.name] ?? buildGenericCampaignBlueprint(district);
  const providedMilestones = Array.isArray(campaign?.milestones) && campaign.milestones.length
    ? campaign.milestones
    : baseBlueprints;

  const normalizedMilestones = providedMilestones.map((milestone, index) =>
    normalizeCampaignMilestone(milestone, index, district),
  );

  const completedIds = new Set(
    Array.isArray(campaign?.completedMilestones) ? campaign.completedMilestones.filter(Boolean) : [],
  );

  normalizedMilestones.forEach((milestone) => {
    if (completedIds.has(milestone.id)) {
      milestone.status = 'completed';
      if (!milestone.completedAt) {
        milestone.completedAt = Date.now();
      }
    }
  });

  const inferredStage = Math.max(
    0,
    ...normalizedMilestones.map((milestone) => (milestone.status === 'completed' ? milestone.stage + 1 : 0)),
  );
  const stage = Number.isFinite(campaign?.stage) ? Math.max(inferredStage, Math.floor(campaign.stage)) : inferredStage;

  const activeMilestone = normalizedMilestones
    .slice()
    .sort((a, b) => a.stage - b.stage)
    .find((milestone) => milestone.stage >= stage && milestone.status !== 'completed');

  return {
    stage,
    milestones: normalizedMilestones,
    completedMilestones: Array.from(completedIds),
    activeMilestoneId: activeMilestone ? activeMilestone.id : null,
    lastEvaluatedAt: null,
  };
};

class CityDistrict {
  constructor({
    id,
    name,
    wealth = 1,
    security = 1,
    description = '',
    pointsOfInterest = [],
    influence = 50,
    intelLevel = 45,
    crackdownPressure = 40,
    campaign = null,
  } = {}) {
    this.id = id ?? `district-${Math.random().toString(36).slice(2, 9)}`;
    this.name = name ?? 'Downtown';
    this.wealth = wealth;
    this.security = security;
    this.description = description;
    this.pointsOfInterest = Array.isArray(pointsOfInterest)
      ? pointsOfInterest.map((poi) => ({ ...poi }))
      : [];
    this.influence = clampMetric(influence);
    this.intelLevel = clampMetric(intelLevel);
    this.crackdownPressure = clampMetric(crackdownPressure);
    this.campaign = normalizeCampaignState(campaign, { id: this.id, name: this.name });
  }

  addPointOfInterest(poi) {
    if (!poi) {
      return;
    }

    this.pointsOfInterest.push({ ...poi });
  }

  setInfluence(value) {
    this.influence = clampMetric(value);
    return this.influence;
  }

  adjustInfluence(delta = 0) {
    const next = clampMetric((this.influence ?? 0) + delta);
    this.influence = next;
    return next;
  }

  setIntelLevel(value) {
    this.intelLevel = clampMetric(value);
    return this.intelLevel;
  }

  adjustIntelLevel(delta = 0) {
    const next = clampMetric((this.intelLevel ?? 0) + delta);
    this.intelLevel = next;
    return next;
  }

  setCrackdownPressure(value) {
    this.crackdownPressure = clampMetric(value);
    return this.crackdownPressure;
  }

  adjustCrackdownPressure(delta = 0) {
    const next = clampMetric((this.crackdownPressure ?? 0) + delta);
    this.crackdownPressure = next;
    return next;
  }

  getIntelSnapshot() {
    return {
      influence: Math.round(this.influence ?? 0),
      intelLevel: Math.round(this.intelLevel ?? 0),
      crackdownPressure: Math.round(this.crackdownPressure ?? 0),
    };
  }

  getCampaignSnapshot() {
    if (!this.campaign) {
      return null;
    }

    const snapshot = this.getIntelSnapshot();
    const activeMilestone = this.getActiveCampaignMilestone();
    const totalStages = this.campaign.milestones.length;

    if (!activeMilestone) {
      const completedStages = this.campaign.milestones.filter((milestone) => milestone.status === 'completed').length;
      const summary = {
        stage: this.campaign.stage,
        totalStages,
        completedStages,
        status: 'complete',
        activeMilestone: null,
      };
      this.campaign.activeMilestoneId = null;
      this.campaign.lastEvaluatedAt = Date.now();
      this.campaign.activeMilestoneProgress = summary;
      return summary;
    }

    const requirementEntries = Object.entries(activeMilestone.requirements ?? {});
    const metrics = {
      influence: snapshot.influence,
      intelLevel: snapshot.intelLevel,
      crackdownPressure: snapshot.crackdownPressure,
    };

    const requirementDetails = requirementEntries.map(([key, requiredValue]) => {
      const currentValue = metrics[key];
      if (!Number.isFinite(requiredValue) || !Number.isFinite(currentValue)) {
        return {
          key,
          required: requiredValue ?? null,
          current: currentValue ?? null,
          met: false,
          progress: 0,
          delta: null,
        };
      }

      if (key === 'crackdownPressure') {
        const met = currentValue <= requiredValue;
        const progress = met ? 1 : Math.max(0, requiredValue / Math.max(currentValue, 1));
        return {
          key,
          required: requiredValue,
          current: currentValue,
          met,
          progress,
          delta: met ? 0 : currentValue - requiredValue,
        };
      }

      const met = currentValue >= requiredValue;
      const progress = met ? 1 : Math.min(1, currentValue / Math.max(requiredValue, 1));
      return {
        key,
        required: requiredValue,
        current: currentValue,
        met,
        progress,
        delta: met ? 0 : requiredValue - currentValue,
      };
    });

    const readiness = requirementDetails.length
      ? requirementDetails.reduce((min, entry) => Math.min(min, entry.progress ?? 0), 1)
      : 1;
    const ready = requirementDetails.every((entry) => entry.met);

    const detail = {
      id: activeMilestone.id,
      stage: activeMilestone.stage,
      name: activeMilestone.name,
      description: activeMilestone.description,
      rewardPreview: activeMilestone.rewardPreview,
      requirements: requirementDetails,
      ready,
      readiness,
    };

    const summary = {
      stage: this.campaign.stage,
      totalStages,
      completedStages: this.campaign.milestones.filter((milestone) => milestone.status === 'completed').length,
      status: ready ? 'ready' : 'active',
      activeMilestone: detail,
    };

    this.campaign.activeMilestoneId = activeMilestone.id;
    this.campaign.lastEvaluatedAt = Date.now();
    this.campaign.activeMilestoneProgress = summary;

    return summary;
  }

  getActiveCampaignMilestone() {
    if (!this.campaign || !Array.isArray(this.campaign.milestones)) {
      return null;
    }

    const sorted = this.campaign.milestones.slice().sort((a, b) => a.stage - b.stage);
    const active = sorted.find((milestone) => milestone.status !== 'completed' && milestone.stage >= this.campaign.stage);
    return active ?? null;
  }

  completeCampaignMilestone(milestoneId, { outcome = 'success' } = {}) {
    if (!this.campaign || !Array.isArray(this.campaign.milestones)) {
      return false;
    }

    const index = this.campaign.milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (index === -1) {
      return false;
    }

    const milestone = this.campaign.milestones[index];
    if (outcome === 'success') {
      milestone.status = 'completed';
      milestone.completedAt = Date.now();
      if (!this.campaign.completedMilestones.includes(milestone.id)) {
        this.campaign.completedMilestones.push(milestone.id);
      }
      if (milestone.stage >= this.campaign.stage) {
        this.campaign.stage = milestone.stage + 1;
      }
      this.campaign.activeMilestoneId = this.getActiveCampaignMilestone()?.id ?? null;
      return true;
    }

    // On failure, keep milestone pending but refresh evaluation timestamp for UI feedback.
    this.campaign.lastEvaluatedAt = Date.now();
    return false;
  }

  applyMissionOutcome(outcome, context = {}) {
    if (outcome !== 'success' && outcome !== 'failure') {
      return null;
    }

    const before = this.getIntelSnapshot();

    const difficulty = Number.isFinite(context.difficulty) ? Math.max(1, context.difficulty) : 1;
    const heat = Number.isFinite(context.heat) ? Math.max(0, context.heat) : 0;
    const payout = Number.isFinite(context.payout) ? Math.max(0, context.payout) : 0;
    const notorietyDelta = Number.isFinite(context.notorietyDelta) ? context.notorietyDelta : 0;

    if (outcome === 'success') {
      const influenceGain = Math.max(1, Math.round(2 + difficulty * 0.7 + payout / 15000));
      const intelGain = Math.max(1, Math.round(1 + difficulty * 0.5 + heat * 0.3));
      let crackdownReduction = 1 + heat * 0.25;
      if (notorietyDelta < 0) {
        crackdownReduction += Math.abs(notorietyDelta) * 0.5;
      }
      if (notorietyDelta > 0) {
        crackdownReduction -= notorietyDelta * 0.4;
      }
      const normalizedReduction = Math.max(1, Math.round(crackdownReduction));

      this.adjustInfluence(influenceGain);
      this.adjustIntelLevel(intelGain);
      this.adjustCrackdownPressure(-normalizedReduction);
    } else {
      const influenceLoss = Math.max(1, Math.round(2 + difficulty * 0.6 + heat * 0.4));
      const intelLoss = Math.max(1, Math.round(1 + heat * 0.5));
      let crackdownIncrease = 2 + difficulty * 0.7 + heat * 0.45;
      if (notorietyDelta > 0) {
        crackdownIncrease += notorietyDelta * 0.5;
      }
      const normalizedIncrease = Math.max(2, Math.round(crackdownIncrease));

      this.adjustInfluence(-influenceLoss);
      this.adjustIntelLevel(-intelLoss);
      this.adjustCrackdownPressure(normalizedIncrease);
    }

    const after = this.getIntelSnapshot();

    return {
      before,
      after,
      delta: {
        influence: after.influence - before.influence,
        intelLevel: after.intelLevel - before.intelLevel,
        crackdownPressure: after.crackdownPressure - before.crackdownPressure,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      wealth: this.wealth,
      security: this.security,
      description: this.description,
      pointsOfInterest: this.pointsOfInterest.map((poi) => ({ ...poi })),
      influence: this.influence,
      intelLevel: this.intelLevel,
      crackdownPressure: this.crackdownPressure,
      campaign: this.campaign
        ? {
            ...this.campaign,
            milestones: this.campaign.milestones.map((milestone) => ({
              ...milestone,
              contract: cloneCampaignContract(milestone.contract ?? {}),
            })),
          }
        : null,
    };
  }
}

class CityMap {
  constructor({ name = 'Metro Harbor', districts = [] } = {}) {
    this.name = name;
    this.districts = districts.map((district) => new CityDistrict(district));
    if (this.districts.length === 0) {
      this._seedDefaultDistricts();
    }
  }

  _seedDefaultDistricts() {
    this.districts = [
      new CityDistrict({
        name: 'Downtown',
        wealth: 3,
        security: 4,
        description: 'Corporate high-rises and high-profile targets.',
        influence: 62,
        intelLevel: 48,
        crackdownPressure: 58,
        pointsOfInterest: [
          {
            id: 'downtown-vault-row',
            name: 'Vault Row Depository',
            type: 'vault',
            description: 'A private bank mezzanine lined with biometric vault pods.',
            modifiers: { payoutMultiplier: 1.35, heatDelta: 2 },
          },
          {
            id: 'downtown-skytech-spire',
            name: 'SkyTech Innovation Spire',
            type: 'tech-hub',
            description: 'A research tower bristling with prototyped circuitry and security drones.',
            modifiers: { payoutMultiplier: 1.15, heatDelta: 1, durationDelta: 6 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Industrial Docks',
        wealth: 2,
        security: 2,
        description: 'Warehouses, shipping containers, and shady deals.',
        influence: 55,
        intelLevel: 42,
        crackdownPressure: 44,
        pointsOfInterest: [
          {
            id: 'docks-freeport-yard',
            name: 'Freeport Rail Yard',
            type: 'rail-yard',
            description: 'Intermodal tracks crawling with cargo haulers and minimal oversight.',
            modifiers: { payoutMultiplier: 1.1, heatDelta: 0, durationDelta: -4 },
          },
          {
            id: 'docks-contraband-silos',
            name: 'Contraband Silos',
            type: 'smuggling-cache',
            description: 'Cold storage silos hiding confiscated shipments waiting for pickup.',
            modifiers: { payoutMultiplier: 1.2, heatDelta: 1 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Suburban Hills',
        wealth: 4,
        security: 3,
        description: 'Gated communities with prized collections.',
        influence: 50,
        intelLevel: 44,
        crackdownPressure: 63,
        pointsOfInterest: [
          {
            id: 'hills-heritage-vault',
            name: 'Heritage Vault Estate',
            type: 'vault',
            description: 'Antique vault hidden below an old-money mansion with rotating staff.',
            modifiers: { payoutMultiplier: 1.4, heatDelta: 1 },
          },
          {
            id: 'hills-collector-hangar',
            name: 'Collector Hangar 7',
            type: 'showroom',
            description: 'Private vehicle showroom stocked with concept rides and drones.',
            modifiers: { payoutMultiplier: 1.25, heatDelta: 0.5, durationDelta: 4 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Old Town',
        wealth: 1,
        security: 1,
        description: 'Tight streets and low police presence.',
        influence: 68,
        intelLevel: 56,
        crackdownPressure: 32,
        pointsOfInterest: [
          {
            id: 'oldtown-market-catacombs',
            name: 'Market Catacombs',
            type: 'smuggling-cache',
            description: 'Hidden vaults beneath the bazaar where crews fence contraband.',
            modifiers: { payoutMultiplier: 1.05, heatDelta: -1 },
          },
          {
            id: 'oldtown-community-hub',
            name: 'Community Hackspace',
            type: 'tech-hub',
            description: 'Volunteer tech lab with civic surveillance overrides tucked away.',
            modifiers: { payoutMultiplier: 1.08, heatDelta: -0.5, durationDelta: -2 },
          },
        ],
      }),
    ];
  }

  findDistrict(id) {
    return this.districts.find((district) => district.id === id) ?? null;
  }
}

export { CityMap, CityDistrict };
