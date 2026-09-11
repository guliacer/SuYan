/** Electron's system backdrop requires Windows 11 22H2 (build 22621). */
export function supportsWindowAcrylic(platform: string, release: string): boolean {
  const [major, , build] = release.split(".").map(Number);
  return platform === "win32" && (major > 10 || (major === 10 && build >= 22621));
}
