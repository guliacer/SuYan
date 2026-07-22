
const volumeStorageKey = "video-playback:volume";
const mutedStorageKey = "video-playback:muted";
const audioVolumeStorageKey = "audio-playback:volume";
const audioMutedStorageKey = "audio-playback:muted";

const defaultVolume = 1;
const defaultMuted = true;

export function getStoredVideoVolume(): number {
  if (typeof window === "undefined") {
    return defaultVolume;
  }

  const raw = window.localStorage.getItem(volumeStorageKey);
  const parsed = raw === null ? NaN : Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return defaultVolume;
  }

  return parsed;
}

export function getStoredVideoMuted(): boolean {
  if (typeof window === "undefined") {
    return defaultMuted;
  }

  const raw = window.localStorage.getItem(mutedStorageKey);

  if (raw === null) {
    return defaultMuted;
  }

  return raw === "true";
}

export function storeVideoVolume(volume: number): void {
  if (typeof window === "undefined" || !Number.isFinite(volume)) {
    return;
  }

  window.localStorage.setItem(volumeStorageKey, String(Math.min(1, Math.max(0, volume))));
}

export function storeVideoMuted(muted: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(mutedStorageKey, muted ? "true" : "false");
}

export function getStoredAudioVolume(): number {
  return readStoredVolume(audioVolumeStorageKey);
}

export function getStoredAudioMuted(): boolean {
  return readStoredMuted(audioMutedStorageKey);
}

export function storeAudioVolume(volume: number): void {
  storeVolume(audioVolumeStorageKey, volume);
}

export function storeAudioMuted(muted: boolean): void {
  storeMuted(audioMutedStorageKey, muted);
}

function readStoredVolume(storageKey: string): number {
  if (typeof window === "undefined") {
    return defaultVolume;
  }

  const raw = window.localStorage.getItem(storageKey);
  const parsed = raw === null ? NaN : Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return defaultVolume;
  }

  return parsed;
}

function readStoredMuted(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return defaultMuted;
  }

  const raw = window.localStorage.getItem(storageKey);

  return raw === null ? defaultMuted : raw === "true";
}

function storeVolume(storageKey: string, volume: number): void {
  if (typeof window === "undefined" || !Number.isFinite(volume)) {
    return;
  }

  window.localStorage.setItem(storageKey, String(Math.min(1, Math.max(0, volume))));
}

function storeMuted(storageKey: string, muted: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, muted ? "true" : "false");
}
