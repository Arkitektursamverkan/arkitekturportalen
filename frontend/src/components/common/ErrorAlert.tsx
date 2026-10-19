import React from "react";
import { Alert, AlertTitle, Button } from "@mui/material";
import { useTranslation } from "react-i18next";

interface Props {
  error: Error | string | null;
  onRetry?: () => void;
}

const ErrorAlert: React.FC<Props> = ({ error, onRetry }) => {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error ?? t("common.error"));
  return (
    <Alert
      severity="error"
      action={onRetry && <Button size="small" onClick={onRetry}>Retry</Button>}
    >
      <AlertTitle>{t("common.error")}</AlertTitle>
      {message}
    </Alert>
  );
};

export default ErrorAlert;
