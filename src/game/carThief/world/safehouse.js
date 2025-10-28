const getRandomId = () => {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const DEFAULT_PROJECT_COST = 9000;
const DEFAULT_PROJECT_DURATION_DAYS = 3;
const DEFAULT_RUSH_COST_PER_DAY = 3000;

const normalizeStatus = (status, { defaultStatus = 'planned' } = {}) => {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

  if (!normalized) {
    return defaultStatus;
  }

  if (['active', 'online', 'ready', 'operational', 'complete', 'installed'].includes(normalized)) {
    return 'active';
  }

  if (['building', 'fabricating', 'installing', 'construction', 'deploying'].includes(normalized)) {
    return 'building';
  }

  if (
    ['queued', 'planned', 'planning', 'staged', 'in-design', 'design', 'pending', 'fundraising'].includes(
      normalized,
    )
  ) {
    return 'queued';
  }

  return normalized;
};

const normalizeFacility = (entry, fallbackId, defaultName) => {
  if (!entry || typeof entry !== 'object') {
    return {
      id: fallbackId,
      name: defaultName,
      summary: '',
      status: 'planned',
      cost: 0,
      durationDays: 0,
      fundedAmount: 0,
      timeInvested: 0,
      progress: 0,
      rushCostPerDay: null,
    };
  }

  const id = entry.id ?? fallbackId;
  const name = entry.name ?? defaultName;
  const summary = entry.summary ?? entry.description ?? '';
  const status = normalizeStatus(entry.status ?? entry.state ?? null);
  const costSource = entry.cost ?? entry.buildCost ?? entry.price ?? entry.requiredFunds;
  const durationSource =
    entry.duration ?? entry.durationDays ?? entry.time ?? entry.timeRequired ?? entry.days ?? entry.buildDays;
  const fundedSource = entry.fundedAmount ?? entry.funded ?? entry.investment ?? entry.allocatedFunds;
  const timeSource = entry.timeInvested ?? entry.progressDays ?? entry.daysWorked ?? entry.daysBuilt;
  const rushSource = entry.rushCostPerDay ?? entry.rushCost ?? entry.accelerateCostPerDay;
  const normalizedCost = Number.isFinite(costSource) ? Math.max(0, costSource) : 0;
  const normalizedDuration = Number.isFinite(durationSource) ? Math.max(0, durationSource) : 0;
  const normalizedFunded = Number.isFinite(fundedSource) ? Math.max(0, fundedSource) : 0;
  const normalizedTime = Number.isFinite(timeSource) ? Math.max(0, timeSource) : 0;
  const normalizedRush = Number.isFinite(rushSource) ? Math.max(0, rushSource) : null;
  const normalizedProgressSource = Number.isFinite(entry.progress) ? Math.max(0, entry.progress) : null;
  const safeFunded = normalizedCost > 0 ? Math.min(normalizedCost, normalizedFunded) : normalizedFunded;
  const safeTime = normalizedDuration > 0 ? Math.min(normalizedDuration, normalizedTime) : normalizedTime;
  let progress = 0;
  if (normalizedProgressSource !== null) {
    progress = Math.min(1, normalizedProgressSource);
  } else if (normalizedDuration > 0) {
    progress = Math.min(1, normalizedDuration ? safeTime / normalizedDuration : 0);
  } else if (normalizedCost > 0) {
    progress = Math.min(1, normalizedCost ? safeFunded / normalizedCost : 0);
  } else {
    progress = safeFunded > 0 || safeTime > 0 ? 1 : 0;
  }

  return {
    id,
    name,
    summary,
    status: status ?? 'planned',
    cost: normalizedCost,
    durationDays: normalizedDuration,
    fundedAmount: safeFunded,
    timeInvested: safeTime,
    progress,
    rushCostPerDay: normalizedRush,
  };
};

const normalizeDowntimePenalties = (penalties) => {
  if (!Array.isArray(penalties)) {
    if (typeof penalties === 'string' && penalties.trim()) {
      return [penalties.trim()];
    }
    return [];
  }

  return penalties
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const normalizeFacilityDowntime = (
  downtime,
  { defaultFacilityId = null, currentDay = null } = {},
) => {
  if (!downtime || typeof downtime !== 'object') {
    return null;
  }

  const facilityId =
    typeof downtime.facilityId === 'string' && downtime.facilityId.trim()
      ? downtime.facilityId.trim()
      : typeof defaultFacilityId === 'string' && defaultFacilityId.trim()
        ? defaultFacilityId.trim()
        : null;

  if (!facilityId) {
    return null;
  }

  const durationDays = Number.isFinite(downtime.durationDays)
    ? Math.max(0, Math.round(downtime.durationDays))
    : Number.isFinite(downtime.cooldownDays)
      ? Math.max(0, Math.round(downtime.cooldownDays))
      : null;
  const cooldownDays = Number.isFinite(downtime.cooldownDays)
    ? Math.max(0, Math.round(downtime.cooldownDays))
    : durationDays;

  let cooldownEndsOnDay = Number.isFinite(downtime.cooldownEndsOnDay)
    ? Math.round(downtime.cooldownEndsOnDay)
    : null;
  if (cooldownEndsOnDay === null && Number.isFinite(currentDay) && cooldownDays !== null) {
    cooldownEndsOnDay = currentDay + cooldownDays;
  }

  const normalized = {
    facilityId,
    alertId:
      typeof downtime.alertId === 'string' && downtime.alertId.trim()
        ? downtime.alertId.trim()
        : null,
    label:
      typeof downtime.label === 'string' && downtime.label.trim()
        ? downtime.label.trim()
        : null,
    summary:
      typeof downtime.summary === 'string' && downtime.summary.trim()
        ? downtime.summary.trim()
        : null,
    penalties: normalizeDowntimePenalties(downtime.penalties ?? downtime.impact),
    penaltySummary:
      typeof downtime.penaltySummary === 'string' && downtime.penaltySummary.trim()
        ? downtime.penaltySummary.trim()
        : null,
    durationDays,
    cooldownDays,
    cooldownEndsOnDay,
    startedAt: Number.isFinite(downtime.startedAt) ? downtime.startedAt : null,
  };

  if (normalized.penaltySummary && !normalized.penalties.length) {
    normalized.penalties = [normalized.penaltySummary];
  }

  if (normalized.cooldownDays === null && normalized.cooldownEndsOnDay !== null && Number.isFinite(currentDay)) {
    normalized.cooldownDays = Math.max(0, normalized.cooldownEndsOnDay - currentDay);
  }

  if (normalized.durationDays === null && normalized.cooldownDays !== null) {
    normalized.durationDays = normalized.cooldownDays;
  }

  return normalized;
};

const normalizeTier = (tier, index) => {
  const level = Number.isFinite(tier?.level) ? tier.level : index;
  const upgradeCost = Number.isFinite(tier?.upgradeCost) ? tier.upgradeCost : 0;
  const passiveIncome = Number.isFinite(tier?.passiveIncome) ? tier.passiveIncome : 0;
  const heatReduction = Number.isFinite(tier?.heatReduction) ? tier.heatReduction : 0;
  const storageCapacity = Number.isFinite(tier?.storageCapacity) ? tier.storageCapacity : 0;
  const overheadModifier = Number.isFinite(tier?.overheadModifier) ? tier.overheadModifier : 0;
  const amenities = Array.isArray(tier?.amenities)
    ? tier.amenities.map((amenity, amenityIndex) =>
        normalizeFacility(
          amenity,
          `${tier?.id ?? `tier-${level}`}-amenity-${amenityIndex}`,
          `Amenity ${amenityIndex + 1}`,
        ),
      )
    : [];
  const projects = Array.isArray(tier?.projects)
    ? tier.projects.map((project, projectIndex) =>
        normalizeFacility(
          project,
          `${tier?.id ?? `tier-${level}`}-project-${projectIndex}`,
          `Project ${projectIndex + 1}`,
        ),
      )
    : [];

  return {
    level,
    label: tier?.label ?? `Tier ${level + 1}`,
    description: tier?.description ?? '',
    passiveIncome,
    heatReduction,
    storageCapacity,
    overheadModifier,
    upgradeCost,
    amenities,
    projects,
  };
};

class Safehouse {
  _findProjectRecord(projectId) {
    if (!projectId) {
      return null;
    }

    for (let tierIndex = 0; tierIndex < this.tiers.length; tierIndex += 1) {
      const tier = this.tiers[tierIndex];
      if (!tier || !Array.isArray(tier.projects)) {
        continue;
      }

      for (let projectIndex = 0; projectIndex < tier.projects.length; projectIndex += 1) {
        const project = tier.projects[projectIndex];
        if (project?.id === projectId) {
          return { tier, tierIndex, projectIndex, project };
        }
      }
    }

    return null;
  }

  _getProjectCost(project) {
    if (!project || typeof project !== 'object') {
      return DEFAULT_PROJECT_COST;
    }

    const cost = Number.isFinite(project.cost) ? project.cost : DEFAULT_PROJECT_COST;
    return Math.max(0, cost);
  }

  _getProjectDuration(project) {
    if (!project || typeof project !== 'object') {
      return DEFAULT_PROJECT_DURATION_DAYS;
    }

    const duration = Number.isFinite(project.durationDays)
      ? project.durationDays
      : Number.isFinite(project.duration)
        ? project.duration
        : DEFAULT_PROJECT_DURATION_DAYS;
    return Math.max(0, duration);
  }

  _getProjectRushCost(project) {
    if (!project || typeof project !== 'object') {
      return DEFAULT_RUSH_COST_PER_DAY;
    }

    if (Number.isFinite(project.rushCostPerDay) && project.rushCostPerDay > 0) {
      return project.rushCostPerDay;
    }

    const cost = this._getProjectCost(project);
    const duration = this._getProjectDuration(project);
    if (duration > 0) {
      return Math.max(500, Math.round(cost / duration));
    }

    return DEFAULT_RUSH_COST_PER_DAY;
  }

  _getProjectFunded(project) {
    if (!project || typeof project !== 'object') {
      return 0;
    }

    const funded = Number.isFinite(project.fundedAmount) ? project.fundedAmount : 0;
    return Math.max(0, funded);
  }

  _getProjectTimeInvested(project) {
    if (!project || typeof project !== 'object') {
      return 0;
    }

    const time = Number.isFinite(project.timeInvested) ? project.timeInvested : 0;
    return Math.max(0, time);
  }

  _computeProjectProgress(project, { cost = null, duration = null, fundedAmount = null, timeInvested = null } = {}) {
    if (!project || typeof project !== 'object') {
      return 0;
    }

    const resolvedCost = cost ?? this._getProjectCost(project);
    const resolvedDuration = duration ?? this._getProjectDuration(project);
    const resolvedFunded = fundedAmount ?? this._getProjectFunded(project);
    const resolvedTime = timeInvested ?? this._getProjectTimeInvested(project);

    let progress = 0;
    if (resolvedDuration > 0) {
      progress = Math.min(1, resolvedTime / resolvedDuration);
    } else if (resolvedCost > 0) {
      progress = Math.min(1, resolvedFunded / resolvedCost);
    } else if (resolvedFunded > 0 || resolvedTime > 0) {
      progress = 1;
    }

    return progress;
  }

  _refreshProjectProgress(project) {
    if (!project || typeof project !== 'object') {
      return 0;
    }

    const progress = this._computeProjectProgress(project);
    project.progress = progress;
    return progress;
  }

  constructor({
    id,
    name = 'Unknown Safehouse',
    location = 'Undisclosed',
    description = '',
    tiers = [],
    tierIndex = 0,
    startingTier = 0,
    purchaseCost = 0,
    owned = false,
    facilityDowntimes = [],
  } = {}) {
    this.id = id ?? `safehouse-${getRandomId()}`;
    this.name = name;
    this.location = location;
    this.description = description;
    const normalizedPurchaseCost = Number.isFinite(purchaseCost) ? purchaseCost : 0;
    this.purchaseCost = Math.max(0, normalizedPurchaseCost);
    this.owned = Boolean(owned);

    const normalizedTiers = Array.isArray(tiers) ? tiers.map(normalizeTier) : [];
    this.tiers = normalizedTiers.length ? normalizedTiers : [normalizeTier({}, 0)];

    const resolvedTierIndex = Number.isFinite(tierIndex) ? tierIndex : startingTier;
    this.tierIndex = Math.max(0, Math.min(this.tiers.length - 1, resolvedTierIndex ?? 0));

    const rawDowntimes = Array.isArray(facilityDowntimes)
      ? facilityDowntimes
      : facilityDowntimes && typeof facilityDowntimes === 'object'
        ? Array.isArray(facilityDowntimes.safehouses)
          ? facilityDowntimes.safehouses
          : Object.values(facilityDowntimes)
        : [];

    this.facilityDowntimes = new Map();
    rawDowntimes
      .map((entry) => normalizeFacilityDowntime(entry))
      .filter(Boolean)
      .forEach((entry) => {
        this.facilityDowntimes.set(entry.facilityId, entry);
      });
  }

  clone() {
    return new Safehouse({
      id: this.id,
      name: this.name,
      location: this.location,
      description: this.description,
      tiers: this.tiers.map((tier) => ({
        ...tier,
        amenities: Array.isArray(tier.amenities)
          ? tier.amenities.map((amenity) => ({ ...amenity }))
          : [],
        projects: Array.isArray(tier.projects)
          ? tier.projects.map((project) => ({ ...project }))
          : [],
      })),
      tierIndex: this.tierIndex,
      purchaseCost: this.purchaseCost,
      owned: this.owned,
      facilityDowntimes: this.getFacilityDowntimeEntries(),
    });
  }

  getTier(level = this.tierIndex) {
    return this.tiers[level] ?? null;
  }

  getCurrentTier() {
    return this.getTier(this.tierIndex);
  }

  getNextTier() {
    return this.getTier(this.tierIndex + 1);
  }

  canUpgrade() {
    return this.tierIndex < this.tiers.length - 1;
  }

  getUpgradeCost() {
    const nextTier = this.getNextTier();
    const cost = Number.isFinite(nextTier?.upgradeCost) ? nextTier.upgradeCost : 0;
    return cost;
  }

  upgrade() {
    if (!this.canUpgrade()) {
      return { success: false, reason: 'max-tier' };
    }

    this.tierIndex += 1;
    return { success: true, tier: this.getCurrentTier() };
  }

  getPassiveIncome() {
    const tier = this.getCurrentTier();
    return Number.isFinite(tier?.passiveIncome) ? tier.passiveIncome : 0;
  }

  getHeatReduction() {
    const tier = this.getCurrentTier();
    return Number.isFinite(tier?.heatReduction) ? tier.heatReduction : 0;
  }

  getStorageCapacity() {
    const tier = this.getCurrentTier();
    return Number.isFinite(tier?.storageCapacity) ? tier.storageCapacity : 0;
  }

  getOverheadModifier() {
    const tier = this.getCurrentTier();
    return Number.isFinite(tier?.overheadModifier) ? tier.overheadModifier : 0;
  }

  getAmenitiesForTier(level = this.tierIndex) {
    const tier = this.getTier(level);
    return Array.isArray(tier?.amenities) ? tier.amenities.map((amenity) => ({ ...amenity })) : [];
  }

  getUnlockedAmenities() {
    const amenities = [];
    for (let index = 0; index <= this.tierIndex && index < this.tiers.length; index += 1) {
      amenities.push(...this.getAmenitiesForTier(index));
    }
    return amenities;
  }

  getProjectsForTier(level = this.tierIndex) {
    const tier = this.getTier(level);
    return Array.isArray(tier?.projects) ? tier.projects.map((project) => ({ ...project })) : [];
  }

  getActiveProjects() {
    return this.getProjectsForTier(this.tierIndex);
  }

  getFacilityDowntime(facilityId, { currentDay = null } = {}) {
    if (!facilityId) {
      return null;
    }

    const record = this.facilityDowntimes.get(facilityId) ?? null;
    if (!record) {
      return null;
    }

    if (
      Number.isFinite(currentDay) &&
      Number.isFinite(record.cooldownEndsOnDay) &&
      currentDay >= record.cooldownEndsOnDay
    ) {
      this.facilityDowntimes.delete(facilityId);
      return null;
    }

    return { ...record };
  }

  getFacilityDowntimeEntries({ currentDay = null } = {}) {
    if (Number.isFinite(currentDay)) {
      this.pruneFacilityDowntimes(currentDay);
    }

    return Array.from(this.facilityDowntimes.values()).map((entry) => ({ ...entry }));
  }

  hasFacilityDowntime(facilityId, { currentDay = null } = {}) {
    return this.getFacilityDowntime(facilityId, { currentDay }) !== null;
  }

  setFacilityDowntime(downtime, { currentDay = null } = {}) {
    const normalized = normalizeFacilityDowntime(downtime, {
      defaultFacilityId: downtime?.facilityId,
      currentDay,
    });

    if (!normalized) {
      return null;
    }

    if (!normalized.alertId && downtime?.alertId) {
      normalized.alertId = downtime.alertId;
    }

    if (!normalized.startedAt && Number.isFinite(downtime?.startedAt)) {
      normalized.startedAt = downtime.startedAt;
    }

    this.facilityDowntimes.set(normalized.facilityId, normalized);
    return { ...normalized };
  }

  clearFacilityDowntime(facilityId) {
    if (!facilityId) {
      return false;
    }

    return this.facilityDowntimes.delete(facilityId);
  }

  getDisabledFacilityIds({ currentDay = null } = {}) {
    if (Number.isFinite(currentDay)) {
      this.pruneFacilityDowntimes(currentDay);
    }

    return Array.from(this.facilityDowntimes.keys());
  }

  pruneFacilityDowntimes(currentDay = null) {
    if (!Number.isFinite(currentDay)) {
      return;
    }

    const cutoffDay = currentDay;
    this.facilityDowntimes.forEach((entry, facilityId) => {
      if (Number.isFinite(entry.cooldownEndsOnDay) && cutoffDay >= entry.cooldownEndsOnDay) {
        this.facilityDowntimes.delete(facilityId);
      }
    });
  }

  isFacilityDisabled(facilityId, { currentDay = null } = {}) {
    return this.hasFacilityDowntime(facilityId, { currentDay });
  }

  getUpcomingProjects() {
    const projects = [];
    for (let index = this.tierIndex + 1; index < this.tiers.length; index += 1) {
      projects.push(...this.getProjectsForTier(index));
    }
    return projects;
  }

  getActiveProjectSummaries() {
    const tier = this.getCurrentTier();
    if (!tier || !Array.isArray(tier.projects)) {
      return [];
    }

    return tier.projects.map((project) => this.getProjectSummary(project.id)).filter(Boolean);
  }

  getProjectSummary(projectId) {
    const record = this._findProjectRecord(projectId);
    if (!record) {
      return null;
    }

    const { project } = record;
    const cost = this._getProjectCost(project);
    const duration = this._getProjectDuration(project);
    const fundedAmount = this._getProjectFunded(project);
    const timeInvested = this._getProjectTimeInvested(project);
    const fundingRemaining = Math.max(0, cost - fundedAmount);
    const timeRemaining = Math.max(0, duration - timeInvested);
    const rushCostPerDay = this._getProjectRushCost(project);
    const progress = this._computeProjectProgress(project, { cost, duration, fundedAmount, timeInvested });

    return {
      id: project.id,
      name: project.name,
      summary: project.summary,
      status: project.status ?? 'planned',
      cost,
      durationDays: duration,
      fundedAmount,
      timeInvested,
      fundingRemaining,
      timeRemaining,
      rushCostPerDay,
      progress,
    };
  }

  getProjectRushQuote(projectId, { days = null } = {}) {
    const record = this._findProjectRecord(projectId);
    if (!record) {
      return null;
    }

    const { project } = record;
    const duration = this._getProjectDuration(project);
    const rushCostPerDay = this._getProjectRushCost(project);
    const timeInvested = this._getProjectTimeInvested(project);
    const availableDays = Math.max(0, duration - timeInvested);
    const targetDays = Number.isFinite(days) ? Math.min(Math.max(0, days), availableDays) : availableDays;

    return {
      projectId,
      rushCostPerDay,
      availableDays,
      cost: rushCostPerDay * targetDays,
    };
  }

  startProject(projectId, { fundsAvailable = 0 } = {}) {
    const record = this._findProjectRecord(projectId);
    if (!record) {
      return { success: false, reason: 'not-found' };
    }

    if (record.tierIndex > this.tierIndex) {
      return { success: false, reason: 'locked' };
    }

    const project = record.project;
    const cost = this._getProjectCost(project);
    const fundedAmount = this._getProjectFunded(project);
    const remainingCost = Math.max(0, cost - fundedAmount);
    const availableFunds = Number.isFinite(fundsAvailable) ? Math.max(0, fundsAvailable) : 0;

    let fundsSpent = 0;
    if (remainingCost > 0) {
      if (availableFunds <= 0) {
        return {
          success: false,
          reason: 'insufficient-funds',
          required: remainingCost,
        };
      }

      fundsSpent = Math.min(remainingCost, availableFunds);
      project.fundedAmount = fundedAmount + fundsSpent;
    }

    const outstanding = Math.max(0, cost - this._getProjectFunded(project));
    if (outstanding > 0) {
      project.status = 'fundraising';
      this._refreshProjectProgress(project);
      return {
        success: true,
        fundsSpent,
        remainingCost: outstanding,
        project,
      };
    }

    project.status = 'building';
    if (!Number.isFinite(project.timeInvested)) {
      project.timeInvested = 0;
    }
    this._refreshProjectProgress(project);

    if (this._getProjectDuration(project) <= 0) {
      const completion = this.completeProject(projectId, { record });
      if (completion?.success) {
        return { ...completion, success: true, fundsSpent, completed: true };
      }
    }

    return {
      success: true,
      fundsSpent,
      project,
      completed: false,
    };
  }

  advanceProject(projectId, { days = 0, fundsAvailable = 0 } = {}) {
    const record = this._findProjectRecord(projectId);
    if (!record) {
      return { success: false, reason: 'not-found' };
    }

    if (record.tierIndex > this.tierIndex) {
      return { success: false, reason: 'locked' };
    }

    const project = record.project;
    const status = typeof project.status === 'string' ? project.status.toLowerCase() : '';
    if (status !== 'building' && status !== 'fabricating') {
      return { success: false, reason: 'not-started', status };
    }

    const cost = this._getProjectCost(project);
    const fundedAmount = this._getProjectFunded(project);
    if (fundedAmount < cost) {
      return {
        success: false,
        reason: 'needs-funding',
        remainingCost: cost - fundedAmount,
      };
    }

    const duration = this._getProjectDuration(project);
    const availableFunds = Number.isFinite(fundsAvailable) ? Math.max(0, fundsAvailable) : 0;
    const rushCostPerDay = this._getProjectRushCost(project);
    let timeInvested = this._getProjectTimeInvested(project);
    let fundsSpent = 0;
    let daysAdvanced = 0;

    if (Number.isFinite(days) && days > 0 && duration > 0) {
      const manualAdvance = Math.min(days, Math.max(0, duration - timeInvested));
      if (manualAdvance > 0) {
        timeInvested += manualAdvance;
        daysAdvanced += manualAdvance;
      }
    }

    if (availableFunds > 0 && duration > 0 && rushCostPerDay > 0) {
      const remainingTime = Math.max(0, duration - timeInvested);
      const affordableDays = Math.min(remainingTime, Math.floor(availableFunds / rushCostPerDay));
      if (affordableDays > 0) {
        const rushCost = affordableDays * rushCostPerDay;
        fundsSpent += rushCost;
        timeInvested += affordableDays;
        daysAdvanced += affordableDays;
      }
    }

    project.timeInvested = Math.min(duration, timeInvested);
    const completed = duration <= 0 || project.timeInvested >= duration;
    this._refreshProjectProgress(project);

    if (completed) {
      const completion = this.completeProject(projectId, { record });
      if (completion?.success) {
        return {
          ...completion,
          success: true,
          fundsSpent,
          daysAdvanced,
          completed: true,
        };
      }
    }

    return {
      success: daysAdvanced > 0 || fundsSpent > 0,
      fundsSpent,
      daysAdvanced,
      completed: false,
      remainingTime: Math.max(0, duration - project.timeInvested),
      project,
    };
  }

  completeProject(projectId, { record = null } = {}) {
    const resolvedRecord = record ?? this._findProjectRecord(projectId);
    if (!resolvedRecord) {
      return { success: false, reason: 'not-found' };
    }

    const { tier, tierIndex, projectIndex, project } = resolvedRecord;
    if (tierIndex > this.tierIndex) {
      return { success: false, reason: 'locked' };
    }

    const cost = this._getProjectCost(project);
    const fundedAmount = this._getProjectFunded(project);
    if (fundedAmount < cost) {
      return {
        success: false,
        reason: 'needs-funding',
        remainingCost: cost - fundedAmount,
      };
    }

    const duration = this._getProjectDuration(project);
    const timeInvested = this._getProjectTimeInvested(project);
    if (duration > 0 && timeInvested < duration) {
      return {
        success: false,
        reason: 'needs-time',
        remainingTime: duration - timeInvested,
      };
    }

    if (!Array.isArray(tier.amenities)) {
      tier.amenities = [];
    }

    project.status = 'active';
    this._refreshProjectProgress(project);
    const amenity = { ...project };
    if (Array.isArray(tier.projects)) {
      tier.projects.splice(projectIndex, 1);
    }
    tier.amenities.push(amenity);

    return {
      success: true,
      amenity,
      projectId,
    };
  }

  getPurchaseCost() {
    return Number.isFinite(this.purchaseCost) ? this.purchaseCost : 0;
  }

  isOwned() {
    return Boolean(this.owned);
  }

  setOwned(value = true) {
    this.owned = Boolean(value);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      location: this.location,
      description: this.description,
      tiers: this.tiers.map((tier) => ({
        ...tier,
        amenities: Array.isArray(tier.amenities)
          ? tier.amenities.map((amenity) => ({ ...amenity }))
          : [],
        projects: Array.isArray(tier.projects)
          ? tier.projects.map((project) => ({ ...project }))
          : [],
      })),
      tierIndex: this.tierIndex,
      purchaseCost: this.purchaseCost,
      owned: this.owned,
      facilityDowntimes: this.getFacilityDowntimeEntries(),
    };
  }

  static fromJSON(data) {
    if (data instanceof Safehouse) {
      return data.clone();
    }

    if (!data || typeof data !== 'object') {
      return null;
    }

    return new Safehouse({
      ...data,
      tiers: Array.isArray(data.tiers) ? data.tiers.map((tier) => ({ ...tier })) : [],
    });
  }
}

class SafehouseCollection {
  constructor(entries = []) {
    this.safehouses = new Map();
    this.defaultSafehouseId = null;

    if (entries instanceof SafehouseCollection) {
      entries.toArray().forEach((entry) => this.add(entry.clone()));
      this.defaultSafehouseId = entries.defaultSafehouseId;
      return;
    }

    const isSerializedCollection =
      !Array.isArray(entries) && typeof entries === 'object' && Array.isArray(entries?.safehouses);

    const rawEntries = Array.isArray(entries)
      ? entries
      : isSerializedCollection
        ? entries.safehouses
        : [];

    const providedDefaultId = isSerializedCollection ? entries.defaultSafehouseId ?? null : null;

    rawEntries.forEach((entry, index) => {
      const safehouse = this.add(entry);
      if (!this.defaultSafehouseId && providedDefaultId && safehouse.id === providedDefaultId) {
        this.defaultSafehouseId = safehouse.id;
      }
      if (!this.defaultSafehouseId && index === 0) {
        this.defaultSafehouseId = safehouse.id;
      }
    });

    const hasOwnedSafehouse = Array.from(this.safehouses.values()).some(
      (safehouse) => safehouse?.isOwned?.() || safehouse?.owned,
    );
    if (!hasOwnedSafehouse) {
      const firstSafehouse = this.safehouses.values().next().value;
      if (firstSafehouse) {
        if (typeof firstSafehouse.setOwned === 'function') {
          firstSafehouse.setOwned(true);
        } else {
          firstSafehouse.owned = true;
        }
      }
    }

    if (!this.defaultSafehouseId && this.safehouses.size) {
      const ownedSafehouse = this.getFirstOwnedSafehouse();
      if (ownedSafehouse) {
        this.defaultSafehouseId = ownedSafehouse.id;
      } else {
        this.defaultSafehouseId = this.safehouses.values().next().value.id;
      }
    }
  }

  add(entry) {
    if (!entry) {
      return null;
    }

    const safehouse = entry instanceof Safehouse ? entry : new Safehouse(entry);
    this.safehouses.set(safehouse.id, safehouse);
    return safehouse;
  }

  getById(id) {
    return id ? this.safehouses.get(id) ?? null : null;
  }

  getDefault() {
    return this.getById(this.defaultSafehouseId);
  }

  setDefault(id) {
    if (this.safehouses.has(id)) {
      this.defaultSafehouseId = id;
    }
  }

  markOwned(id, value = true) {
    const safehouse = this.getById(id);
    if (!safehouse) {
      return null;
    }

    if (typeof safehouse.setOwned === 'function') {
      safehouse.setOwned(value);
    } else {
      safehouse.owned = Boolean(value);
    }

    if (value && !this.defaultSafehouseId) {
      this.defaultSafehouseId = safehouse.id;
    }

    return safehouse;
  }

  applyFacilityDowntime(safehouseId, downtime, currentDay = null) {
    const safehouse = this.getById(safehouseId);
    if (!safehouse || typeof safehouse.setFacilityDowntime !== 'function') {
      return null;
    }

    if (typeof safehouse.pruneFacilityDowntimes === 'function' && Number.isFinite(currentDay)) {
      safehouse.pruneFacilityDowntimes(currentDay);
    }

    return safehouse.setFacilityDowntime(downtime, { currentDay });
  }

  clearFacilityDowntime(safehouseId, facilityId, { currentDay = null } = {}) {
    const safehouse = this.getById(safehouseId);
    if (!safehouse || typeof safehouse.clearFacilityDowntime !== 'function') {
      return false;
    }

    if (typeof safehouse.pruneFacilityDowntimes === 'function' && Number.isFinite(currentDay)) {
      safehouse.pruneFacilityDowntimes(currentDay);
    }

    return safehouse.clearFacilityDowntime(facilityId);
  }

  pruneFacilityDowntimes(currentDay = null) {
    if (!Number.isFinite(currentDay)) {
      return;
    }

    this.safehouses.forEach((safehouse) => {
      if (safehouse?.pruneFacilityDowntimes) {
        safehouse.pruneFacilityDowntimes(currentDay);
      }
    });
  }

  isOwned(id) {
    const safehouse = this.getById(id);
    return safehouse ? Boolean(safehouse.isOwned?.() ?? safehouse.owned) : false;
  }

  getFirstOwnedSafehouse() {
    for (const safehouse of this.safehouses.values()) {
      if (safehouse?.isOwned?.() || safehouse?.owned) {
        return safehouse;
      }
    }
    return null;
  }

  toArray() {
    return Array.from(this.safehouses.values());
  }

  toJSON() {
    return {
      safehouses: this.toArray().map((safehouse) => safehouse.toJSON()),
      defaultSafehouseId: this.defaultSafehouseId,
    };
  }

  static fromJSON(data) {
    if (data instanceof SafehouseCollection) {
      return new SafehouseCollection(data);
    }

    if (!data || typeof data !== 'object') {
      return new SafehouseCollection();
    }

    const entries = Array.isArray(data.safehouses) ? data.safehouses : data;
    return new SafehouseCollection({
      safehouses: Array.isArray(entries) ? entries : [],
      defaultSafehouseId: data.defaultSafehouseId ?? null,
    });
  }
}

const DEFAULT_SAFEHOUSES = [
  {
    id: 'dockside-warehouse',
    name: 'Dockside Warehouse',
    location: 'East Docks',
    description: 'An abandoned freight warehouse with hidden access to the river.',
    purchaseCost: 0,
    owned: true,
    tiers: [
      {
        level: 0,
        label: 'Bolthole',
        description: 'Makeshift bunks and a single loading bay keep the crew out of sight.',
        passiveIncome: 0,
        heatReduction: 0.15,
        storageCapacity: 4,
        overheadModifier: 0,
        upgradeCost: 0,
        amenities: [
          {
            id: 'crash-cots',
            name: 'Crash Cots',
            summary: 'Improvised bunks speed up fatigue recovery for resting crew.',
            status: 'active',
          },
          {
            id: 'river-cache',
            name: 'River Cache',
            summary: 'Hidden lockers funnel contraband cash and quietly shed mission heat.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'reinforce-loading-bay',
            name: 'Reinforce Loading Bay',
            summary: 'Materials staged to widen the bay and vent even more mission heat.',
            status: 'queued',
            cost: 6500,
            durationDays: 3,
            rushCostPerDay: 2400,
          },
        ],
      },
      {
        level: 1,
        label: 'Reinforced Bay',
        description: 'Hardened shutters and smugglers\' lockers add side hustle revenue.',
        passiveIncome: 600,
        heatReduction: 0.35,
        storageCapacity: 6,
        overheadModifier: -150,
        upgradeCost: 12000,
        amenities: [
          {
            id: 'workshop-bays',
            name: 'Workshop Bays',
            summary: 'Dedicated work areas trim overhead and shave minutes off prep.',
            status: 'active',
          },
          {
            id: 'dead-drop-network',
            name: 'Dead Drop Network',
            summary: 'Courier caches bleed daily heat and soften mission signatures.',
            status: 'active',
          },
          {
            id: 'ops-sim-lab',
            name: 'Ops Sim Lab',
            summary: 'Simulation rigs rehearse routes for tighter payouts.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'operations-floor-plans',
            name: 'Operations Floor Plans',
            summary: 'Blueprints drafted for a command mezzanine that bumps success odds.',
            status: 'in-design',
            cost: 9800,
            durationDays: 4,
            rushCostPerDay: 3200,
          },
        ],
      },
      {
        level: 2,
        label: 'Operations Floor',
        description: 'Dedicated planning rooms and dead drops smooth daily logistics.',
        passiveIncome: 1250,
        heatReduction: 0.65,
        storageCapacity: 9,
        overheadModifier: -260,
        upgradeCost: 24000,
        amenities: [
          {
            id: 'ops-briefing-theater',
            name: 'Ops Briefing Theater',
            summary: 'Live briefings keep recovery tight and add +1% success.',
            status: 'active',
          },
          {
            id: 'rapid-response-shed',
            name: 'Rapid Response Shed',
            summary: 'Staged getaway rigs strip daily heat and 3% off mission timers.',
            status: 'active',
          },
          {
            id: 'escape-tunnel-grid',
            name: 'Escape Tunnel Grid',
            summary: 'Hidden egress tunnels carve seconds off every extraction.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'ghost-terminal-core',
            name: 'Ghost Terminal Core',
            summary: 'Shell companies assemble a laundering core that strips mission heat.',
            status: 'fabricating',
            cost: 14200,
            durationDays: 5,
            rushCostPerDay: 3600,
          },
        ],
      },
      {
        level: 3,
        label: 'Ghost Terminal',
        description: 'Scrub teams and shell companies launder cash and bury footprints.',
        passiveIncome: 2000,
        heatReduction: 1,
        storageCapacity: 12,
        overheadModifier: -420,
        upgradeCost: 36000,
        amenities: [
          {
            id: 'ghost-terminal',
            name: 'Ghost Terminal',
            summary: 'Automated laundering knocks citywide heat down each day.',
            status: 'active',
          },
          {
            id: 'shell-company-hub',
            name: 'Shell Company Hub',
            summary: 'Paper fronts open doors to lucrative syndicate contracts.',
            status: 'active',
          },
        ],
        projects: [],
      },
    ],
  },
  {
    id: 'uptown-penthouse',
    name: 'Uptown Penthouse',
    location: 'Crown Heights',
    description: 'A faux consulting firm occupying a high-rise penthouse.',
    purchaseCost: 42000,
    tiers: [
      {
        level: 0,
        label: 'Front Office',
        description: 'Cover identities keep alibis clean but the rent is sky-high.',
        passiveIncome: 300,
        heatReduction: 0.1,
        storageCapacity: 3,
        overheadModifier: 120,
        upgradeCost: 8000,
        amenities: [
          {
            id: 'executive-front-desk',
            name: 'Executive Front Desk',
            summary: 'Concierge cover deflects surveillance and trims mission heat.',
            status: 'active',
          },
          {
            id: 'rooftop-pad',
            name: 'Rooftop Landing Pad',
            summary: 'Couriers hot-drop gear, speeding prep and mission timers.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'private-elevator-upfit',
            name: 'Private Elevator Upfit',
            summary: 'Security upgrades add private lifts that cut mission clocks.',
            status: 'queued',
            cost: 11500,
            durationDays: 3,
            rushCostPerDay: 3400,
          },
        ],
      },
      {
        level: 1,
        label: 'Executive Suite',
        description: 'Private elevators and cash-only clientele boost revenue streams.',
        passiveIncome: 950,
        heatReduction: 0.3,
        storageCapacity: 5,
        overheadModifier: -60,
        upgradeCost: 20000,
        amenities: [
          {
            id: 'executive-war-room',
            name: 'Executive War Room',
            summary: 'Deal rooms raise payouts and add extra mission success.',
            status: 'active',
          },
          {
            id: 'quiet-network',
            name: 'Quiet Network',
            summary: 'Insider call trees dampen patrol response and mission heat.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'shadow-boardroom-designs',
            name: 'Shadow Boardroom Designs',
            summary: 'Architects draft secret boardrooms to boost success odds.',
            status: 'in-design',
            cost: 16800,
            durationDays: 4,
            rushCostPerDay: 4200,
          },
        ],
      },
      {
        level: 2,
        label: 'Shadow Boardroom',
        description: 'Backroom brokers redirect attention while laundering more funds.',
        passiveIncome: 1700,
        heatReduction: 0.55,
        storageCapacity: 8,
        overheadModifier: -220,
        upgradeCost: 34000,
        amenities: [
          {
            id: 'shadow-boardroom',
            name: 'Shadow Boardroom',
            summary: 'Influence ops add notable success bonuses on premier targets.',
            status: 'active',
          },
          {
            id: 'shell-finance-desk',
            name: 'Shell Finance Desk',
            summary: 'Pop-up financiers add payouts and discount heat buys.',
            status: 'active',
          },
          {
            id: 'informant-dead-drops',
            name: 'Informant Dead Drops',
            summary: 'Informant payouts supercharge heat-buy operations.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'phantom-syndicate-expansion',
            name: 'Phantom Syndicate Expansion',
            summary: 'Lays whisper-network groundwork to erase traces mid-mission.',
            status: 'fabricating',
            cost: 22800,
            durationDays: 5,
            rushCostPerDay: 5200,
          },
        ],
      },
      {
        level: 3,
        label: 'Phantom Syndicate',
        description: 'A full counter-intelligence suite erases traces as deals close.',
        passiveIncome: 2600,
        heatReduction: 0.9,
        storageCapacity: 10,
        overheadModifier: -380,
        upgradeCost: 52000,
        amenities: [
          {
            id: 'phantom-syndicate-suite',
            name: 'Phantom Syndicate Suite',
            summary: 'Counter-intel rig slashes mission heat and amplifies mitigation.',
            status: 'active',
          },
          {
            id: 'vip-concierge-ring',
            name: 'VIP Concierge Ring',
            summary: 'High-roller clients unlock premium contracts and bigger payouts.',
            status: 'active',
          },
        ],
        projects: [],
      },
    ],
  },
];

const createDefaultSafehouseCollection = () => new SafehouseCollection(DEFAULT_SAFEHOUSES);

const getActiveSafehouseFromState = (state) => {
  if (!state) {
    return null;
  }

  const collection = state.safehouses instanceof SafehouseCollection
    ? state.safehouses
    : new SafehouseCollection(state.safehouses ?? []);

  if (!(state.safehouses instanceof SafehouseCollection)) {
    state.safehouses = collection;
  }

  const currentDay = Number.isFinite(state.day) ? state.day : null;
  if (typeof collection.pruneFacilityDowntimes === 'function') {
    collection.pruneFacilityDowntimes(currentDay);
  }

  const player = state.player ?? null;
  const desiredSafehouseId = player?.safehouseId ?? collection.defaultSafehouseId;

  let safehouse = desiredSafehouseId ? collection.getById(desiredSafehouseId) : null;
  if (safehouse && !collection.isOwned(safehouse.id)) {
    safehouse = null;
  }

  if (!safehouse) {
    const fallback = collection.getFirstOwnedSafehouse() ?? collection.getDefault();
    if (fallback && player) {
      if (typeof player.assignSafehouse === 'function') {
        player.assignSafehouse(fallback.id);
      } else {
        player.safehouseId = fallback.id;
      }
    }
    safehouse = fallback;
  }

  if (safehouse?.pruneFacilityDowntimes && Number.isFinite(currentDay)) {
    safehouse.pruneFacilityDowntimes(currentDay);
  }

  return safehouse;
};

const getActiveStorageCapacityFromState = (state) => {
  const safehouse = getActiveSafehouseFromState(state);
  if (!safehouse || typeof safehouse.getStorageCapacity !== 'function') {
    return null;
  }

  const capacity = safehouse.getStorageCapacity();
  if (!Number.isFinite(capacity) || capacity < 0) {
    return null;
  }

  return capacity;
};

export {
  Safehouse,
  SafehouseCollection,
  DEFAULT_SAFEHOUSES,
  createDefaultSafehouseCollection,
  getActiveSafehouseFromState,
  getActiveStorageCapacityFromState,
};
