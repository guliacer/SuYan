
const openStorageKey = "library-sidebar:open";
const widthStorageKey = "library-sidebar:width";

const defaultOpen = true;

export function getStoredSidebarOpen(): boolean {
  if (typeof window === "undefined") {
    return defaultOpen;
  }

  try {
    const raw = window.localStorage.getItem(openStorageKey);

    if (raw === null) {
      return defaultOpen;
    }

    return raw === "true";
  } catch {
    return defaultOpen;
  }
}

export function storeSidebarOpen(isOpen: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(openStorageKey, isOpen ? "true" : "false");
  } catch {
  }
}

export function getStoredSidebarWidth(defaultWidth: number): number {
  if (typeof window === "undefined") {
    return defaultWidth;
  }

  try {
    const raw = window.localStorage.getItem(widthStorageKey);
    const parsed = raw === null ? NaN : Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return defaultWidth;
    }

    return parsed;
  } catch {
    return defaultWidth;
  }
}

export function storeSidebarWidth(width: number): void {
  if (typeof window === "undefined" || !Number.isFinite(width) || width <= 0) {
    return;
  }

  try {
    window.localStorage.setItem(widthStorageKey, String(Math.round(width)));
  } catch {
  }
}
