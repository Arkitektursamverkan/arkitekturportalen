import React from "react";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import AuditLogPanel from "@/components/AuditLogPanel";

const AuditLog: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: "auto" }}>
      <Typography variant="h5" sx={{ mb: 2 }}>{t("auditLog.title")}</Typography>
      <AuditLogPanel />
    </Box>
  );
};

export default AuditLog;
