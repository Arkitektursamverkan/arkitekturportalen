import type { GraphNode } from "@/types/graph";

/**
 * Structural pages in the process hierarchy.
 *
 * The 2C8 model mixes two things under one node type: pages that group other
 * processes ("2.1 Medborgare", "3.2.1 Förvalta fastighet – förvaltning") and
 * the processes that describe actual work ("2.2.1 Uthyrning ordinarie"). Only
 * the latter can be supported by an application, so counting the grouping
 * pages as uncovered processes invents gaps that do not exist.
 *
 * A page is structural when either is true:
 *
 *   - `is_structure` is set — the manual mark in Processutforskaren, which is
 *     how a childless page like "0.1 Symbolförklaring" gets flagged;
 *   - it has at least one child. A node with children is a container by
 *     construction, and deriving this beats storing it: importing a new
 *     sub-process turns its parent into a container, and a stored flag would
 *     quietly go stale while this stays right.
 */
export function structuralProcessIds(nodes: GraphNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.is_structure) ids.add(node.id);
    if (node.type !== "Process") continue;
    const parentId = node.attributes?.parent_id;
    if (typeof parentId === "string" && parentId) ids.add(parentId);
  }
  return ids;
}

/** True for a node that only exists to group others. */
export function isStructural(node: GraphNode, structuralIds: Set<string>): boolean {
  return Boolean(node.is_structure) || structuralIds.has(node.id);
}


/**
 * True unless 2C8 says the process's current version is not approved.
 *
 * The sync also brings in processes mid-revision (an earlier version is still
 * the published one), so `workflow_state` is what tells them apart. Processes
 * that never came from 2C8 have no state and count as published.
 */
export function isPublishedProcess(node: GraphNode): boolean {
  const state = node.attributes?.workflow_state;
  return typeof state !== "string" || !state || state === "APPROVED";
}

/** True for a process that should be counted: real work, visible, published. */
export function isCountedProcess(node: GraphNode, structuralIds: Set<string>): boolean {
  return (
    node.type === "Process" &&
    !node.admin_hidden &&
    !isStructural(node, structuralIds) &&
    isPublishedProcess(node)
  );
}

/** The processes that describe real, published work — what a report should count. */
export function realProcesses(nodes: GraphNode[]): GraphNode[] {
  const structural = structuralProcessIds(nodes);
  return nodes.filter((n) => isCountedProcess(n, structural));
}
