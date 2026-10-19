import React, { useCallback, useMemo, useState } from "react";
import { Chip, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { NODE_COLORS, NODE_BORDER_COLORS } from "@/config/graphConfig";
import type { GraphData, NodeType } from "@/types/graph";

/** Domain order in the filter bar — matches the legend. */
const TYPE_ORDER: NodeType[] = [
  "Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent", "Server", "ServerService",
];

export interface DomainFilter {
  /** Domains actually present in the graph, in legend order. */
  present: NodeType[];
  hidden: Set<NodeType>;
  toggle: (type: NodeType) => void;
  showAll: () => void;
  /** The graph with hidden domains (and their edges) removed. */
  filteredGraph: GraphData | undefined;
}

/**
 * Domain (node type) filter for a connection graph.
 *
 * All domains start checked; unchecking one drops those nodes and any edge
 * touching them. The node the view is anchored on always stays visible, so
 * hiding its own domain never empties the canvas.
 */
export function useDomainFilter(
  graph: GraphData | undefined,
  anchorNodeId?: string,
): DomainFilter {
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());

  const present = useMemo(() => {
    const seen = new Set((graph?.nodes ?? []).map((n) => n.type));
    return TYPE_ORDER.filter((t) => seen.has(t));
  }, [graph]);

  const filteredGraph = useMemo<GraphData | undefined>(() => {
    if (!graph || hidden.size === 0) return graph;
    const visible = graph.nodes.filter((n) => n.id === anchorNodeId || !hidden.has(n.type));
    let ids = new Set(visible.map((n) => n.id));
    let edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

    // Nodes that only hang off a hidden domain (a tech component reached via an
    // application, say) would be left floating — drop everything the anchor can
    // no longer reach through the visible domains.
    if (anchorNodeId && ids.has(anchorNodeId)) {
      const neighbours = new Map<string, string[]>();
      const link = (from: string, to: string) => {
        const list = neighbours.get(from);
        if (list) list.push(to);
        else neighbours.set(from, [to]);
      };
      for (const e of edges) {
        link(e.source, e.target);
        link(e.target, e.source);
      }
      const reachable = new Set<string>([anchorNodeId]);
      const queue = [anchorNodeId];
      while (queue.length) {
        for (const next of neighbours.get(queue.pop()!) ?? []) {
          if (!reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }
      ids = reachable;
      edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }

    return { nodes: visible.filter((n) => ids.has(n.id)), edges };
  }, [graph, hidden, anchorNodeId]);

  const toggle = useCallback((type: NodeType) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setHidden(new Set()), []);

  return { present, hidden, toggle, showAll, filteredGraph };
}

interface Props {
  filter: DomainFilter;
}

const DomainFilterBar: React.FC<Props> = ({ filter }) => {
  const { t } = useTranslation();
  const { present, hidden, toggle, showAll } = filter;

  // Nothing to filter when the graph only spans a single domain.
  if (present.length < 2) return null;

  return (
    <Paper
      elevation={2}
      sx={{
        position: "absolute", top: 8, left: 8, zIndex: 10,
        px: 1.25, py: 0.75, maxWidth: "calc(100% - 120px)",
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mr: 0.25 }}>
          {t("graph.domains")}
        </Typography>
        {present.map((type) => {
          const isHidden = hidden.has(type);
          return (
            <Chip
              key={type}
              size="small"
              label={t(`nodeTypes.${type}`)}
              onClick={() => toggle(type)}
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${NODE_BORDER_COLORS[type]}`,
                bgcolor: isHidden ? "transparent" : NODE_COLORS[type],
                color: isHidden ? "text.secondary" : "#fff",
                opacity: isHidden ? 0.6 : 1,
                "&:hover": { bgcolor: isHidden ? "action.hover" : NODE_COLORS[type], opacity: 1 },
              }}
            />
          );
        })}
        {hidden.size > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={t("graph.showAllDomains")}
            onClick={showAll}
            sx={{ height: 22, fontSize: 11, cursor: "pointer" }}
          />
        )}
      </Stack>
    </Paper>
  );
};

export default DomainFilterBar;
