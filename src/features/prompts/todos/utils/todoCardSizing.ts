export const TODO_CARD_DEFAULT_WIDTH = 360;
export const TODO_CARD_DEFAULT_HEIGHT = 680;
export const TODO_CARD_MIN_WIDTH = 260;
export const TODO_CARD_MAX_WIDTH = 760;
export const TODO_CARD_MIN_HEIGHT = 300;
export const TODO_CARD_MAX_HEIGHT = 900;

export function clampTodoCardWidth(value: number): number {
  return Math.min(TODO_CARD_MAX_WIDTH, Math.max(TODO_CARD_MIN_WIDTH, Math.round(value)));
}

export function clampTodoCardHeight(value: number): number {
  return Math.min(TODO_CARD_MAX_HEIGHT, Math.max(TODO_CARD_MIN_HEIGHT, Math.round(value)));
}

export function getTodoProjectCardGridClassName(projectCount: number): string {
  if (projectCount <= 1) return "grid grid-cols-1 justify-items-center gap-4";
  if (projectCount === 2) return "grid grid-cols-1 justify-items-center gap-4 min-[760px]:grid-cols-2";
  return "grid grid-cols-1 justify-items-center gap-4 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3";
}
