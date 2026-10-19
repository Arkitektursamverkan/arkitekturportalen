import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@/types/graph";

interface GraphState {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  /** The "anchor" node — the one chosen from the sidebar list. When a connected
   *  node is clicked in the graph canvas, anchorNodeId stays fixed so edge-note
   *  filtering can show only the edge between the viewed node and this anchor. */
  anchorNodeId: string | null;
  selectNode: (node: GraphNode | null) => void;
  selectEdge: (edge: GraphEdge | null) => void;
  setAnchorNodeId: (id: string | null) => void;
  clearSelection: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedNode: null,
  selectedEdge: null,
  anchorNodeId: null,
  selectNode: (node) => set({ selectedNode: node, selectedEdge: null }),
  selectEdge: (edge) => set({ selectedEdge: edge, selectedNode: null }),
  setAnchorNodeId: (id) => set({ anchorNodeId: id }),
  clearSelection: () => set({ selectedNode: null, selectedEdge: null, anchorNodeId: null }),
}));
