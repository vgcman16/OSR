const generateId = () => `crew-${Math.random().toString(36).slice(2, 9)}`;

class CrewMember {
  constructor({ id, name, specialty, upkeep = 0, loyalty = 1 } = {}) {
    this.id = id ?? generateId();
    this.name = name ?? 'Crewmate';
    this.specialty = specialty ?? 'wheelman';
    this.upkeep = upkeep;
    this.loyalty = loyalty;
    this.status = 'idle';
  }

  setStatus(status) {
    this.status = status;
  }

  adjustLoyalty(amount) {
    this.loyalty = Math.max(0, Math.min(5, this.loyalty + amount));
  }
}

export { CrewMember };
