export const windowResizeEdges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
export type WindowResizeEdge = typeof windowResizeEdges[number];
