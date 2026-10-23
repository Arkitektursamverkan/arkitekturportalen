import React, { useMemo } from "react";
import { Alert, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const AUTH_COLORS: Record<string, string> = { SSO: "#4caf50", SAML: "#2196f3", LDAP: "#ff9800", Local: "#e53935", OAuth: "#9c27b0" };

const ReportAuth: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();

  const { rows, hasData, methodCounts } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const result = apps.map((app) => ({
      id: app.id, name: app.name,
      authMethod: String(app.attributes?.auth_method || ""),
      mfaEnabled: String(app.attributes?.mfa_enabled || "").toLowerCase(),
    }));
    result.sort((a, b) => a.name.localeCompare(b.name));

    const counts: Record<string, number> = {};
    for (const r of result) {
      const m = r.authMethod || t("reports.auth.notSet");
      counts[m] = (counts[m] || 0) + 1;
    }

    return { rows: result, hasData: result.some((r) => r.authMethod), methodCounts: counts };
  }, [nodes, t]);

  const noSSOCount = rows.filter((r) => r.authMethod && r.authMethod !== "SSO" && r.authMethod !== "SAML").length;
  const noMFACount = rows.filter((r) => r.mfaEnabled !== "true" && r.mfaEnabled !== "yes").length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.auth.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.auth.description")}</Typography>

      {!hasData && <Alert severity="info" sx={{ mb: 3 }}>{t("reports.auth.hint")}</Alert>}

      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 3, flexWrap: "wrap" }}>
        {Object.entries(methodCounts).map(([method, count]) => (
          <Chip key={method} label={`${method}: ${count}`} size="small"
            sx={{ bgcolor: AUTH_COLORS[method] || "#757575", color: "#fff", fontWeight: 600 }} />
        ))}
        {hasData && noMFACount > 0 && <Chip label={`${noMFACount} utan MFA`} color="warning" size="small" />}
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.auth.application")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.auth.authMethod")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.auth.mfa")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const mfaOn = row.mfaEnabled === "true" || row.mfaEnabled === "yes" || row.mfaEnabled === "ja";
              return (
                <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${row.id}`)}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{row.name}</Typography></TableCell>
                  <TableCell>
                    {row.authMethod
                      ? <Chip label={row.authMethod} size="small" sx={{ bgcolor: AUTH_COLORS[row.authMethod] || "#757575", color: "#fff" }} />
                      : <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("reports.auth.notSet")}</Typography>}
                  </TableCell>
                  <TableCell>
                    {row.mfaEnabled && row.mfaEnabled !== "false" && row.mfaEnabled !== "no" && row.mfaEnabled !== "nej" && row.mfaEnabled !== ""
                      ? <Chip label={t("reports.auth.enabled")} size="small" color="success" />
                      : <Chip label={row.authMethod ? t("reports.auth.disabled") : t("reports.auth.notSet")} size="small" color={row.authMethod ? "error" : "default"} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportAuth;
