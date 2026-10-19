import React, { useMemo } from "react";
import { Alert, Box, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const STATUS_COLORS: Record<string, string> = {
  "Aktiv": "#4caf50", "Active": "#4caf50",
  "Planerad": "#2196f3", "Planned": "#2196f3",
  "Avveckling": "#e53935", "Phase-out": "#e53935",
  "Avvecklad": "#9e9e9e", "Retired": "#9e9e9e",
};

interface TimelineItem {
  id: string; name: string; status: string; department: string;
  goLive: string; retirement: string;
  year: number; type: "go-live" | "retirement";
}

const ReportRoadmap: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();

  const { timeline, hasData, years } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const items: TimelineItem[] = [];

    for (const app of apps) {
      // Swedish keys like the rest of the Application attributes; the English
      // ones are still read, for anything imported before they were renamed.
      const goLive = String(
        app.attributes?.planerad_driftstart || app.attributes?.planned_go_live || "",
      );
      const retirement = String(
        app.attributes?.planerad_avveckling || app.attributes?.planned_retirement || "",
      );
      const status = String(app.attributes?.status || "");
      const dept = String(app.attributes?.avdelning || app.attributes?.["avdelning/enhet"] || "");

      if (goLive) {
        const year = new Date(goLive).getFullYear();
        if (!isNaN(year)) items.push({ id: app.id, name: app.name, status, department: dept, goLive, retirement, year, type: "go-live" });
      }
      if (retirement) {
        const year = new Date(retirement).getFullYear();
        if (!isNaN(year)) items.push({ id: app.id, name: app.name, status, department: dept, goLive, retirement, year, type: "retirement" });
      }
    }

    items.sort((a, b) => {
      const dateA = a.type === "go-live" ? a.goLive : a.retirement;
      const dateB = b.type === "go-live" ? b.goLive : b.retirement;
      return dateA.localeCompare(dateB);
    });

    const allYears = Array.from(new Set(items.map((i) => i.year))).sort();

    return { timeline: items, hasData: items.length > 0, years: allYears };
  }, [nodes]);

  // Also show current landscape by status
  const statusGroups = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, number>();
    for (const app of apps) {
      const status = String(app.attributes?.status || t("reports.lifecycle.unknown"));
      map.set(status, (map.get(status) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes, t]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.roadmap.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.roadmap.description")}</Typography>

      {/* Current status overview */}
      <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" useFlexGap>
        {statusGroups.map(([status, count]) => (
          <Chip key={status} label={`${status}: ${count}`}
            sx={{ bgcolor: STATUS_COLORS[status] || "#757575", color: "#fff", fontWeight: 600 }} />
        ))}
      </Stack>

      {!hasData && <Alert severity="info" sx={{ mb: 3 }}>{t("reports.roadmap.hint")}</Alert>}

      {hasData && years.map((year) => {
        const yearItems = timeline.filter((i) => i.year === year);
        const goLiveItems = yearItems.filter((i) => i.type === "go-live");
        const retirementItems = yearItems.filter((i) => i.type === "retirement");

        return (
          <Card key={year} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} mb={1.5}>{year}</Typography>

              {goLiveItems.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="success.main" fontWeight={600} mb={1}>
                    {t("reports.roadmap.goLive")}
                  </Typography>
                  <Stack spacing={1} mb={2}>
                    {goLiveItems.map((item) => (
                      <Stack key={`${item.id}-go`} direction="row" spacing={2} alignItems="center"
                        sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, py: 0.5, px: 1, borderRadius: 1 }}
                        onClick={() => navigate(`/systems?id=${item.id}`)}>
                        <Chip label={item.goLive} size="small" color="success" />
                        <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
                        {item.department && <Typography variant="caption" color="text.secondary">{item.department}</Typography>}
                      </Stack>
                    ))}
                  </Stack>
                </>
              )}

              {retirementItems.length > 0 && (
                <>
                  {goLiveItems.length > 0 && <Divider sx={{ my: 1 }} />}
                  <Typography variant="subtitle2" color="error.main" fontWeight={600} mb={1}>
                    {t("reports.roadmap.retirement")}
                  </Typography>
                  <Stack spacing={1}>
                    {retirementItems.map((item) => (
                      <Stack key={`${item.id}-ret`} direction="row" spacing={2} alignItems="center"
                        sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, py: 0.5, px: 1, borderRadius: 1 }}
                        onClick={() => navigate(`/systems?id=${item.id}`)}>
                        <Chip label={item.retirement} size="small" color="error" />
                        <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
                        {item.department && <Typography variant="caption" color="text.secondary">{item.department}</Typography>}
                      </Stack>
                    ))}
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};

export default ReportRoadmap;
