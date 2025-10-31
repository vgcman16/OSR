const CLIP_SOURCES = {
  missionStart: 'mission-start.mp3',
  eventPrompt: 'mission-event.mp3',
  missionSuccess: 'mission-success.mp3',
  missionFailure: 'mission-failure.mp3',
  missionStalemate: 'mission-stalemate.mp3',
  safehouseAlert: 'safehouse-alert.mp3',
  crackdownShift: 'crackdown-shift.mp3',
  missionUpdate: 'mission-update.mp3',
};

const normalizeBasePath = (basePath) => {
  if (typeof basePath !== 'string' || !basePath) {
    return 'audio/';
  }

  return basePath.endsWith('/') ? basePath : `${basePath}/`;
};

const createNoopSoundboard = ({ muted = false } = {}) => {
  let mutedState = Boolean(muted);

  return {
    preloadAll: () => {},
    isMuted: () => mutedState,
    setMuted: (value) => {
      mutedState = Boolean(value);
      return mutedState;
    },
    playMissionStart: () => false,
    playEventPrompt: () => false,
    playMissionOutcome: () => false,
    playSafehouseAlert: () => false,
    playCrackdownShift: () => false,
    playMissionUpdate: () => false,
  };
};

const createSoundboard = ({ basePath = 'audio/', muted = false } = {}) => {
  if (typeof Audio !== 'function') {
    return createNoopSoundboard({ muted });
  }

  let mutedState = Boolean(muted);
  const resolvedBasePath = normalizeBasePath(basePath);
  const clipCache = new Map();

  const applyMuteState = (audio) => {
    if (!audio) {
      return;
    }

    audio.muted = mutedState;
    if (mutedState) {
      audio.pause();
    }
  };

  const loadClip = (key) => {
    if (clipCache.has(key)) {
      return clipCache.get(key);
    }

    const fileName = CLIP_SOURCES[key];
    if (!fileName) {
      return null;
    }

    const source = `${resolvedBasePath}${fileName}`;
    const audio = new Audio(source);
    audio.preload = 'auto';
    applyMuteState(audio);

    try {
      audio.load();
    } catch (error) {
      console.warn(`Failed to preload audio clip: ${source}`, error);
    }

    clipCache.set(key, audio);
    return audio;
  };

  const playClip = (key) => {
    if (mutedState) {
      return false;
    }

    const clip = loadClip(key);
    if (!clip) {
      return false;
    }

    try {
      clip.currentTime = 0;
      const playback = clip.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {});
      }
      return true;
    } catch (error) {
      console.warn(`Failed to play audio clip: ${key}`, error);
      return false;
    }
  };

  const preloadAll = () => {
    Object.keys(CLIP_SOURCES).forEach((key) => {
      loadClip(key);
    });
  };

  const setMuted = (value) => {
    mutedState = Boolean(value);
    clipCache.forEach((clip) => {
      applyMuteState(clip);
    });
    return mutedState;
  };

  const isMuted = () => mutedState;

  const playMissionOutcome = (result) => {
    const normalized = typeof result === 'string' ? result.trim().toLowerCase() : '';
    let clipKey = 'missionStalemate';

    if (normalized === 'success' || normalized === 'victory') {
      clipKey = 'missionSuccess';
    } else if (normalized === 'failure' || normalized === 'defeat') {
      clipKey = 'missionFailure';
    }

    return playClip(clipKey);
  };

  return {
    preloadAll,
    isMuted,
    setMuted,
    playMissionStart: () => playClip('missionStart'),
    playEventPrompt: () => playClip('eventPrompt'),
    playMissionOutcome,
    playSafehouseAlert: () => playClip('safehouseAlert'),
    playCrackdownShift: () => playClip('crackdownShift'),
    playMissionUpdate: () => playClip('missionUpdate'),
  };
};

export { createSoundboard };
