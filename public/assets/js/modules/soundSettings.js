const SOUND_SETTINGS_STORAGE_KEY = "wakfu_sound_settings_v1";
const SOUND_DB_NAME = "WakfuNexusSoundDB";
const SOUND_DB_VERSION = 1;
const SOUND_STORE_NAME = "customSounds";

const SOUND_CHANNELS = {
  tracker: "追踪区完成提示",
  tribe: "部族通知提示",
};

const SOUND_PRESETS = Object.freeze({
  default: {
    label: "默认完成音",
    type: "file",
    url: "./assets/sfx/tracking_completed.mp3",
    baseVolume: 0.3,
  },
  synth_chime: {
    label: "清脆单响",
    type: "synth",
    pattern: [
      { waveform: "sine", frequency: 880, durationMs: 260, gain: 0.42 },
      { waveform: "triangle", frequency: 1320, durationMs: 220, delayMs: 90, gain: 0.22 },
    ],
  },
  synth_double: {
    label: "双击提示",
    type: "synth",
    pattern: [
      { waveform: "triangle", frequency: 740, durationMs: 180, gain: 0.34 },
      { waveform: "triangle", frequency: 988, durationMs: 210, delayMs: 170, gain: 0.34 },
    ],
  },
  synth_soft: {
    label: "柔和钟声",
    type: "synth",
    pattern: [
      { waveform: "sine", frequency: 660, durationMs: 320, gain: 0.3 },
      { waveform: "sine", frequency: 990, durationMs: 280, delayMs: 110, gain: 0.16 },
    ],
  },
  custom: {
    label: "自定义音频",
    type: "custom",
  },
});

let soundSettingsState = loadSoundSettingsState();
let soundDbPromise = null;
let soundAudioContext = null;
let customSoundAssets = {
  tracker: null,
  tribe: null,
};

function getDefaultSoundSettings() {
  return {
    tracker: {
      preset: "default",
      volume: 20,
    },
    tribe: {
      preset: "default",
      volume: 20,
    },
  };
}

function normalizeChannelSoundSettings(channel, incoming = {}) {
  const defaults = getDefaultSoundSettings()[channel];
  const preset = Object.prototype.hasOwnProperty.call(SOUND_PRESETS, incoming.preset)
    ? incoming.preset
    : defaults.preset;
  const volume = Math.max(0, Math.min(100, Number(incoming.volume ?? defaults.volume) || 0));
  return {
    preset,
    volume,
  };
}

function loadSoundSettingsState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY) || "{}");
    return {
      tracker: normalizeChannelSoundSettings("tracker", parsed.tracker),
      tribe: normalizeChannelSoundSettings("tribe", parsed.tribe),
    };
  } catch (error) {
    return getDefaultSoundSettings();
  }
}

function saveSoundSettingsState() {
  localStorage.setItem(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify(soundSettingsState));
}

function openSoundDB() {
  if (!soundDbPromise) {
    soundDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(SOUND_DB_NAME, SOUND_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(SOUND_STORE_NAME)) {
          db.createObjectStore(SOUND_STORE_NAME);
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || event);
    });
  }

  return soundDbPromise;
}

async function getCustomSoundBlob(channel) {
  const db = await openSoundDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readonly");
    const store = tx.objectStore(SOUND_STORE_NAME);
    const request = store.get(channel);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveCustomSoundBlob(channel, payload) {
  const db = await openSoundDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readwrite");
    const store = tx.objectStore(SOUND_STORE_NAME);
    store.put(payload, channel);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteCustomSoundBlob(channel) {
  const db = await openSoundDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readwrite");
    const store = tx.objectStore(SOUND_STORE_NAME);
    store.delete(channel);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function revokeCustomSoundUrl(channel) {
  const asset = customSoundAssets[channel];
  if (asset?.url) {
    URL.revokeObjectURL(asset.url);
  }
}

async function loadCustomSoundAsset(channel) {
  const stored = await getCustomSoundBlob(channel);
  revokeCustomSoundUrl(channel);
  if (!stored?.blob) {
    customSoundAssets[channel] = null;
    return null;
  }

  const url = URL.createObjectURL(stored.blob);
  customSoundAssets[channel] = {
    name: stored.name || "自定义音频",
    type: stored.type || stored.blob.type || "audio/mpeg",
    url,
  };
  return customSoundAssets[channel];
}

async function loadAllCustomSoundAssets() {
  await Promise.all(Object.keys(SOUND_CHANNELS).map((channel) => loadCustomSoundAsset(channel)));
}

function getSoundChannelConfig(channel) {
  if (!SOUND_CHANNELS[channel]) return normalizeChannelSoundSettings("tracker", {});
  return soundSettingsState[channel];
}

function getPresetOptionsMarkup(selectedPreset) {
  return Object.entries(SOUND_PRESETS)
    .map(
      ([presetKey, preset]) =>
        `<option value="${presetKey}" ${
          presetKey === selectedPreset ? "selected" : ""
        }>${preset.label}</option>`
    )
    .join("");
}

function updateSoundVolumeLabel(channel) {
  const slider = document.getElementById(`sound-volume-${channel}`);
  const label = document.getElementById(`sound-volume-value-${channel}`);
  if (!slider || !label) return;
  label.textContent = `${Number(slider.value || 0)}%`;
}

function renderSoundSettingsUI() {
  Object.keys(SOUND_CHANNELS).forEach((channel) => {
    const config = getSoundChannelConfig(channel);
    const presetSelect = document.getElementById(`sound-preset-${channel}`);
    const volumeSlider = document.getElementById(`sound-volume-${channel}`);
    const customLabel = document.getElementById(`sound-custom-name-${channel}`);

    if (presetSelect) {
      presetSelect.innerHTML = getPresetOptionsMarkup(config.preset);
      presetSelect.value = config.preset;
    }

    if (volumeSlider) {
      volumeSlider.value = String(config.volume);
      updateSoundVolumeLabel(channel);
    }

    if (customLabel) {
      customLabel.textContent = customSoundAssets[channel]?.name || "未导入自定义音频";
    }
  });
}

function ensureSoundAudioContext() {
  if (soundAudioContext) return soundAudioContext;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  soundAudioContext = new Context();
  return soundAudioContext;
}

async function playSynthPreset(preset, volume) {
  const context = ensureSoundAudioContext();
  if (!context) return false;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch (error) {}
  }

  const now = context.currentTime;
  (preset.pattern || []).forEach((note) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startAt = now + (Number(note.delayMs || 0) / 1000);
    const duration = Number(note.durationMs || 120) / 1000;
    const finalGain = Math.max(0, Math.min(1, volume)) * Number(note.gain || 0.15);

    oscillator.type = note.waveform || "sine";
    oscillator.frequency.setValueAtTime(Number(note.frequency || 880), startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, finalGain), startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  });

  return true;
}

async function playAudioSource(url, volume) {
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  await audio.play();
  return true;
}

async function playNotificationSound(channel) {
  const config = getSoundChannelConfig(channel);
  const preset = SOUND_PRESETS[config.preset] || SOUND_PRESETS.default;
  const volume = Math.max(0, Math.min(1, Number(config.volume || 0) / 100));

  if (volume <= 0) return false;

  try {
    if (preset.type === "synth") {
      return await playSynthPreset(preset, volume);
    }

    if (preset.type === "custom") {
      const asset = customSoundAssets[channel];
      if (!asset?.url) return false;
      return await playAudioSource(asset.url, volume);
    }

    return await playAudioSource(
      preset.url,
      volume * Math.max(0, Math.min(1, Number(preset.baseVolume ?? 1)))
    );
  } catch (error) {
    console.warn(`[Sound] Failed to play ${channel} sound:`, error);
    return false;
  }
}

async function previewNotificationSound(channel) {
  const config = getSoundChannelConfig(channel);
  if (config.preset === "custom" && !customSoundAssets[channel]?.url) {
    alert("这个分类还没有导入自定义音频。");
    return false;
  }
  return await playNotificationSound(channel);
}

function updateSoundPreset(channel, preset) {
  if (!SOUND_CHANNELS[channel]) return;
  soundSettingsState[channel] = normalizeChannelSoundSettings(channel, {
    ...soundSettingsState[channel],
    preset,
  });
  saveSoundSettingsState();
  renderSoundSettingsUI();
}

function updateSoundVolume(channel, value) {
  if (!SOUND_CHANNELS[channel]) return;
  soundSettingsState[channel] = normalizeChannelSoundSettings(channel, {
    ...soundSettingsState[channel],
    volume: value,
  });
  saveSoundSettingsState();
  updateSoundVolumeLabel(channel);
}

async function importCustomSound(channel, input) {
  const file = input?.files?.[0];
  if (!file || !SOUND_CHANNELS[channel]) return;

  if (!String(file.type || "").startsWith("audio/")) {
    alert("请选择音频文件。");
    input.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert("自定义音频请尽量控制在 2MB 以内。");
    input.value = "";
    return;
  }

  try {
    const blob = file.slice(0, file.size, file.type || "audio/mpeg");
    await saveCustomSoundBlob(channel, {
      name: file.name,
      type: file.type || "audio/mpeg",
      blob,
    });
    await loadCustomSoundAsset(channel);
    soundSettingsState[channel] = normalizeChannelSoundSettings(channel, {
      ...soundSettingsState[channel],
      preset: "custom",
    });
    saveSoundSettingsState();
    renderSoundSettingsUI();
  } catch (error) {
    console.error("[Sound] Import custom sound failed:", error);
    alert("导入自定义音频失败，请重试。");
  } finally {
    input.value = "";
  }
}

async function clearCustomSound(channel) {
  if (!SOUND_CHANNELS[channel]) return;
  try {
    await deleteCustomSoundBlob(channel);
    revokeCustomSoundUrl(channel);
    customSoundAssets[channel] = null;
    if (soundSettingsState[channel].preset === "custom") {
      soundSettingsState[channel] = normalizeChannelSoundSettings(channel, {
        ...soundSettingsState[channel],
        preset: "default",
      });
      saveSoundSettingsState();
    }
    renderSoundSettingsUI();
  } catch (error) {
    console.error("[Sound] Clear custom sound failed:", error);
  }
}

async function resetSoundChannel(channel) {
  if (!SOUND_CHANNELS[channel]) return;
  await clearCustomSound(channel);
  soundSettingsState[channel] = getDefaultSoundSettings()[channel];
  saveSoundSettingsState();
  renderSoundSettingsUI();
}

async function resetAllSoundSettings() {
  for (const channel of Object.keys(SOUND_CHANNELS)) {
    await deleteCustomSoundBlob(channel).catch(() => {});
    revokeCustomSoundUrl(channel);
    customSoundAssets[channel] = null;
  }
  soundSettingsState = getDefaultSoundSettings();
  saveSoundSettingsState();
  renderSoundSettingsUI();
}

function openSoundSettingsModal() {
  const modal = document.getElementById("sound-settings-modal");
  if (!modal) return;
  renderSoundSettingsUI();
  modal.style.display = "flex";
}

function closeSoundSettingsModal() {
  const modal = document.getElementById("sound-settings-modal");
  if (modal) modal.style.display = "none";
}

async function initSoundSettings() {
  soundSettingsState = loadSoundSettingsState();
  try {
    await loadAllCustomSoundAssets();
  } catch (error) {
    console.warn("[Sound] Failed to load custom sound assets:", error);
  }
  renderSoundSettingsUI();
}

window.playNotificationSound = playNotificationSound;
window.previewNotificationSound = previewNotificationSound;
window.updateSoundPreset = updateSoundPreset;
window.updateSoundVolume = updateSoundVolume;
window.importCustomSound = importCustomSound;
window.clearCustomSound = clearCustomSound;
window.resetSoundChannel = resetSoundChannel;
window.resetAllSoundSettings = resetAllSoundSettings;
window.openSoundSettingsModal = openSoundSettingsModal;
window.closeSoundSettingsModal = closeSoundSettingsModal;
window.initSoundSettings = initSoundSettings;
