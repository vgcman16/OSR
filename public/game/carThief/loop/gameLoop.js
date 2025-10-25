class GameLoop {
  constructor({ update, render } = {}) {
    this.update = update ?? (() => {});
    this.render = render ?? (() => {});
    this.running = false;
    this.lastTimestamp = 0;
    this.frameHandle = null;
  }

  attachCanvas(canvas) {
    this.canvas = canvas;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTimestamp = performance.now();
    const step = (timestamp) => {
      if (!this.running) {
        return;
      }

      const delta = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      this.update(delta);
      this.render();
      this.frameHandle = window.requestAnimationFrame(step);
    };

    this.frameHandle = window.requestAnimationFrame(step);
  }

  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.frameHandle) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }
}

export { GameLoop };
