class Vehicle {
  constructor({ id, model, topSpeed = 120, acceleration = 5, handling = 5, heat = 0 } = {}) {
    this.id = id ?? `vehicle-${Math.random().toString(36).slice(2, 9)}`;
    this.model = model ?? 'Compact Cruiser';
    this.topSpeed = topSpeed;
    this.acceleration = acceleration;
    this.handling = handling;
    this.heat = heat;
    this.condition = 1;
    this.isStolen = false;
  }

  markStolen() {
    this.isStolen = true;
  }

  applyWear(amount) {
    this.condition = Math.max(0, Math.min(1, this.condition - amount));
  }

  modifyHeat(amount) {
    this.heat = Math.max(0, this.heat + amount);
  }
}

export { Vehicle };
