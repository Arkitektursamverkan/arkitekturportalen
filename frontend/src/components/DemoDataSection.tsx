import { Alert, Button, CircularProgress } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useTranslation } from "react-i18next";
import { useSeedDatabase, useSeedStatus } from "@/api/import";

/** Demo data is fictional, so the backend only loads it while there are no nodes. */
export default function DemoDataSection() {
  const { t } = useTranslation();
  const status = useSeedStatus();
  const seed = useSeedDatabase();
  const available = status.data?.available === true;

  return (
    <>
      {seed.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{t("home.seed.success")}</Alert>}
      {seed.isError && <Alert severity="error" sx={{ mb: 2 }}>{t("home.seed.error")}</Alert>}
      {status.data && !seed.isSuccess && (
        <Alert severity={available ? "info" : "warning"} sx={{ mb: 2 }}>
          {t(available ? "home.seed.available" : "home.seed.unavailable")}
        </Alert>
      )}
      <Button
        variant="outlined"
        startIcon={seed.isPending ? <CircularProgress size={16} /> : <DownloadIcon />}
        disabled={!available || seed.isPending}
        onClick={() => seed.mutate()}
      >
        {t(seed.isPending ? "home.seed.loading" : "home.seed.button")}
      </Button>
    </>
  );
}
