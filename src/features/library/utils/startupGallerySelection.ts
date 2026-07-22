export const startupGalleryDisplayCount = 6;

export function selectRandomStartupGalleryImages<T>(
  images: readonly T[],
  count = startupGalleryDisplayCount,
  random: () => number = Math.random,
): T[] {
  if (count <= 0 || images.length === 0) {
    return [];
  }

  const selected: T[] = [];

  while (selected.length < count) {
    const shuffled = shuffle(images, random);
    const remainingCount = count - selected.length;
    selected.push(...shuffled.slice(0, remainingCount));
  }

  return selected;
}

function shuffle<T>(images: readonly T[], random: () => number): T[] {
  const shuffled = [...images];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(clampRandom(random()) * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(value, 0.9999999999999999);
}
