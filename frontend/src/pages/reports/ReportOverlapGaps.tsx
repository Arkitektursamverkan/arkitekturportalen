import React, { useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Chip, Paper, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningIcon from "@mui/icons-material/Warning";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOverlapGaps } from "@/api/views";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ErrorAlert from "@/components/common/ErrorAlert";
import { NODE_COLORS } from "@/config/graphConfig";
import type { NodeType } from "@/types/graph";
import ReportTitle from "@/components/reports/ReportTitle";

const NODE_ROUTE: Record<NodeType, string> = {
  Process: "/processes",
  Application: "/systems",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

const ReportOverlapGaps: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const { data, isLoading, error, refetch } = useOverlapGaps();

  if (isLoading) return <LoadingSpinner height="60vh" />;
  if (error) return <Box p={3}><ErrorAlert error={error as Error} onRetry={refetch} /></Box>;
  if (!data) return null;

  const { overlaps, gaps } = data;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("overlapGaps.title")} /></Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <WarningIcon fontSize="small" sx={{ color: "warning.main" }} />
              <span>{t("overlapGaps.overlaps")}</span>
              <Chip
                label={(overlaps.overlapping_processes.length + overlaps.overlapping_info_objects.length)}
                size="small"
                color="warning"
              />
            </Stack>
          }
        />
        <Tab
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <ErrorOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
              <span>{t("overlapGaps.gaps")}</span>
              <Chip
                label={(
                  gaps.unsupported_processes.length +
                  gaps.unrealized_info_objects.length +
                  gaps.orphaned_applications.length
                )}
                size="small"
                color="error"
              />
            </Stack>
          }
        />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {t("overlapGaps.overlappingProcesses")}
                <Chip label={overlaps.overlapping_processes.length} size="small" sx={{ ml: 1 }} />
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <OverlapTable rows={overlaps.overlapping_processes} t={t} nodeType="Process" navigate={navigate} />
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {t("overlapGaps.overlappingInfoObjects")}
                <Chip label={overlaps.overlapping_info_objects.length} size="small" sx={{ ml: 1 }} />
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <OverlapTable rows={overlaps.overlapping_info_objects} t={t} nodeType="InformationObject" navigate={navigate} />
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <GapSection
            title={t("overlapGaps.unsupportedProcesses")}
            rows={gaps.unsupported_processes}
            color="error"
            nodeType="Process"
            navigate={navigate}
            t={t}
          />
          <GapSection
            title={t("overlapGaps.unrealizedInfoObjects")}
            rows={gaps.unrealized_info_objects}
            color="warning"
            nodeType="InformationObject"
            navigate={navigate}
            t={t}
          />
          <GapSection
            title={t("overlapGaps.orphanedApplications")}
            rows={gaps.orphaned_applications}
            color="info"
            nodeType="Application"
            navigate={navigate}
            t={t}
          />
        </Stack>
      )}
    </Box>
  );
};

interface OverlapRow { id: string; name: string; app_count: number; app_names: string[] }
const OverlapTable: React.FC<{ rows: OverlapRow[]; t: (k: string) => string; nodeType: string; navigate: (path: string) => void }> = ({ rows, t, nodeType, navigate }) => {
  if (!rows.length) return <Box p={2}><Typography color="text.secondary">{t("common.noData")}</Typography></Box>;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("overlapGaps.appCount")}</TableCell>
          <TableCell>{t("overlapGaps.applications")}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.id}
            hover
            onClick={() => navigate(`${NODE_ROUTE[nodeType as NodeType]}?id=${r.id}`)}
            sx={{ cursor: "pointer" }}
          >
            <TableCell>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[nodeType] ?? "#999", flexShrink: 0 }} />
                <Typography variant="body2">{r.name}</Typography>
              </Stack>
            </TableCell>
            <TableCell>
              <Chip label={r.app_count} size="small" color="warning" />
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {(r.app_names ?? []).map((a) => <Chip key={a} label={a} size="small" variant="outlined" />)}
              </Stack>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

interface GapRow { id: string; name: string; external_source?: string }
const GapSection: React.FC<{
  title: string; rows: GapRow[]; color: "error" | "warning" | "info";
  nodeType: NodeType; navigate: (path: string) => void; t: (k: string) => string;
}> = ({ title, rows, color, nodeType, navigate, t }) => (
  <Paper variant="outlined">
    <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: `${color}.50` }}>
      <Typography fontWeight={600}>
        {title} <Chip label={rows.length} size="small" color={color} sx={{ ml: 1 }} />
      </Typography>
    </Box>
    {!rows.length ? (
      <Box p={2}><Typography color="text.secondary">{t("common.noData")}</Typography></Box>
    ) : (
      <Table size="small">
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              hover
              onClick={() => navigate(`${NODE_ROUTE[nodeType]}?id=${r.id}`)}
              sx={{ cursor: "pointer" }}
            >
              <TableCell><Typography variant="body2">{r.name}</Typography></TableCell>
              {r.external_source && (
                <TableCell><Chip label={t(`externalSource.${r.external_source}`)} size="small" /></TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </Paper>
);

export default ReportOverlapGaps;
