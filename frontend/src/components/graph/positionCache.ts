/**
 * Persistent cache for Cytoscape node positions.
 *
 * Keyed by a graph identifier (e.g. "landscape", "connections", "process-e2e:<id>").
 * Persisted to localStorage so positions survive page reloads.
 */
import type { Core } from "cytoscape";

type PositionMap = Record<string, { x: number; y: number }>;

const STORAGE_PREFIX = "ea_graph_positions:";

/** Save current node positions from a Cytoscape instance.
 *  Merges into whatever is already stored, so nodes hidden by the domain
 *  filter keep their positions and land back where they were when re-shown. */
export function savePositions(key: string, cy: Core) {
  const positions: PositionMap = { ...(getPositions(key) ?? {}) };
  cy.nodes().forEach((node) => {
    const pos = node.position();
    positions[node.id()] = { x: pos.x, y: pos.y };
  });
  if (Object.keys(positions).length > 0) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(positions));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }
}

/** Retrieve saved positions for a graph key (or undefined if none). */
export function getPositions(key: string): PositionMap | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as PositionMap;
  } catch {
    return undefined;
  }
}

/** Clear saved positions for a graph key. */
export function clearPositions(key: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}
