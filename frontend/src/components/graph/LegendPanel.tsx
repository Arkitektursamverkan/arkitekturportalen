import React, { useState } from "react";
import { Box, Collapse, IconButton, Stack, Typography, Paper } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import { NODE_COLORS, EDGE_STYLES, DIRECTION_GLYPHS, INTEGRATION_DIRECTIONS } from "@/config/graphConfig";
import type { NodeType, EdgeType } from "@/types/graph";

const NODE_TYPES: NodeType[] = [
  "Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent", "Server", "ServerService",
];
const EDGE_TYPES: EdgeType[] = [
  "USES", "SUPPORTS", "HANDLES", "REALIZES", "CONTAINS", "RUNS_ON", "INTEGRATES_WITH",
];

const LegendPanel: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Paper elevation={2} sx={{ minWidth: 200 }}>
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 0.75, cursor: "pointer" }}
      >
        <Typography variant="caption" fontWeight={700}>
          {t("graph.legend")}
        </Typography>
        <IconButton size="small" sx={{ p: 0 }}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{t("graph.legendNodes")}</Typography>
          <Stack spacing={0.5} mb={1}>
            {NODE_TYPES.map((nt) => (
              <Stack key={nt} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: NODE_COLORS[nt], flexShrink: 0 }} />
                <Typography variant="caption">{t(`nodeTypes.${nt}`)}</Typography>
              </Stack>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{t("graph.legendEdges")}</Typography>
          <Stack spacing={0.5}>
            {EDGE_TYPES.map((et) => {
              const style = EDGE_STYLES[et];
              return (
                <Stack key={et} direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 24, height: 2,
                      bgcolor: style.color,
                      flexShrink: 0,
                      borderTop: `2px ${style.lineStyle === "dashed" ? "dashed" : style.lineStyle === "dotted" ? "dotted" : "solid"} ${style.color}`,
                      background: "none",
                    }}
                  />
                  <Typography variant="caption">{t(`edgeTypes.${et}`)}</Typography>
                </Stack>
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={1} mb={0.5}>
            {t("graph.legendDirection")}
          </Typography>
          <Stack spacing={0.5}>
            {INTEGRATION_DIRECTIONS.map((d) => (
              <Stack key={d} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 24, textAlign: "center", flexShrink: 0 }}>
                  <Typography variant="caption" fontWeight={700}>{DIRECTION_GLYPHS[d]}</Typography>
                </Box>
                <Typography variant="caption">{t(`integrationDirection.${d}`)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default LegendPanel;
