import React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface Props {
  message?: string;
  height?: string | number;
}

const LoadingSpinner: React.FC<Props> = ({ message, height = "100%" }) => {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: height, gap: 2 }}>
      <CircularProgress />
      {message && <Typography variant="body2" sx={{ color: "text.secondary" }}>{message}</Typography>}
      {!message && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("common.loading")}</Typography>}
    </Box>
  );
};

export default LoadingSpinner;
