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

const clampVolume = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, numeric));
};

const createNoopSoundboard = ({ muted = false, volume = 1 } = {}) => {
  let mutedState = Boolean(muted);
  let volumeState = clampVolume(volume, 1);

  return {
    preloadAll: () => {},
    isMuted: () => mutedState,
    setMuted: (value) => {
      mutedState = Boolean(value);
      return mutedState;
    },
    getVolume: () => volumeState,
    setVolume: (value) => {
      volumeState = clampVolume(value, volumeState);
      return volumeState;
    },
    playMissionStart: () => false,
    playEventPrompt: () => false,
    playMissionOutcome: () => false,
    playSafehouseAlert: () => false,
    playCrackdownShift: () => false,
    playMissionUpdate: () => false,
  };
};

const createSoundboard = ({ basePath = 'audio/', muted = false, volume = 1 } = {}) => {
  if (typeof Audio !== 'function') {
    return createNoopSoundboard({ muted, volume });
  }

  let mutedState = Boolean(muted);
  let volumeState = clampVolume(volume, 1);
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

  const applyVolumeState = (audio) => {
    if (!audio) {
      return;
    }

    audio.volume = volumeState;
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
    applyVolumeState(audio);

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
      applyVolumeState(clip);
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

  const setVolume = (value) => {
    const nextVolume = clampVolume(value, volumeState);
    if (nextVolume === volumeState) {
      return volumeState;
    }

    volumeState = nextVolume;
    clipCache.forEach((clip) => {
      applyVolumeState(clip);
    });
    return volumeState;
  };

  const getVolume = () => volumeState;

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
    getVolume,
    setVolume,
    playMissionStart: () => playClip('missionStart'),
    playEventPrompt: () => playClip('eventPrompt'),
    playMissionOutcome,
    playSafehouseAlert: () => playClip('safehouseAlert'),
    playCrackdownShift: () => playClip('crackdownShift'),
    playMissionUpdate: () => playClip('missionUpdate'),
  };
};

export { createSoundboard };
