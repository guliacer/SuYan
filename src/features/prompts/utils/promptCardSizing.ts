export const PROMPT_CARD_DEFAULT_WIDTH = 300;
export const PROMPT_CARD_DEFAULT_HEIGHT = 300;
export const PROMPT_CARD_MIN_WIDTH = 220;
export const PROMPT_CARD_MAX_WIDTH = 640;
export const PROMPT_CARD_MIN_HEIGHT = 260;
export const PROMPT_CARD_MAX_HEIGHT = 720;

export function clampPromptCardWidth(value: number): number {
  return Math.min(PROMPT_CARD_MAX_WIDTH, Math.max(PROMPT_CARD_MIN_WIDTH, Math.round(value)));
}

export function clampPromptCardHeight(value: number): number {
  return Math.min(PROMPT_CARD_MAX_HEIGHT, Math.max(PROMPT_CARD_MIN_HEIGHT, Math.round(value)));
}
