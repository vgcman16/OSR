class CityDistrict {
  constructor({ id, name, wealth = 1, security = 1, description = '' } = {}) {
    this.id = id ?? `district-${Math.random().toString(36).slice(2, 9)}`;
    this.name = name ?? 'Downtown';
    this.wealth = wealth;
    this.security = security;
    this.description = description;
    this.pointsOfInterest = [];
  }

  addPointOfInterest(poi) {
    this.pointsOfInterest.push(poi);
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
      new CityDistrict({ name: 'Downtown', wealth: 3, security: 4, description: 'Corporate high-rises and high-profile targets.' }),
      new CityDistrict({ name: 'Industrial Docks', wealth: 2, security: 2, description: 'Warehouses, shipping containers, and shady deals.' }),
      new CityDistrict({ name: 'Suburban Hills', wealth: 4, security: 3, description: 'Gated communities with prized collections.' }),
      new CityDistrict({ name: 'Old Town', wealth: 1, security: 1, description: 'Tight streets and low police presence.' }),
    ];
  }

  findDistrict(id) {
    return this.districts.find((district) => district.id === id) ?? null;
  }
}

export { CityMap, CityDistrict };
