class CityDistrict {
  constructor({ id, name, wealth = 1, security = 1, description = '', pointsOfInterest = [] } = {}) {
    this.id = id ?? `district-${Math.random().toString(36).slice(2, 9)}`;
    this.name = name ?? 'Downtown';
    this.wealth = wealth;
    this.security = security;
    this.description = description;
    this.pointsOfInterest = Array.isArray(pointsOfInterest)
      ? pointsOfInterest.map((poi) => ({ ...poi }))
      : [];
  }

  addPointOfInterest(poi) {
    if (!poi) {
      return;
    }

    this.pointsOfInterest.push({ ...poi });
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
