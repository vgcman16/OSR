function getTimestamp() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function createFrameScheduler(callback) {
  let running = false;
  let rafId = null;
  let timeoutId = null;

  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis);

  const tick = (timestamp) => {
    if (!running) {
      return;
    }

    const time = Number.isFinite(timestamp) ? timestamp : getTimestamp();
    callback(time);
    scheduleNext();
  };

  const scheduleNext = () => {
    if (!running) {
      return;
    }

    if (requestFrame) {
      rafId = requestFrame(tick);
    } else {
      timeoutId = globalThis.setTimeout(() => tick(getTimestamp()), 16);
    }
  };

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      scheduleNext();
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      if (requestFrame && rafId !== null) {
        cancelFrame?.(rafId);
      }
      if (!requestFrame && timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      rafId = null;
      timeoutId = null;
    },
    getNow: getTimestamp,
  };
}
