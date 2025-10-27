const getRandomId = () => {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const normalizeTier = (tier, index) => {
  const level = Number.isFinite(tier?.level) ? tier.level : index;
  const upgradeCost = Number.isFinite(tier?.upgradeCost) ? tier.upgradeCost : 0;
  const passiveIncome = Number.isFinite(tier?.passiveIncome) ? tier.passiveIncome : 0;
  const heatReduction = Number.isFinite(tier?.heatReduction) ? tier.heatReduction : 0;
  const storageCapacity = Number.isFinite(tier?.storageCapacity) ? tier.storageCapacity : 0;
  const overheadModifier = Number.isFinite(tier?.overheadModifier) ? tier.overheadModifier : 0;

  return {
    level,
    label: tier?.label ?? `Tier ${level + 1}`,
    description: tier?.description ?? '',
    passiveIncome,
    heatReduction,
    storageCapacity,
    overheadModifier,
    upgradeCost,
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
