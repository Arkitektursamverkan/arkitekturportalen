import { useEffect, useMemo, useState } from "react";
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useTranslation } from "react-i18next";
import { useArkflow, type ArkflowSummary, type Scen } from "@/api/arkflows";
import { sanitizeSvg } from "@/utils/sanitizeSvg";
import FlowSceneView from "./FlowSceneView";
import MaximizeArea from "./MaximizeArea";

/**
 * The scene as it looks with one LAYER showing. Arkitekten ships each layer as
 * a finished picture; the portal swaps pictures and never filters itself, so
 * the rule for what a layer shows lives in one place (Arkitekten).
 */
export function sceneForLayer(scen: Scen, lagerId: string | null): Scen {
  const lager = lagerId ? scen.lager?.find((l) => l.id === lagerId) : undefined;
  return lager ? { ...scen, bakgrund: lager.bakgrund, bredd: lager.bredd, höjd: lager.höjd } : scen;
}

/** The picture as a standalone SVG file — sanitised, like what is shown. */
export function sketchSvg(scen: Scen): string {
  const b = Math.max(1, Math.round(scen.bredd));
  const h = Math.max(1, Math.round(scen.höjd));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">` +
    `<rect width="${b}" height="${h}" fill="#ffffff"/>${sanitizeSvg(scen.bakgrund ?? "")}</svg>`
  );
}

/**
 * The Systemskiss tab on a server: the system sketches published onto it from
 * Arkitekten. Sketches are listed as chips when there are several, and the
 * sketch's layers (typically one per application) as a second row — "Alla"
 * shows the whole sketch.
 */
export default function SystemSketchTab({ flows }: { flows: ArkflowSummary[] }) {
  const { t } = useTranslation();
  const [valdId, setValdId] = useState<string | null>(flows[0]?.id ?? null);
  const [lagerId, setLagerId] = useState<string | null>(null);

  // Another server selected: start on its first sketch, with every layer.
  useEffect(() => {
    if (!flows.some((f) => f.id === valdId)) {
      setValdId(flows[0]?.id ?? null);
      setLagerId(null);
    }
  }, [flows, valdId]);

  const flöde = useArkflow(valdId);
  const f = flöde.data;
  const lager = f?.scen?.lager ?? [];
  const scen = useMemo(() => (f?.scen ? sceneForLayer(f.scen, lagerId) : undefined), [f?.scen, lagerId]);
  const lagernamn = lager.find((l) => l.id === lagerId)?.namn;

  const laddaNer = () => {
    if (!scen || !f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sketchSvg(scen)], { type: "image/svg+xml" }));
    a.download = `${[f.name, lagernamn].filter(Boolean).join(" – ")}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const rad = { px: 1.5, py: 1, flexWrap: "wrap", rowGap: 1, borderBottom: 1, borderColor: "divider", alignItems: "center" } as const;

  return (
    // The sketch chooser and the layer row follow the picture to full window.
    <MaximizeArea sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {flows.length > 1 && (
        <Stack direction="row" spacing={1} sx={rad}>
          {flows.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              size="small"
              color={s.id === valdId ? "primary" : "default"}
              variant={s.id === valdId ? "filled" : "outlined"}
              onClick={() => {
                setValdId(s.id);
                setLagerId(null);
              }}
            />
          ))}
        </Stack>
      )}
      {lager.length > 0 && (
        <Stack direction="row" spacing={1} sx={rad} role="group" aria-label={t("flowScene.sketchLayers")}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
            {t("flowScene.sketchLayers")}
          </Typography>
          <Chip
            label={t("flowScene.sketchAllLayers")}
            size="small"
            color={lagerId === null ? "primary" : "default"}
            variant={lagerId === null ? "filled" : "outlined"}
            onClick={() => setLagerId(null)}
          />
          {lager.map((l) => (
            <Chip
              key={l.id}
              label={l.namn}
              size="small"
              color={l.id === lagerId ? "primary" : "default"}
              variant={l.id === lagerId ? "filled" : "outlined"}
              onClick={() => setLagerId(l.id)}
            />
          ))}
        </Stack>
      )}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {scen && f ? (
          <FlowSceneView
            // A new picture has new measures: remount so it is fitted to the window.
            key={`${f.id}-${lagerId ?? "alla"}`}
            scen={scen}
            caption={[f.name, lagernamn].filter(Boolean).join(" · ")}
            beskrivning={f.beskrivning ?? undefined}
            actions={
              <Tooltip title={t("flowScene.sketchDownload")}>
                <IconButton size="small" onClick={laddaNer} sx={{ bgcolor: "background.paper" }} aria-label={t("flowScene.sketchDownload")}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          />
        ) : (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "text.secondary" }}>{flöde.isLoading ? t("flowScene.loading") : t("flowScene.none")}</Typography>
          </Box>
        )}
      </Box>
    </MaximizeArea>
  );
}
