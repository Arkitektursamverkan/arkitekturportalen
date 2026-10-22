import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * Flowcharts from Arkitekten, delivered as ready-to-draw *scenes*.
 *
 * A scene is a finished layout: coordinates, finished SVG paths and finished
 * node shapes. Arkitekten computes it, we draw it. Nothing in here should be
 * recomputed on this side — see `FlowSceneView` for why that matters.
 */

export interface ScenNod {
  id: string;
  typ: string;
  etikett: string;
  /** The node drawn, in its own coordinates (0,0 to w×h). Place at x,y. */
  svg: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sida: number;
  stil: { fill: string; stroke: string; text: string };
  beskrivning?: string;
  nedbruten?: boolean;
}

export interface ScenKant {
  id: string;
  källa: string;
  mål: string;
  typ: string;
  /** Finished SVG path. Already routed around every other object. */
  d: string;
  färg: string;
  tjocklek: number;
  pilspets: "fylld" | "oppen";
  /**
   * Id of the marker in `defs` this edge's arrowhead uses. Draw it as
   * `marker-end="url(#<markör>)"` — never build the id from `typ`, since HUKI
   * has one marker per responsibility (U blue, I yellow, H orange, K olive).
   * Absent on scenes mirrored before the field existed.
   */
  markör?: string;
  etikett?: string;
  ankare?: { x: number; y: number };
  /**
   * The label drawn by Arkitekten, in scene coordinates (a Systemprocess's
   * boxed Ja/Nej). When present, inject it as-is instead of setting `etikett`
   * at `ankare` in a style of our own.
   */
  etikettSvg?: string;
}

/**
 * One symbol in the legend, drawn by Arkitekten.
 *
 * `svg` is the symbol itself, finished, in its own coordinates (0,0 to w×h) —
 * the very shape the diagram draws. It is self-contained and references no
 * `defs`, so it can be drawn outside the canvas's own <svg>. Never rebuild it
 * from `nyckel`: a legend that draws its own idea of a shape stops being a
 * legend for THIS picture.
 */
export interface ScenFigur {
  nyckel: string;
  namn: string;
  betydelse: string;
  antal: number;
  svg: string;
  w: number;
  h: number;
}

export interface ScenFigurGrupp {
  titel: string;
  figurer: ScenFigur[];
  hint?: string;
}

export interface Scen {
  format: "ark-scen";
  formatVersion: number;
  familj: "2c8" | "flodesschema";
  flöde: { id: string; namn: string; status?: string; beteckning?: string };
  bredd: number;
  höjd: number;
  skala: number;
  /** Arrowhead markers the paths reference. Must go in the canvas's <defs>. */
  defs: string;
  noder: ScenNod[];
  kanter: ScenKant[];
  steg: Record<string, { text: string; typ: string; not?: string; källtext?: string }>;
  /**
   * The legend — what the symbols and colours in THIS picture mean.
   *
   * Only the symbols the picture actually contains. It matters most for 2C8's
   * responsibility lines: they carry their HUKI letter in the COLOUR and never
   * write it out, so without this a reader sees a yellow line with nowhere to
   * look up that it means "informed".
   *
   * Absent on scenes mirrored before the field existed — the canvas simply
   * offers no legend then.
   */
  figurer?: ScenFigurGrupp[];
  /**
   * What lies BEHIND the flow, drawn by Arkitekten in scene coordinates: page
   * frames, pool, swimlanes and recipient pools. Only Systemprocess scenes
   * carry it. Draw it first.
   */
  bakgrund?: string;
  /**
   * Artifacts drawn by Arkitekten — data stores, data associations, message
   * flows, page references. Draw after the edges and before the nodes, the
   * same order as Arkitekten's export.
   */
  artefakter?: string;
}

export interface ArkflowSummary {
  id: string;
  name: string;
  familj: string | null;
  /** 2C8 numbering ("2.2.7") — what links a flowchart to a Process node. */
  prefix: string | null;
  actor: string | null;
  /** Derived by Arkitekten from its version history. Display only. */
  status: string | null;
  beteckning: string | null;
  saved_at: string | null;
  /**
   * Set when the flow was published from Arkitekten ("Publicera i
   * EA-portalen"): the Process node it belongs to, with owner and description.
   * They travel with the flow because a 2C8-synced node is overwritten on
   * every 2C8 sync.
   */
  ea_nod_id?: string | null;
  ägare?: string | null;
  beskrivning?: string | null;
  publicerad_at?: string | null;
  bredd: number | null;
  höjd: number | null;
}

export interface Arkflow extends ArkflowSummary {
  scen: Scen | null;
}

/** The index. Deliberately without scenes — one can be ~112 kB. */
export function useArkflows() {
  return useQuery({
    queryKey: ["arkflows"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ flows: ArkflowSummary[] }>("/arkflows");
      return data.flows;
    },
    // Flowcharts change when someone edits one — rarely, and never urgently.
    staleTime: 5 * 60_000,
  });
}

/** One flowchart with its scene. Fetched only when something will be drawn. */
export function useArkflow(id: string | null | undefined) {
  return useQuery({
    queryKey: ["arkflow", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await apiClient.get<Arkflow>(`/arkflows/${id}`);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * The flowchart belonging to a Process node.
 *
 * Published flows name their node (`ea_nod_id`) — that wins, because a process
 * created at publication may have no 2C8 number at all. Older mirrors are
 * matched on 2C8 numbering (`attributes.prefix`, written by the 2C8 sync), but
 * only flows that are not published elsewhere: a flow published onto another
 * node must not also show up on the node its name happens to number.
 */
export function arkflowForProcess(
  flows: ArkflowSummary[] | undefined,
  nodeId: string | null | undefined,
  prefix: string | null | undefined,
): ArkflowSummary | undefined {
  if (!flows || !nodeId) return undefined;
  return (
    flows.find((f) => f.ea_nod_id === nodeId) ??
    (prefix ? flows.find((f) => !f.ea_nod_id && f.prefix === prefix) : undefined)
  );
}

/**
 * A Systemprocess is drawn in Arkitekten's flowchart tool ("flodesschema") and
 * published onto an APPLICATION, where it shows under the Systemprocesser tab.
 * Matched on `ea_nod_id` only — applications have no 2C8 numbering to fall
 * back on. An application can have several.
 */
export const SYSTEMPROCESS_FAMILJ = "flodesschema";

export function arkflowsForApplication(
  flows: ArkflowSummary[] | undefined,
  nodeId: string | null | undefined,
): ArkflowSummary[] {
  if (!flows || !nodeId) return [];
  return flows
    .filter((f) => f.familj === SYSTEMPROCESS_FAMILJ && f.ea_nod_id === nodeId)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "sv"));
}

export function useArkflowForProcess(
  nodeId: string | null | undefined,
  prefix: string | null | undefined,
) {
  const index = useArkflows();
  const match = arkflowForProcess(index.data, nodeId, prefix);
  const flow = useArkflow(match?.id);
  return {
    /** Hela indexet – för att visa VILKA processer som har ett flödesschema. */
    alla: index.data,
    summary: match,
    flow: flow.data,
    isLoading: index.isLoading || flow.isLoading,
    error: index.error ?? flow.error,
    /** The index loaded and this process simply has no flowchart. */
    missing: !index.isLoading && !match,
  };
}

/** Vad en manuell synk gav – en körning per pipeline i plattformen. */
export interface ArkflowSyncResult {
  runs: Array<{
    flow_id: string;
    status: string;
    records_processed: number;
    records_updated: number;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
  }>;
  records_processed: number;
  records_updated: number;
  failed: string[];
}

/**
 * Hämta flödesschemana från Arkitekten NU, i stället för att vänta på schemat.
 *
 * Plattformens pipeline körs varannan timme, så en ändring i Arkitekten syns
 * här först när den gått. Knappen finns för den som inte vill vänta. Admin
 * krävs – det är en körning i ett annat system, inte en läsning.
 *
 * Körningen tar tiotals sekunder (en stor process är ~2 s att rutta), och när
 * den är klar måste allt som visar scener hämtas om: serverns läscache tömdes
 * av endpointen, och den här sidans frågor måste följa efter.
 */
export function useSyncArkflows() {
  const qc = useQueryClient();
  return useMutation<ArkflowSyncResult>({
    mutationFn: async () => {
      const { data } = await apiClient.post<ArkflowSyncResult>("/arkflows/sync");
      return data;
    },
    onSuccess: () => {
      // BÅDA nycklarna: indexet ("arkflows") och varje hämtad scen
      // ("arkflow", id). Bara indexet räckte inte – den öppna processens bild
      // låg kvar i klientens cache i fem minuter, och knappen såg ut att inte
      // ha gjort något.
      qc.invalidateQueries({ queryKey: ["arkflows"] });
      qc.invalidateQueries({ queryKey: ["arkflow"] });
    },
  });
}
