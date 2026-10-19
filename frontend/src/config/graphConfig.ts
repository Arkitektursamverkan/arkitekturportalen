import type { NodeType, EdgeType, IntegrationDirection } from "@/types/graph";

// ── Allowed connections ───────────────────────────────────────────────────────
// Defines which edge types are valid for a given (sourceType, targetType) pair.
// Any combination not listed here is not permitted.

export const ALLOWED_CONNECTIONS: Partial<Record<NodeType, Partial<Record<NodeType, EdgeType[]>>>> = {
  Process: {
    Application:       ["USES"],
    InformationObject: ["USES"],
    InformationSource: ["USES"],
  },
  Application: {
    Process:              ["SUPPORTS"],
    Application:          ["INTEGRATES_WITH"],
    InformationObject:    ["HANDLES"],
    InformationSource:    ["CONTAINS"],
    TechnologyComponent:  ["RUNS_ON"],
    Server:               ["RUNS_ON"],
  },
  InformationObject: {
    InformationObject: ["REALIZES"],
  },
  InformationSource: {
    InformationObject: ["REALIZES"],
  },
  // A server is a single installation; the technology components (services)
  // running on it are hung on it.
  TechnologyComponent: {
    Server: ["RUNS_ON"],
  },
  // A server service (DNS, nätverk …) is provided from servers, like a
  // technology component.
  ServerService: {
    Server: ["RUNS_ON"],
  },
};

export function getValidEdgeTypes(sourceType: NodeType, targetType: NodeType): EdgeType[] {
  return ALLOWED_CONNECTIONS[sourceType]?.[targetType] ?? [];
}

export function getValidTargetTypes(sourceType: NodeType): NodeType[] {
  return Object.keys(ALLOWED_CONNECTIONS[sourceType] ?? {}) as NodeType[];
}

export function getValidSourceTypes(targetType: NodeType): NodeType[] {
  return (Object.entries(ALLOWED_CONNECTIONS) as [NodeType, Partial<Record<NodeType, EdgeType[]>>][])
    .filter(([, targets]) => targets[targetType] !== undefined)
    .map(([sourceType]) => sourceType);
}

// ── Attribute fields per node type ───────────────────────────────────────────
// Defines which attribute keys each node type has, used in create form and detail panel.

export interface AttrField {
  key: string;
  labelKey: string;
}

export const ATTR_FIELDS: Record<NodeType, AttrField[]> = {
  Process: [
    { key: "owner", labelKey: "csvImport.columns.owner" },
    { key: "category", labelKey: "csvImport.columns.category" },
    { key: "frequency", labelKey: "csvImport.columns.frequency" },
  ],
  Application: [
    { key: "leverantör", labelKey: "attributes.leverantör" },
    { key: "kategori", labelKey: "attributes.kategori" },
    { key: "status", labelKey: "attributes.status" },
    { key: "avdelning", labelKey: "attributes.avdelning" },
    { key: "driftform", labelKey: "attributes.driftform" },
    { key: "systemägare", labelKey: "attributes.systemägare" },
    { key: "systemförvaltare", labelKey: "attributes.systemförvaltare" },
    { key: "systemadministratör", labelKey: "attributes.systemadministratör" },
    { key: "planerad_driftstart", labelKey: "attributes.planerad_driftstart" },
    { key: "planerad_avveckling", labelKey: "attributes.planerad_avveckling" },
  ],
  InformationObject: [
    { key: "definition", labelKey: "csvImport.columns.definition" },
    { key: "data_owner", labelKey: "csvImport.columns.data_owner" },
    { key: "classification", labelKey: "csvImport.columns.classification" },
    { key: "domain", labelKey: "csvImport.columns.domain" },
  ],
  InformationSource: [
    { key: "system", labelKey: "csvImport.columns.system" },
    { key: "type", labelKey: "csvImport.columns.type" },
    { key: "classification", labelKey: "csvImport.columns.classification" },
  ],
  TechnologyComponent: [
    { key: "leverantör", labelKey: "attributes.leverantör" },
    { key: "komponenttyp", labelKey: "csvImport.columns.component_type" },
    { key: "hosting", labelKey: "csvImport.columns.hosting" },
    { key: "plattform", labelKey: "csvImport.columns.platform" },
    { key: "version", labelKey: "csvImport.columns.version" },
    { key: "kapacitet", labelKey: "csvImport.columns.capacity" },
    { key: "teknisk_ägare", labelKey: "csvImport.columns.technical_owner" },
    { key: "supportteam", labelKey: "csvImport.columns.support_team" },
    { key: "underhållsschema", labelKey: "csvImport.columns.maintenance_schedule" },
    { key: "säkerhetsklassificering", labelKey: "csvImport.columns.security_classification" },
  ],
  Server: [
    { key: "hostnamn", labelKey: "attributes.hostnamn" },
    { key: "servertyp", labelKey: "attributes.servertyp" },
    { key: "operativsystem", labelKey: "attributes.operativsystem" },
    { key: "miljö", labelKey: "attributes.miljö" },
    { key: "placering", labelKey: "attributes.placering" },
    { key: "ansvarig", labelKey: "attributes.ansvarig" },
  ],
  ServerService: [
    { key: "leverantör", labelKey: "attributes.leverantör" },
    { key: "komponenttyp", labelKey: "csvImport.columns.component_type" },
    { key: "driftform", labelKey: "attributes.driftform" },
    { key: "miljö", labelKey: "attributes.miljö" },
    { key: "livscykelstatus", labelKey: "attributes.livscykelstatus" },
    { key: "ansvarig", labelKey: "attributes.ansvarig" },
  ],
};

/** Node fill colours by type */
export const NODE_COLORS: Record<NodeType, string> = {
  Process: "#4CAF50",            // green
  Application: "#2196F3",        // blue
  InformationObject: "#FF9800",  // orange
  InformationSource: "#9C27B0",  // purple
  TechnologyComponent: "#F44336", // red
  Server: "#607D8B",             // blue grey
  ServerService: "#00897B",      // teal
};

export const NODE_BORDER_COLORS: Record<NodeType, string> = {
  Process: "#388E3C",
  Application: "#1565C0",
  InformationObject: "#E65100",
  InformationSource: "#6A1B9A",
  TechnologyComponent: "#B71C1C",
  Server: "#37474F",
  ServerService: "#00695C",
};

export const NODE_SHAPES: Record<NodeType, string> = {
  Process: "roundrectangle",
  Application: "rectangle",
  InformationObject: "ellipse",
  InformationSource: "diamond",
  TechnologyComponent: "hexagon",
  Server: "barrel",
  ServerService: "round-tag",
};

export interface EdgeStyle {
  lineStyle: "solid" | "dashed" | "dotted";
  color: string;
  width: number;
  targetArrow: "triangle" | "vee" | "circle";
}

export const EDGE_STYLES: Record<EdgeType, EdgeStyle> = {
  USES: { lineStyle: "solid", color: "#4CAF50", width: 1.5, targetArrow: "triangle" },
  SUPPORTS: { lineStyle: "solid", color: "#2196F3", width: 2, targetArrow: "triangle" },
  HANDLES: { lineStyle: "dashed", color: "#FF9800", width: 1.5, targetArrow: "vee" },
  REALIZES: { lineStyle: "dotted", color: "#9C27B0", width: 1.5, targetArrow: "triangle" },
  CONTAINS: { lineStyle: "solid", color: "#795548", width: 1, targetArrow: "circle" },
  RUNS_ON: { lineStyle: "dashed", color: "#F44336", width: 1.5, targetArrow: "triangle" },
  INTEGRATES_WITH: { lineStyle: "solid", color: "#E91E63", width: 3, targetArrow: "triangle" },
};

// ── Integration direction ─────────────────────────────────────────────────────
// An integration between two applications runs one way, the other way, or both.
// Only INTEGRATES_WITH carries this; every other edge type is directed by its
// own semantics (an Application SUPPORTS a Process, never the reverse).

export const INTEGRATION_DIRECTIONS: IntegrationDirection[] = [
  "SOURCE_TO_TARGET",
  "BIDIRECTIONAL",
  "TARGET_TO_SOURCE",
];

/** Integrations recorded before the field existed meant "both ways". */
export const DEFAULT_INTEGRATION_DIRECTION: IntegrationDirection = "BIDIRECTIONAL";

/** Compact glyph for the direction, read left-to-right as source → target. */
export const DIRECTION_GLYPHS: Record<IntegrationDirection, string> = {
  SOURCE_TO_TARGET: "→",
  BIDIRECTIONAL: "↔",
  TARGET_TO_SOURCE: "←",
};

/** The stored direction of an edge, or null when the type has no direction. */
export function getIntegrationDirection(
  type: EdgeType,
  attributes?: Record<string, unknown> | null,
): IntegrationDirection | null {
  if (type !== "INTEGRATES_WITH") return null;
  const raw = attributes?.direction;
  return INTEGRATION_DIRECTIONS.includes(raw as IntegrationDirection)
    ? (raw as IntegrationDirection)
    : DEFAULT_INTEGRATION_DIRECTION;
}

export interface EdgeArrows {
  sourceArrow: string;
  targetArrow: string;
}

/** Cytoscape arrowheads for an edge — an integration gets a head on whichever
 *  end(s) it flows towards, everything else keeps its single target arrow. */
export function getEdgeArrows(
  type: EdgeType,
  attributes?: Record<string, unknown> | null,
): EdgeArrows {
  const style = EDGE_STYLES[type] ?? EDGE_STYLES.USES;
  const direction = getIntegrationDirection(type, attributes);
  if (!direction) return { sourceArrow: "none", targetArrow: style.targetArrow };
  return {
    sourceArrow: direction === "SOURCE_TO_TARGET" ? "none" : style.targetArrow,
    targetArrow: direction === "TARGET_TO_SOURCE" ? "none" : style.targetArrow,
  };
}

/** Cytoscape stylesheet built from the config above.
 *  Cast to any[] to avoid strict property-value type mismatches —
 *  cytoscape accepts data() mappers at runtime even though the TS types don't reflect it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cytoscapeStylesheet: any[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": "11px",
      "font-weight": 600,
      color: "#fff",
      "text-outline-color": "data(bgColor)",
      "text-outline-width": 1,
      "background-color": "data(bgColor)",
      "border-color": "data(borderColor)",
      "border-width": 2,
      shape: "data(shape)",
      width: "label",
      height: 36,
      padding: "8px",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 4,
      "border-color": "#FFD600",
    },
  },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": "data(color)",
      "target-arrow-color": "data(color)",
      "target-arrow-shape": "data(targetArrow)",
      "source-arrow-color": "data(color)",
      "source-arrow-shape": "data(sourceArrow)",
      "line-style": "data(lineStyle)",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": "9px",
      color: "#555",
      "text-rotation": "autorotate",
      "text-margin-y": -8,
    },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#FFD600",
      "target-arrow-color": "#FFD600",
      "source-arrow-color": "#FFD600",
      width: 4,
    },
  },
];
