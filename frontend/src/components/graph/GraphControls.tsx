import React from "react";
import type { Core } from "cytoscape";
import { IconButton, Stack, Tooltip, Divider } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import ImageIcon from "@mui/icons-material/Image";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useTranslation } from "react-i18next";
import { saveAs } from "file-saver";
import { clearPositions } from "./positionCache";

import cytoscape from "cytoscape";
// @ts-ignore — no typings for cytoscape-svg
import cytoscapeSvg from "cytoscape-svg";

// Register the SVG export plugin once (safe to call multiple times — cytoscape guards against double-registration)
if (!(cytoscape as any)._svgRegistered) {
  try { cytoscape.use(cytoscapeSvg); } catch { /* already registered */ }
  (cytoscape as any)._svgRegistered = true;
}

interface Props {
  cyRef: React.MutableRefObject<Core | null>;
  graphName?: string;
  /** When provided, the reset button clears saved positions and re-runs this layout. */
  defaultLayout?: cytoscape.LayoutOptions;
  /** Position cache key — cleared on reset so the layout algorithm runs fresh. */
  positionKey?: string;
  onResetLayout?: () => void;
}

const GraphControls: React.FC<Props> = ({ cyRef, graphName = "graph", defaultLayout, positionKey, onResetLayout }) => {
  const { t } = useTranslation();

  const zoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const zoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const fit = () => cyRef.current?.fit(undefined, 40);

  const handleReset = () => {
    if (positionKey) clearPositions(positionKey);
    if (onResetLayout) {
      onResetLayout();
    } else if (defaultLayout && cyRef.current) {
      cyRef.current.layout(defaultLayout).run();
    }
  };

  const showReset = !!(onResetLayout || defaultLayout);

  const exportPng = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const png = cy.png({ output: "blob", scale: 2, bg: "#FFFFFF" });
    saveAs(png, `${graphName}.png`);
  };

  const exportSvg = () => {
    const cy = cyRef.current as any;
    if (!cy) return;
    try {
      const svg: string = cy.svg({ scale: 1, full: true });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      saveAs(blob, `${graphName}.svg`);
    } catch (e) {
      console.error("SVG export failed", e);
    }
  };

  return (
    <Stack
      direction="column"
      spacing={0.5}
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: 2,
        p: 0.5,
      }}
    >
      <Tooltip title={t("graph.zoomIn")} placement="left">
        <IconButton size="small" onClick={zoomIn}><ZoomInIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={t("graph.zoomOut")} placement="left">
        <IconButton size="small" onClick={zoomOut}><ZoomOutIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={t("graph.fitScreen")} placement="left">
        <IconButton size="small" onClick={fit}><FitScreenIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Divider />
      {showReset && (
        <Tooltip title={t("graph.resetLayout")} placement="left">
          <IconButton size="small" onClick={handleReset}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
      <Tooltip title={t("graph.exportPng")} placement="left">
        <IconButton size="small" onClick={exportPng}><ImageIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={t("graph.exportSvg")} placement="left">
        <IconButton size="small" onClick={exportSvg}><PictureAsPdfIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );
};

export default GraphControls;
