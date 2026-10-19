export type NodeType =
  | "Process"
  | "Application"
  | "InformationObject"
  | "InformationSource"
  | "TechnologyComponent"
  | "Server"
  | "ServerService";

export type EdgeType =
  | "USES"
  | "SUPPORTS"
  | "HANDLES"
  | "REALIZES"
  | "CONTAINS"
  | "RUNS_ON"
  | "INTEGRATES_WITH";

export type ExternalSource = "NONE" | "SHAREPOINT" | "2C8";

/** Which way information flows over an INTEGRATES_WITH edge, relative to the
 *  edge's own source and target. */
export type IntegrationDirection =
  | "SOURCE_TO_TARGET"
  | "BIDIRECTIONAL"
  | "TARGET_TO_SOURCE";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string | null;
  external_source: ExternalSource;
  archived: boolean;
  admin_hidden?: boolean;
  is_structure?: boolean;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  attributes: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeRead extends GraphNode {
  external_id?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EdgeRead {
  id: string;
  source_id: string;
  target_id: string;
  type: EdgeType;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NodeCreate {
  type: NodeType;
  name: string;
  description?: string;
  external_source?: ExternalSource;
  external_id?: string;
  attributes?: Record<string, unknown>;
}

export interface EdgeCreate {
  source_id: string;
  target_id: string;
  type: EdgeType;
  /** Only meaningful for INTEGRATES_WITH; the backend defaults it to BIDIRECTIONAL. */
  direction?: IntegrationDirection;
  attributes?: Record<string, unknown>;
}

export type FlagType = "INCOMPLETE" | "OUTDATED" | "INCORRECT";

export interface NodeFlag {
  id: string;
  node_id: string;
  flag_type: FlagType;
  description: string | null;
  created_by: string | null;
  created_at: string;
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
}

export interface OverlapGapsData {
  overlaps: {
    overlapping_processes: Array<{ id: string; name: string; app_count: number; app_names: string[] }>;
    overlapping_info_objects: Array<{ id: string; name: string; app_count: number; app_names: string[] }>;
  };
  gaps: {
    unsupported_processes: Array<{ id: string; name: string; external_source: string }>;
    unrealized_info_objects: Array<{ id: string; name: string }>;
    orphaned_applications: Array<{ id: string; name: string; external_source: string }>;
  };
}
