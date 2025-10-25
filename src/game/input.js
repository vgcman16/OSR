const CAPTURE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'Space']);

export function bindGameInput(game, canvas) {
  if (!game) {
    return () => {};
  }

  const targetCanvas = canvas ?? game.canvas;
  const pointerTarget = targetCanvas ?? document.body;

  const handleKeyDown = (event) => {
    game.handleKeyDown(event.key);
    if (CAPTURE_KEYS.has(event.key)) {
      event.preventDefault();
    }
  };

  const handleKeyUp = (event) => {
    game.handleKeyUp(event.key);
    if (CAPTURE_KEYS.has(event.key)) {
      event.preventDefault();
    }
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'touch') {
      event.preventDefault();
    }
    game.handlePointerDown();
  };

  const handlePointerUp = () => {
    game.handlePointerUp();
  };

  const handlePointerMove = (event) => {
    const target = targetCanvas ?? pointerTarget;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || !target) {
      return;
    }

    const width = target.width ?? rect.width;
    const height = target.height ?? rect.height;
    if (!rect.width || !rect.height) {
      return;
    }
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    game.handlePointerMove(x, y);
  };

  const handleWindowBlur = () => {
    game.handlePointerUp();
    if (game.inputState?.keys?.clear) {
      game.inputState.keys.clear();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);

  pointerTarget.addEventListener('pointerdown', handlePointerDown);
  pointerTarget.addEventListener('pointerup', handlePointerUp);
  pointerTarget.addEventListener('pointerleave', handlePointerUp);
  pointerTarget.addEventListener('pointercancel', handlePointerUp);
  pointerTarget.addEventListener('pointermove', handlePointerMove);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleWindowBlur);

    pointerTarget.removeEventListener('pointerdown', handlePointerDown);
    pointerTarget.removeEventListener('pointerup', handlePointerUp);
    pointerTarget.removeEventListener('pointerleave', handlePointerUp);
    pointerTarget.removeEventListener('pointercancel', handlePointerUp);
    pointerTarget.removeEventListener('pointermove', handlePointerMove);
  };
}
