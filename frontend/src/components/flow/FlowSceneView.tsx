import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import LegendToggleIcon from "@mui/icons-material/LegendToggle";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import type { Scen, ScenFigur } from "@/api/arkflows";

/**
 * Draws a flowchart scene from Arkitekten.
 *
 * The one rule for this component: it DRAWS, it does not compute. Every
 * coordinate, every path and every node shape arrives finished from
 * Arkitekten, which owns the layout rules. Recomputing any of it here — node
 * positions, edge routes, line breaking, font sizes — would put the same rule
 * in two places, and the two would drift. Arkitekten's own history is the
 * warning: duplicated layout logic once made its screen and its exported files
 * disagree, and nobody noticed until an exported document looked wrong.
 *
 * So: nodes are injected as the exact SVG markup Arkitekten's exporter
 * produces, and edges are drawn from their finished `d` attribute. What this
 * component adds is only what the picture itself cannot carry — panning,
 * zooming and selection.
 */

/**
 * One legend row: the symbol as Arkitekten drew it, its name and its meaning.
 *
 * The symbol is injected as Arkitekten's own markup, exactly as the nodes are.
 * Rebuilding it here from the key would put the same drawing rule in two
 * places — the one thing this whole scene contract exists to avoid.
 */
function Figur({ figur }: { figur: ScenFigur }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ py: 0.5 }}>
      <Box
        component="svg"
        width={30}
        height={22}
        viewBox={`0 0 ${figur.w} ${figur.h}`}
        preserveAspectRatio="xMidYMid meet"
        sx={{ flexShrink: 0, mt: 0.25, overflow: "visible" }}
        dangerouslySetInnerHTML={{ __html: figur.svg }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {figur.namn}{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            ({figur.antal})
          </Typography>
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
          {figur.betydelse}
        </Typography>
      </Box>
    </Stack>
  );
}

interface Props {
  scen: Scen;
  /** Shown above the canvas, e.g. "2.2.7 Uthyrning · version 1.0". */
  caption?: string;
  /** What the process does — published with the flow from Arkitekten. */
  beskrivning?: string;
}

interface Vy {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

export default function FlowSceneView({ scen, caption, beskrivning }: Props) {
  const { t } = useTranslation();
  const hållare = useRef<HTMLDivElement | null>(null);
  const [vy, setVy] = useState<Vy>({ x: 0, y: 0, k: 1 });
  const [vald, setVald] = useState<string | null>(null);
  /**
   * The legend starts CLOSED. It explains the picture, it must not cover it —
   * and a reader who already knows 2C8's symbols should not have to dismiss
   * anything to see the diagram.
   */
  const [visaFigurer, setVisaFigurer] = useState(false);
  const drar = useRef<{ x: number; y: number; vy: Vy } | null>(null);

  /** Scale and centre so the whole diagram is visible. */
  const passaIn = useCallback(() => {
    const el = hållare.current;
    if (!el || !scen.bredd || !scen.höjd) return;
    const marginal = 24;
    const bw = el.clientWidth - marginal * 2;
    const bh = el.clientHeight - marginal * 2;
    if (bw <= 0 || bh <= 0) return;
    const k = Math.min(bw / scen.bredd, bh / scen.höjd, MAX_ZOOM);
    setVy({
      k,
      x: (el.clientWidth - scen.bredd * k) / 2,
      y: (el.clientHeight - scen.höjd * k) / 2,
    });
  }, [scen.bredd, scen.höjd]);

  // Fit on first paint and whenever a different flowchart is shown.
  useLayoutEffect(() => {
    passaIn();
    setVald(null);
  }, [passaIn, scen.flöde.id]);

  // Keep it fitted when the pane is resized (the tree panel can collapse).
  useEffect(() => {
    const el = hållare.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => passaIn());
    ro.observe(el);
    return () => ro.disconnect();
  }, [passaIn]);

  const zooma = useCallback((faktor: number, mot?: { x: number; y: number }) => {
    setVy((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * faktor));
      const el = hållare.current;
      // Zoom towards the pointer when there is one, otherwise the centre.
      const px = mot?.x ?? (el ? el.clientWidth / 2 : 0);
      const py = mot?.y ?? (el ? el.clientHeight / 2 : 0);
      const skala = k / v.k;
      return { k, x: px - (px - v.x) * skala, y: py - (py - v.y) * skala };
    });
  }, []);

  const påHjul = useCallback(
    (e: React.WheelEvent) => {
      const r = hållare.current?.getBoundingClientRect();
      zooma(e.deltaY < 0 ? 1.12 : 1 / 1.12, r ? { x: e.clientX - r.left, y: e.clientY - r.top } : undefined);
    },
    [zooma],
  );

  // Pointer guards: a drag only ever acts on its own pointer, and only with
  // the primary button held. A pointer sweeping past with a button down must
  // not pan the canvas.
  const påNer = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drar.current = { x: e.clientX, y: e.clientY, vy };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const påRör = (e: React.PointerEvent) => {
    const d = drar.current;
    if (!d || !(e.buttons & 1)) return;
    setVy({ ...d.vy, x: d.vy.x + (e.clientX - d.x), y: d.vy.y + (e.clientY - d.y) });
  };
  const påUpp = (e: React.PointerEvent) => {
    drar.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  const nodById = useMemo(() => new Map(scen.noder.map((n) => [n.id, n])), [scen.noder]);
  // Arkitekten's own legend for this picture. Older scenes carry none.
  const figurer = scen.figurer ?? [];
  const valdNod = vald ? nodById.get(vald) : undefined;
  const valtSteg = vald ? scen.steg?.[vald] : undefined;

  return (
    <Box sx={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      {caption && (
        <Typography
          variant="caption"
          sx={{
            position: "absolute", top: 8, left: 12, zIndex: 2,
            bgcolor: "background.paper", px: 1, py: 0.25, borderRadius: 1,
            border: 1, borderColor: "divider", maxWidth: "min(640px, calc(100% - 24px))",
          }}
        >
          {caption}
          {beskrivning && (
            <Box component="span" sx={{ display: "block", color: "text.secondary", whiteSpace: "pre-line" }}>
              {beskrivning}
            </Box>
          )}
        </Typography>
      )}

      <Box
        ref={hållare}
        onWheel={påHjul}
        onPointerDown={påNer}
        onPointerMove={påRör}
        onPointerUp={påUpp}
        onPointerCancel={påUpp}
        sx={{
          height: "100%", width: "100%",
          // The diagram is drawn for paper; keep its own white ground so it
          // looks the same as the exported file in either portal theme.
          bgcolor: "#ffffff",
          cursor: drar.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <svg width="100%" height="100%" role="img" aria-label={scen.flöde.namn}>
          {/* Arrowhead markers the edge paths reference. */}
          <defs dangerouslySetInnerHTML={{ __html: scen.defs }} />
          <g transform={`translate(${vy.x},${vy.y}) scale(${vy.k})`}>
            {scen.kanter.map((k) => (
              <path
                key={k.id}
                d={k.d}
                fill="none"
                stroke={k.färg}
                strokeWidth={k.tjocklek}
                // The scene NAMES its marker. Deriving the id from the type
                // was wrong as soon as one type got more than one colour: HUKI
                // has a marker per responsibility (U blue, I yellow, H orange,
                // K olive), and a guessed id gave the yellow arrow a blue head.
                // The old scheme stays as a fallback for scenes mirrored before
                // the field existed.
                markerEnd={`url(#${
                  k.markör ?? `c8-${k.pilspets === "fylld" ? "arrow" : "open"}-${k.typ}`
                })`}
              />
            ))}
            {scen.kanter.map((k) =>
              k.etikett && k.ankare ? (
                <text
                  key={`${k.id}-etikett`}
                  x={k.ankare.x}
                  y={k.ankare.y}
                  fontFamily="Segoe UI, Arial, sans-serif"
                  fontSize={10.5}
                  fill="#374151"
                  dominantBaseline="middle"
                >
                  {k.etikett}
                </text>
              ) : null,
            )}
            {scen.noder.map((n) => {
              // The (i) badge Arkitekten draws promises a description. Reading
              // it required knowing that the object is clickable, which nothing
              // said — so the note is also the object's hover text, and objects
              // that carry one say so in their cursor.
              const not = scen.steg?.[n.id]?.not ?? n.beskrivning;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: not ? "help" : "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setVald((v) => (v === n.id ? null : n.id));
                  }}
                >
                  {not && <title>{`${n.etikett}\n\n${not}`}</title>}
                  {/* The exporter's own markup — same picture as the file. */}
                  <g dangerouslySetInnerHTML={{ __html: n.svg }} />
                </g>
              );
            })}
            {valdNod && (
              <rect
                x={valdNod.x - 3}
                y={valdNod.y - 3}
                width={valdNod.w + 6}
                height={valdNod.h + 6}
                fill="none"
                stroke="#1976d2"
                strokeWidth={2}
                rx={4}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      </Box>

      <Stack direction="row" spacing={0.5} sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
        <Tooltip title={t("flowScene.zoomIn")}>
          <IconButton size="small" onClick={() => zooma(1.25)} sx={{ bgcolor: "background.paper" }}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("flowScene.zoomOut")}>
          <IconButton size="small" onClick={() => zooma(1 / 1.25)} sx={{ bgcolor: "background.paper" }}>
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("flowScene.fit")}>
          <IconButton size="small" onClick={passaIn} sx={{ bgcolor: "background.paper" }}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Only offered when the scene brought a legend — older mirrored
            scenes have none, and an empty panel explains nothing. */}
        {figurer.length > 0 && (
          <Tooltip title={t("flowScene.legend")}>
            <IconButton
              size="small"
              onClick={() => setVisaFigurer((v) => !v)}
              sx={{ bgcolor: visaFigurer ? "action.selected" : "background.paper" }}
              aria-pressed={visaFigurer}
            >
              <LegendToggleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {visaFigurer && figurer.length > 0 && (
        <Paper
          elevation={3}
          sx={{
            position: "absolute", top: 48, right: 8, zIndex: 3,
            p: 1.5, width: 330, maxHeight: "calc(100% - 64px)", overflowY: "auto",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              {t("flowScene.legend")}
            </Typography>
            <IconButton size="small" onClick={() => setVisaFigurer(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          {figurer.map((grupp) => (
            <Box key={grupp.titel} sx={{ mt: 1 }}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", lineHeight: 1.6 }}
              >
                {grupp.titel}
              </Typography>
              {grupp.figurer.map((f) => (
                <Figur key={f.nyckel} figur={f} />
              ))}
              {grupp.hint && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  {grupp.hint}
                </Typography>
              )}
            </Box>
          ))}
        </Paper>
      )}

      {valdNod && (
        <Paper
          elevation={3}
          sx={{ position: "absolute", left: 12, bottom: 12, zIndex: 2, p: 1.5, maxWidth: 380 }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle2">{valdNod.etikett}</Typography>
              <Typography variant="caption" color="text.secondary">
                {valdNod.typ}
              </Typography>
              {(valtSteg?.not ?? valdNod.beskrivning) && (
                <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                  {valtSteg?.not ?? valdNod.beskrivning}
                </Typography>
              )}
            </Box>
            <IconButton size="small" onClick={() => setVald(null)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
