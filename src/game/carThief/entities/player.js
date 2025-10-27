class Player {
  constructor({ name, notoriety = 0, skills = {}, inventory = [], safehouseId = null } = {}) {
    this.name = name ?? 'Unknown Driver';
    this.notoriety = notoriety;
    this.skills = {
      driving: 1,
      stealth: 1,
      engineering: 1,
      charisma: 1,
      ...skills,
    };
    this.inventory = [...inventory];
    this.currentVehicleId = null;
    this.safehouseId = safehouseId;
  }

  assignVehicle(vehicleId) {
    this.currentVehicleId = vehicleId;
  }

  assignSafehouse(safehouseId) {
    this.safehouseId = safehouseId;
  }

  addInventoryItem(item) {
    this.inventory.push(item);
  }

  improveSkill(skill, amount = 1) {
    this.skills[skill] = (this.skills[skill] ?? 0) + amount;
  }
}

export { Player };
