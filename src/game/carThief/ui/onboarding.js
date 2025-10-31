const DEFAULT_TOUR_STEPS = (
  missionControls = {},
) => [
  {
    id: 'mission-select',
    selector: '#mission-select',
    resolveTarget: () => missionControls.select || document.querySelector('#mission-select'),
    title: 'Select a contract',
    description:
      'Choose a mission from the contract list to load its briefing, rewards, and heat outlook.',
  },
  {
    id: 'mission-crew-list',
    selector: '#mission-crew-list',
    resolveTarget: () => missionControls.crewList || document.querySelector('#mission-crew-list'),
    title: 'Assign the crew',
    description:
      'Slot specialists into the crew roster to boost success odds and unlock mission perks.',
  },
  {
    id: 'mission-operations',
    selector: '.mission-operations',
    resolveTarget: () => missionControls.operationsSection || document.querySelector('.mission-operations'),
    title: 'Operations dashboard',
    description:
      'Keep cashflow, storage, and fatigue stable here so every contract launches with resources to spare.',
  },
  {
    id: 'mission-recon',
    selector: '.mission-recon',
    resolveTarget: () =>
      missionControls.reconList?.closest('.mission-recon')
        || missionControls.reconStatus?.closest('.mission-recon')
        || document.querySelector('.mission-recon'),
    title: 'Field recon',
    description:
      'Use Field Recon to raise district influence before a heist and uncover perks that swing the odds.',
  },
  {
    id: 'mission-training',
    selector: '.mission-training',
    resolveTarget: () =>
      missionControls.trainingStatus?.closest('.mission-training')
        || missionControls.trainingCrewSelect?.closest('.mission-training')
        || document.querySelector('.mission-training'),
    title: 'Crew training',
    description:
      'Invest in Crew Training to deepen loyalty, specialties, and recovery so operators stay mission-ready.',
  },
  {
    id: 'mission-heat',
    selector: '.mission-heat',
    resolveTarget: () =>
      missionControls.heatActionContainer?.closest('.mission-heat')
        || missionControls.heatStatus?.closest('.mission-heat')
        || document.querySelector('.mission-heat'),
    title: 'Heat management',
    description:
      'Trigger Heat Management actions when pressure spikes to keep crackdowns from locking down your crews.',
  },
  {
    id: 'mission-safehouse',
    selector: '.mission-safehouse',
    resolveTarget: () =>
      missionControls.safehouseSection || document.querySelector('.mission-safehouse'),
    title: 'Safehouse operations',
    description:
      'Review safehouse perks, fund upgrades, and react to alerts that shape long-term strategy.',
  },
  {
    id: 'mission-events',
    selector: '.mission-events',
    resolveTarget: () => missionControls.eventPrompt?.closest('.mission-events')
      || document.querySelector('.mission-events'),
    title: 'Dynamic mission events',
    description:
      'Monitor complications and opportunities as they unfold, then decide how the crew responds.',
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const createOverlayElements = () => {
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.tabIndex = -1;
  overlay.hidden = true;

  const highlight = document.createElement('div');
  highlight.className = 'tutorial-highlight';
  overlay.appendChild(highlight);

  const tooltip = document.createElement('div');
  tooltip.className = 'tutorial-tooltip';
  tooltip.setAttribute('role', 'document');

  const title = document.createElement('h2');
  title.className = 'tutorial-tooltip__title';
  tooltip.appendChild(title);

  const description = document.createElement('p');
  description.className = 'tutorial-tooltip__body';
  tooltip.appendChild(description);

  const actions = document.createElement('div');
  actions.className = 'tutorial-tooltip__actions';

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'tutorial-tooltip__button tutorial-tooltip__button--muted';
  skipButton.textContent = 'Skip';
  skipButton.setAttribute('aria-label', 'Skip tutorial');
  actions.appendChild(skipButton);

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'tutorial-tooltip__button tutorial-tooltip__button--primary';
  nextButton.textContent = 'Next';
  nextButton.setAttribute('aria-label', 'Next tutorial hint');
  actions.appendChild(nextButton);

  tooltip.appendChild(actions);
  overlay.appendChild(tooltip);

  return { overlay, highlight, tooltip, title, description, actions, skipButton, nextButton };
};

const createOnboardingTour = ({ missionControls = {}, serializer } = {}) => {
  if (typeof document === 'undefined') {
    return {
      start: () => false,
      skip: () => false,
      isCompleted: () => false,
    };
  }

  const steps = DEFAULT_TOUR_STEPS(missionControls);
  const elements = createOverlayElements();
  const { overlay, highlight, tooltip, title, description, skipButton, nextButton } = elements;

  let state = serializer?.load?.() ?? null;
  let completed = Boolean(state?.completed);
  let active = false;
  let currentIndex = -1;
  let currentTarget = null;

  const updateTooltipPosition = () => {
    if (!currentTarget) {
      tooltip.style.top = 'auto';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      tooltip.style.bottom = 'auto';
      return;
    }

    const rect = currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    const preferredTop = rect.bottom + 16;
    const fitsBelow = preferredTop + tooltip.offsetHeight <= viewportHeight - 16;
    const top = fitsBelow ? preferredTop : clamp(rect.top - tooltip.offsetHeight - 16, 16, viewportHeight - tooltip.offsetHeight - 16);
    const left = clamp(rect.left + rect.width / 2 - tooltip.offsetWidth / 2, 16, viewportWidth - tooltip.offsetWidth - 16);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.transform = 'translate(0, 0)';
  };

  const updateHighlightPosition = () => {
    if (!currentTarget) {
      highlight.style.opacity = '0';
      return;
    }

    const rect = currentTarget.getBoundingClientRect();
    highlight.style.opacity = '1';
    highlight.style.width = `${Math.max(rect.width, 1)}px`;
    highlight.style.height = `${Math.max(rect.height, 1)}px`;
    highlight.style.top = `${Math.max(rect.top, 0)}px`;
    highlight.style.left = `${Math.max(rect.left, 0)}px`;
  };

  const updatePositions = () => {
    updateHighlightPosition();
    updateTooltipPosition();
  };

  const detach = () => {
    window.removeEventListener('resize', updatePositions);
    window.removeEventListener('scroll', updatePositions, true);
    document.removeEventListener('keydown', handleKeydown);
  };

  const teardown = () => {
    detach();
    active = false;
    currentIndex = -1;
    currentTarget = null;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    highlight.style.opacity = '0';
  };

  const persistCompletion = () => {
    completed = true;
    const payload = {
      version: 1,
      completed: true,
      completedAt: Date.now(),
    };
    serializer?.save?.(payload);
  };

  const focusOverlay = () => {
    try {
      overlay.focus({ preventScroll: true });
    } catch (error) {
      overlay.focus();
    }
  };

  const showStep = (index) => {
    const step = steps[index];
    if (!step) {
      return false;
    }

    const target = step.resolveTarget?.() || (step.selector ? document.querySelector(step.selector) : null);
    if (!target) {
      return false;
    }

    currentIndex = index;
    currentTarget = target;
    title.textContent = step.title;
    description.textContent = step.description;
    nextButton.textContent = index >= steps.length - 1 ? 'Finish' : 'Next';

    const scrollOptions = { block: 'center', inline: 'center', behavior: 'smooth' };
    const scrollByWithFallback = (offset) => {
      if (!offset) {
        return;
      }

      try {
        window.scrollBy({ top: offset, behavior: 'smooth' });
      } catch (error) {
        window.scrollBy(0, offset);
      }
    };

    const alignTargetWithinViewport = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const topPadding = 24;
      const bottomPadding = 24;
      const rect = target.getBoundingClientRect();

      const overflowTop = topPadding - rect.top;
      if (overflowTop > 0) {
        scrollByWithFallback(-overflowTop);
        return true;
      }

      const overflowBottom = rect.bottom - (viewportHeight - bottomPadding);
      if (overflowBottom > 0) {
        scrollByWithFallback(overflowBottom);
        return true;
      }

      return false;
    };

    if (typeof target.scrollIntoView === 'function') {
      try {
        target.scrollIntoView(scrollOptions);
      } catch (error) {
        target.scrollIntoView({ block: 'center', inline: 'center' });
      }
    }

    updatePositions();

    const runAlignment = () => {
      const adjusted = alignTargetWithinViewport();
      updatePositions();

      if (adjusted) {
        const scheduleTimeout =
          (typeof window !== 'undefined' && typeof window.setTimeout === 'function'
            ? window.setTimeout
            : typeof setTimeout === 'function'
              ? setTimeout
              : null);

        if (scheduleTimeout) {
          scheduleTimeout(() => {
            updatePositions();
          }, 280);
        } else {
          updatePositions();
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(runAlignment);
    } else {
      const scheduleTimeout =
        (typeof window !== 'undefined' && typeof window.setTimeout === 'function'
          ? window.setTimeout
          : typeof setTimeout === 'function'
            ? setTimeout
            : null);

      if (scheduleTimeout) {
        scheduleTimeout(runAlignment, 16);
      } else {
        runAlignment();
      }
    }

    return true;
  };

  const advanceStep = () => {
    let nextIndex = currentIndex + 1;
    while (nextIndex < steps.length) {
      if (showStep(nextIndex)) {
        return;
      }
      nextIndex += 1;
    }

    persistCompletion();
    teardown();
  };

  const startStepSequence = () => {
    let firstIndex = 0;
    while (firstIndex < steps.length && !showStep(firstIndex)) {
      firstIndex += 1;
    }

    if (firstIndex >= steps.length) {
      teardown();
      return false;
    }

    return true;
  };

  const handleKeydown = (event) => {
    if (!active) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      advanceStep();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      advanceStep();
    }
  };

  const skip = () => {
    teardown();
    return false;
  };

  const start = ({ force = false } = {}) => {
    if (active) {
      return true;
    }

    if (!force && completed) {
      return false;
    }

    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    active = true;
    focusOverlay();

    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);
    document.addEventListener('keydown', handleKeydown);

    const sequenceStarted = startStepSequence();
    if (!sequenceStarted) {
      teardown();
      return false;
    }

    return true;
  };

  skipButton.addEventListener('click', () => {
    skip();
  });

  nextButton.addEventListener('click', () => {
    advanceStep();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      skip();
    }
  });

  return {
    start,
    skip,
    isCompleted: () => completed,
  };
};

export { createOnboardingTour };
