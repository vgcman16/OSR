import { CREW_GEAR_CATALOG } from './crewGear.js';

const DEFAULT_VENDOR_ID = 'grey-market-quartermaster';
const DEFAULT_RESTOCK_INTERVAL_DAYS = 5;
const DEFAULT_STOCK = 1;

const GEAR_BLUEPRINTS = [
  {
    gearId: 'thermal-shroud',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 2,
    restockIntervalDays: 4,
    minDay: 1,
  },
  {
    gearId: 'relay-drone',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 5,
    minDay: 2,
  },
  {
    gearId: 'wheelman-escape-pack',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 2,
    restockIntervalDays: 4,
    minDay: 1,
  },
  {
    gearId: 'ops-sim-tablet',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 5,
    minDay: 3,
  },
  {
    gearId: 'urban-camouflage-kit',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 2,
    restockIntervalDays: 5,
    minDay: 2,
  },
  {
    gearId: 'signal-disruptor',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 6,
    minDay: 3,
    requirements: [
      {
        type: 'recon-success',
        count: 1,
        message: 'Complete a recon op to unlock this disruptor.',
      },
    ],
  },
  {
    gearId: 'signal-forger-kit',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 7,
    minDay: 5,
    requirements: [
      {
        type: 'intel',
        threshold: 60,
        message: 'Raise any district intel to 60 to impress this supplier.',
      },
    ],
  },
  {
    gearId: 'overwatch-uplink',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 6,
    minDay: 6,
    requirements: [
      {
        type: 'intel',
        threshold: 62,
        districtName: 'Downtown',
        message: 'Push Downtown intel to 62 to unlock uplink access.',
      },
    ],
  },
  {
    gearId: 'holo-decoy-projector',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 7,
    minDay: 6,
    requirements: [
      {
        type: 'milestone',
        milestoneId: 'downtown-campaign-stage-2',
        message: 'Complete the Downtown campaign Stage 2 reward to purchase decoys.',
      },
    ],
  },
  {
    gearId: 'holo-breach-belt',
    vendorId: DEFAULT_VENDOR_ID,
    stock: 1,
    restockIntervalDays: 8,
    minDay: 8,
    requirements: [
      {
        type: 'milestone',
        milestoneId: 'hills-campaign-stage-2',
        message: 'Complete Suburban Hills campaign Stage 2 to unlock breach belts.',
      },
    ],
  },
];

const BLUEPRINT_BY_ID = GEAR_BLUEPRINTS.reduce((map, blueprint) => {
  if (blueprint?.gearId) {
    map.set(blueprint.gearId, blueprint);
  }
  return map;
}, new Map());

const toSafeInteger = (value, { fallback = 0, min = Number.NEGATIVE_INFINITY } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = Math.floor(numeric);
  return clamped < min ? min : clamped;
};

const normalizeDistrictIdentifier = (value) => {
  if (!value) {
    return null;
  }
  return String(value).trim().toLowerCase();
};

const getDistrictsFromState = (state) => {
  if (!state) {
    return [];
  }
  if (Array.isArray(state.city?.districts)) {
    return state.city.districts;
  }
  if (Array.isArray(state?.city)) {
    return state.city;
  }
  return [];
};

const resolveDistrictIntel = (state, requirement = {}) => {
  const districts = getDistrictsFromState(state);
  if (!districts.length) {
    return { districtName: requirement?.districtName ?? null, intel: 0 };
  }

  const targetId = normalizeDistrictIdentifier(requirement?.districtId);
  const targetName = normalizeDistrictIdentifier(requirement?.districtName);

  if (!targetId && !targetName) {
    const intel = districts.reduce((highest, district) => {
      const candidate = Number(district?.intelLevel);
      return Number.isFinite(candidate) && candidate > highest ? candidate : highest;
    }, 0);
    return { districtName: 'any district', intel };
  }

  let matched = null;
  districts.forEach((district) => {
    if (!district) {
      return;
    }
    const districtId = normalizeDistrictIdentifier(district.id);
    const districtName = normalizeDistrictIdentifier(district.name);
    if (
      (targetId && districtId === targetId)
      || (targetName && districtName === targetName)
    ) {
      matched = district;
    }
  });

  if (!matched) {
    return { districtName: requirement?.districtName ?? requirement?.districtId ?? 'the district', intel: 0 };
  }

  const intel = Number.isFinite(matched.intelLevel) ? Math.round(matched.intelLevel) : 0;
  return { districtName: matched.name ?? requirement?.districtName ?? 'the district', intel };
};

const findCampaignMilestone = (state, milestoneId) => {
  if (!milestoneId) {
    return null;
  }
  const districts = getDistrictsFromState(state);
  const normalizedId = String(milestoneId).trim();
  for (const district of districts) {
    const campaign = district?.campaign;
    const milestones = Array.isArray(campaign?.milestones) ? campaign.milestones : [];
    for (const milestone of milestones) {
      if (milestone?.id === normalizedId) {
        return { district, milestone, campaign };
      }
    }
  }
  return null;
};

const countSuccessfulReconAssignments = (state) => {
  const assignments = Array.isArray(state?.reconAssignments) ? state.reconAssignments : [];
  return assignments.filter((assignment) => {
    if (!assignment || assignment.status !== 'completed') {
      return false;
    }
    if (assignment.result && typeof assignment.result === 'object') {
      if (assignment.result.success === false) {
        return false;
      }
    }
    return true;
  }).length;
};

const evaluateRequirement = (state, requirement = {}) => {
  const currentDay = toSafeInteger(state?.day, { fallback: 1, min: 1 });
  const descriptor = requirement?.type ?? 'unknown';

  switch (descriptor) {
    case 'day': {
      const target = toSafeInteger(requirement.day ?? requirement.value ?? requirement.threshold, {
        fallback: currentDay,
        min: 1,
      });
      const fulfilled = currentDay >= target;
      const remaining = Math.max(0, target - currentDay);
      const baseMessage = requirement.message
        ?? `Available starting Day ${target}.`;
      const message = fulfilled
        ? baseMessage
        : `${baseMessage} (${remaining} day${remaining === 1 ? '' : 's'} remaining).`;
      return { type: 'day', fulfilled, message, targetDay: target, remainingDays: remaining };
    }
    case 'intel': {
      const { districtName, intel } = resolveDistrictIntel(state, requirement);
      const threshold = toSafeInteger(requirement.threshold ?? requirement.level ?? requirement.value, {
        fallback: 55,
        min: 0,
      });
      const fulfilled = intel >= threshold;
      const progressLabel = `${intel}/${threshold}`;
      const baseMessage = requirement.message
        ?? `Raise ${districtName} intel to ${threshold} via recon.`;
      const message = fulfilled
        ? `${baseMessage} (achieved ${progressLabel}).`
        : `${baseMessage} (current ${progressLabel}).`;
      return { type: 'intel', fulfilled, message, intel, threshold, districtName };
    }
    case 'milestone': {
      const milestoneId = requirement.milestoneId ?? requirement.id ?? null;
      if (!milestoneId) {
        return { type: 'milestone', fulfilled: true, message: requirement.message ?? null };
      }
      const snapshot = findCampaignMilestone(state, milestoneId);
      const completed = snapshot?.milestone?.status === 'completed'
        || (Array.isArray(snapshot?.campaign?.completedMilestones)
          ? snapshot.campaign.completedMilestones.includes(milestoneId)
          : false);
      const label = snapshot?.milestone?.name ?? requirement.label ?? milestoneId;
      const districtName = snapshot?.district?.name ?? requirement.districtName ?? 'the district campaign';
      const baseMessage = requirement.message
        ?? `Complete ${label} in ${districtName} to unlock.`;
      const message = completed
        ? `${label} completed in ${districtName}.`
        : baseMessage;
      return { type: 'milestone', fulfilled: completed, message, milestoneId, districtName };
    }
    case 'recon-success': {
      const required = Math.max(1, toSafeInteger(requirement.count ?? requirement.successes ?? requirement.threshold, {
        fallback: 1,
        min: 1,
      }));
      const successful = countSuccessfulReconAssignments(state);
      const fulfilled = successful >= required;
      const progressLabel = `${successful}/${required}`;
      const baseMessage = requirement.message
        ?? `Complete ${required} recon operation${required === 1 ? '' : 's'}.`;
      const message = fulfilled
        ? `${baseMessage} (${progressLabel} achieved).`
        : `${baseMessage} (current ${progressLabel}).`;
      return { type: 'recon-success', fulfilled, message, required, successful };
    }
    default:
      return { type: descriptor, fulfilled: true, message: requirement.message ?? null };
  }
};

const ensureRequirementArray = (blueprint) => {
  const baseRequirements = Array.isArray(blueprint?.requirements) ? blueprint.requirements.slice() : [];
  if (blueprint?.minDay) {
    baseRequirements.unshift({ type: 'day', day: blueprint.minDay });
  }
  return baseRequirements;
};

const createInitialCrewGearVendorState = ({ day = 1 } = {}) => {
  const currentDay = toSafeInteger(day, { fallback: 1, min: 1 });
  const stockById = {};

  GEAR_BLUEPRINTS.forEach((blueprint) => {
    if (!blueprint?.gearId) {
      return;
    }
    const maxStock = Math.max(1, toSafeInteger(blueprint.stock, { fallback: DEFAULT_STOCK, min: 1 }));
    const restockIntervalDays = Math.max(
      1,
      toSafeInteger(blueprint.restockIntervalDays, { fallback: DEFAULT_RESTOCK_INTERVAL_DAYS, min: 1 }),
    );
    const nextRestockDay = currentDay + restockIntervalDays;

    stockById[blueprint.gearId] = {
      gearId: blueprint.gearId,
      vendorId: blueprint.vendorId ?? DEFAULT_VENDOR_ID,
      quantity: maxStock,
      maxStock,
      restockIntervalDays,
      nextRestockDay,
      lastRestockedDay: currentDay,
    };
  });

  return {
    version: 1,
    vendorId: DEFAULT_VENDOR_ID,
    stockById,
    lastEvaluatedDay: currentDay,
    lastTransactionAt: null,
  };
};

const sanitizeCrewGearVendorState = (value, { day } = {}) => {
  const fallback = createInitialCrewGearVendorState({ day });
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const currentDay = toSafeInteger(day ?? value.lastEvaluatedDay ?? 1, { fallback: 1, min: 1 });
  const stockById = {};

  GEAR_BLUEPRINTS.forEach((blueprint) => {
    const blueprintId = blueprint.gearId;
    if (!blueprintId) {
      return;
    }
    const sourceEntry = value.stockById?.[blueprintId] ?? {};
    const maxStock = Math.max(1, toSafeInteger(blueprint.stock, { fallback: DEFAULT_STOCK, min: 1 }));
    const restockIntervalDays = Math.max(
      1,
      toSafeInteger(
        sourceEntry.restockIntervalDays ?? blueprint.restockIntervalDays,
        { fallback: DEFAULT_RESTOCK_INTERVAL_DAYS, min: 1 },
      ),
    );
    const quantity = Math.max(0, toSafeInteger(sourceEntry.quantity, { fallback: maxStock, min: 0 }));
    const nextRestockDay = Math.max(
      currentDay,
      toSafeInteger(sourceEntry.nextRestockDay, {
        fallback: currentDay + restockIntervalDays,
        min: 1,
      }),
    );
    const lastRestockedDay = Math.max(
      1,
      toSafeInteger(sourceEntry.lastRestockedDay, { fallback: currentDay, min: 1 }),
    );

    stockById[blueprintId] = {
      gearId: blueprintId,
      vendorId: blueprint.vendorId ?? DEFAULT_VENDOR_ID,
      quantity,
      maxStock,
      restockIntervalDays,
      nextRestockDay,
      lastRestockedDay,
    };
  });

  return {
    version: 1,
    vendorId: value.vendorId ?? DEFAULT_VENDOR_ID,
    stockById,
    lastEvaluatedDay: currentDay,
    lastTransactionAt: value.lastTransactionAt ?? null,
  };
};

const ensureVendorState = (state) => {
  if (!state) {
    return createInitialCrewGearVendorState();
  }
  if (!state.crewGearVendors || typeof state.crewGearVendors !== 'object') {
    state.crewGearVendors = createInitialCrewGearVendorState({ day: state?.day });
  } else {
    state.crewGearVendors = sanitizeCrewGearVendorState(state.crewGearVendors, { day: state?.day });
  }
  return state.crewGearVendors;
};

const ensureVendorEntry = (vendorState, blueprint, { day }) => {
  if (!vendorState || !blueprint?.gearId) {
    return null;
  }
  const currentDay = toSafeInteger(day, { fallback: 1, min: 1 });
  const existing = vendorState.stockById?.[blueprint.gearId];
  if (existing) {
    return existing;
  }
  const maxStock = Math.max(1, toSafeInteger(blueprint.stock, { fallback: DEFAULT_STOCK, min: 1 }));
  const restockIntervalDays = Math.max(
    1,
    toSafeInteger(blueprint.restockIntervalDays, { fallback: DEFAULT_RESTOCK_INTERVAL_DAYS, min: 1 }),
  );
  const nextRestockDay = currentDay + restockIntervalDays;
  const entry = {
    gearId: blueprint.gearId,
    vendorId: blueprint.vendorId ?? vendorState.vendorId ?? DEFAULT_VENDOR_ID,
    quantity: maxStock,
    maxStock,
    restockIntervalDays,
    nextRestockDay,
    lastRestockedDay: currentDay,
  };
  vendorState.stockById[blueprint.gearId] = entry;
  return entry;
};

const syncCrewGearVendorState = (state) => {
  const vendorState = ensureVendorState(state);
  const currentDay = toSafeInteger(state?.day ?? vendorState.lastEvaluatedDay ?? 1, {
    fallback: 1,
    min: 1,
  });
  let restocked = false;

  GEAR_BLUEPRINTS.forEach((blueprint) => {
    const entry = ensureVendorEntry(vendorState, blueprint, { day: currentDay });
    if (!entry) {
      return;
    }

    const requirements = ensureRequirementArray(blueprint).map((req) => evaluateRequirement(state, req));
    const locked = requirements.some((req) => req && req.fulfilled === false);
    const readyForRestock = Number.isFinite(entry.nextRestockDay)
      ? currentDay >= entry.nextRestockDay
      : false;

    if (!locked && readyForRestock) {
      const previousQuantity = entry.quantity;
      entry.quantity = entry.maxStock;
      entry.lastRestockedDay = currentDay;
      entry.nextRestockDay = currentDay + entry.restockIntervalDays;
      if (previousQuantity !== entry.quantity) {
        restocked = true;
      }
    }
  });

  vendorState.lastEvaluatedDay = currentDay;
  return { vendorState, restocked };
};

const getCrewGearVendorOptions = (state) => {
  const { vendorState } = syncCrewGearVendorState(state);
  const currentDay = toSafeInteger(state?.day ?? vendorState.lastEvaluatedDay ?? 1, {
    fallback: 1,
    min: 1,
  });

  return GEAR_BLUEPRINTS.map((blueprint) => {
    const config = CREW_GEAR_CATALOG[blueprint.gearId] ?? null;
    const entry = vendorState.stockById?.[blueprint.gearId] ?? null;
    const requirements = ensureRequirementArray(blueprint).map((req) => evaluateRequirement(state, req));
    const locked = requirements.some((req) => req && req.fulfilled === false);
    const quantity = entry ? Math.max(0, toSafeInteger(entry.quantity, { fallback: 0, min: 0 })) : 0;
    const soldOut = !locked && quantity <= 0;
    const restockDay = entry?.nextRestockDay ?? null;
    const daysUntilRestock = Number.isFinite(restockDay) ? Math.max(0, restockDay - currentDay) : null;

    const messages = [];
    if (locked) {
      requirements
        .filter((req) => req && req.fulfilled === false && req.message)
        .forEach((req) => messages.push(req.message));
    } else if (soldOut) {
      if (daysUntilRestock === 0) {
        messages.push('Restocking overnight.');
      } else if (Number.isFinite(daysUntilRestock)) {
        messages.push(`Restocks in ${daysUntilRestock} day${daysUntilRestock === 1 ? '' : 's'}.`);
      } else {
        messages.push('Sold out — restock schedule pending.');
      }
    } else {
      const stockLabel = quantity === entry?.maxStock
        ? `${quantity} in stock`
        : `${quantity} remaining`;
      messages.push(`In stock — ${stockLabel}.`);
      if (Number.isFinite(daysUntilRestock)) {
        messages.push(`Next refresh Day ${restockDay}.`);
      }
    }

    return {
      gearId: blueprint.gearId,
      vendorId: entry?.vendorId ?? blueprint.vendorId ?? vendorState.vendorId ?? DEFAULT_VENDOR_ID,
      label: config
        ? `${config.label} — ${config.description}`
        : blueprint.gearId,
      cost: config?.cost ?? 0,
      available: !locked && !soldOut,
      locked,
      soldOut,
      quantity,
      maxStock: entry?.maxStock ?? null,
      restockDay,
      daysUntilRestock,
      requirements,
      messages,
      vendorLabel: 'Grey Market Quartermaster',
    };
  });
};

const purchaseCrewGearFromVendor = (state, gearId) => {
  if (!gearId) {
    return { success: false, reason: 'invalid-gear' };
  }
  const blueprint = BLUEPRINT_BY_ID.get(gearId);
  if (!blueprint) {
    return { success: false, reason: 'unknown-gear' };
  }

  const { vendorState } = syncCrewGearVendorState(state);
  const currentDay = toSafeInteger(state?.day ?? vendorState.lastEvaluatedDay ?? 1, {
    fallback: 1,
    min: 1,
  });
  const entry = ensureVendorEntry(vendorState, blueprint, { day: currentDay });
  const requirements = ensureRequirementArray(blueprint).map((req) => evaluateRequirement(state, req));
  const locked = requirements.some((req) => req && req.fulfilled === false);
  if (locked) {
    return { success: false, reason: 'locked', requirements };
  }

  if (!entry || entry.quantity <= 0) {
    return {
      success: false,
      reason: 'sold-out',
      restockDay: entry?.nextRestockDay ?? null,
      requirements,
    };
  }

  entry.quantity -= 1;
  if (entry.quantity <= 0) {
    entry.quantity = 0;
    entry.nextRestockDay = currentDay + entry.restockIntervalDays;
  }
  vendorState.lastTransactionAt = Date.now();

  return {
    success: true,
    remaining: entry.quantity,
    nextRestockDay: entry.nextRestockDay,
    restockIntervalDays: entry.restockIntervalDays,
    requirements,
  };
};

const advanceCrewGearVendorsForNewDay = (state) => {
  const { vendorState, restocked } = syncCrewGearVendorState(state);
  return { vendorState, restocked };
};

export {
  advanceCrewGearVendorsForNewDay,
  createInitialCrewGearVendorState,
  getCrewGearVendorOptions,
  purchaseCrewGearFromVendor,
  sanitizeCrewGearVendorState,
};
