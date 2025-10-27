const getRandomId = () => {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const normalizeFacility = (entry, fallbackId, defaultName) => {
  if (!entry || typeof entry !== 'object') {
    return {
      id: fallbackId,
      name: defaultName,
      summary: '',
      status: 'planned',
    };
  }

  const id = entry.id ?? fallbackId;
  const name = entry.name ?? defaultName;
  const summary = entry.summary ?? entry.description ?? '';
  const status = entry.status ?? entry.state ?? null;

  return {
    id,
    name,
    summary,
    status: status ?? 'planned',
  };
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
  }

  clone() {
    return new Safehouse({
      id: this.id,
      name: this.name,
      location: this.location,
      description: this.description,
      tiers: this.tiers.map((tier) => ({ ...tier })),
      tierIndex: this.tierIndex,
      purchaseCost: this.purchaseCost,
      owned: this.owned,
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

  getUpcomingProjects() {
    const projects = [];
    for (let index = this.tierIndex + 1; index < this.tiers.length; index += 1) {
      projects.push(...this.getProjectsForTier(index));
    }
    return projects;
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
      tiers: this.tiers.map((tier) => ({ ...tier })),
      tierIndex: this.tierIndex,
      purchaseCost: this.purchaseCost,
      owned: this.owned,
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
            summary: 'Hidden lockers along the docks trickle bonus contraband for sale.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'reinforce-loading-bay',
            name: 'Reinforce Loading Bay',
            summary: 'Materials staged to expand the bay once crews secure more funding.',
            status: 'queued',
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
            summary: 'Dedicated work areas unlock faster vehicle tuning and mod prep.',
            status: 'active',
          },
          {
            id: 'dead-drop-network',
            name: 'Dead Drop Network',
            summary: 'Courier caches shave a bit of heat off successful jobs.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'operations-floor-plans',
            name: 'Operations Floor Plans',
            summary: 'Blueprints drafted for a command mezzanine to coordinate crews.',
            status: 'in-design',
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
            summary: 'Pre-run briefings grant crews sharper success odds.',
            status: 'active',
          },
          {
            id: 'rapid-response-shed',
            name: 'Rapid Response Shed',
            summary: 'Staged getaway rigs reduce downtime after heat spikes.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'ghost-terminal-core',
            name: 'Ghost Terminal Core',
            summary: 'Shell companies assemble a laundering terminal for the final tier.',
            status: 'fabricating',
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
            summary: 'Concierge cover services deflect casual surveillance.',
            status: 'active',
          },
          {
            id: 'rooftop-pad',
            name: 'Rooftop Landing Pad',
            summary: 'Couriers can hot-drop gear to cut mission prep time.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'private-elevator-upfit',
            name: 'Private Elevator Upfit',
            summary: 'Security upgrades queued to harden access control.',
            status: 'queued',
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
            summary: 'Deal rooms unlock negotiation prep that bumps payouts.',
            status: 'active',
          },
          {
            id: 'quiet-network',
            name: 'Quiet Network',
            summary: 'An insider call tree trims crackdown patrol response.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'shadow-boardroom-designs',
            name: 'Shadow Boardroom Designs',
            summary: 'Architects draft secret boardrooms to steer city movers.',
            status: 'in-design',
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
            summary: 'Influence ops grant small success bonuses on high-end targets.',
            status: 'active',
          },
          {
            id: 'shell-finance-desk',
            name: 'Shell Finance Desk',
            summary: 'Pop-up financiers underwrite expensive crew loyalty jobs.',
            status: 'active',
          },
        ],
        projects: [
          {
            id: 'phantom-syndicate-expansion',
            name: 'Phantom Syndicate Expansion',
            summary: 'Lays groundwork for a whisper-network to erase crackdown traces.',
            status: 'fabricating',
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
            summary: 'Counter-intel rig shaves an extra chunk of heat after every score.',
            status: 'active',
          },
          {
            id: 'vip-concierge-ring',
            name: 'VIP Concierge Ring',
            summary: 'High-roller clients open premium contracts when morale is high.',
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
