import React, { useState } from "react";
import {
  Alert, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useNavigate, useParams } from "react-router-dom";
import {
  downloadPublishedReport, publishedDate, useDeletePublishedReport, usePublishedReport,
} from "@/api/publishedReports";
import ReportBody from "@/components/survey/ReportBody";
import { useRoleStore } from "@/store/roleStore";

/**
 * A published edition of a survey report. Everything shown here comes from the
 * copy frozen at publication — later answers, renamed reports and changed
 * conditions do not reach back into it.
 */
const PublishedReport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isEditor } = useRoleStore();
  const { data: published, isLoading, isError } = usePublishedReport(id);
  const remove = useDeletePublishedReport();
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const download = async (format: "csv" | "pdf") => {
    if (!id) return;
    setDownloading(format);
    setError(null);
    try {
      await downloadPublishedReport(id, format);
    } catch {
      setError("Nedladdningen misslyckades. Försök igen.");
    } finally {
      setDownloading(null);
    }
  };

  const unpublish = async () => {
    if (!id) return;
    try {
      await remove.mutateAsync(id);
      navigate("/surveys");
    } catch {
      setError("Rapporten kunde inte avpubliceras.");
      setConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (isError || !published) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Den publicerade rapporten kunde inte hämtas.</Alert>
      </Container>
    );
  }

  const report = published.payload;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1} flexWrap="wrap" useFlexGap>
        <Typography variant="h4" fontWeight={700}>{published.name}</Typography>
        <Chip size="small" label={publishedDate(published.published_at)} />
        <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
          {published.survey_id && (
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(`/surveys/${published.survey_id}/reports/${published.report_number}`)}
            >
              Till enkäten
            </Button>
          )}
          <Button
            startIcon={<DownloadIcon />}
            variant="outlined"
            disabled={downloading !== null || report.rows.length === 0}
            onClick={() => download("csv")}
          >
            {downloading === "csv" ? "Laddar ner…" : "CSV"}
          </Button>
          <Button
            startIcon={<PictureAsPdfIcon />}
            variant="outlined"
            disabled={downloading !== null || report.rows.length === 0}
            onClick={() => download("pdf")}
          >
            {downloading === "pdf" ? "Laddar ner…" : "PDF"}
          </Button>
          {isEditor && (
            <Button
              startIcon={<DeleteIcon />}
              color="error"
              onClick={() => setConfirmOpen(true)}
            >
              Avpublicera
            </Button>
          )}
        </Stack>
      </Stack>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        {published.survey_title} — {report.matching_count} av {report.answered_count} inkomna svar,
        publicerad {publishedDate(published.published_at)}
        {published.published_by && ` av ${published.published_by}`}
      </Typography>

      <Alert severity="info" sx={{ my: 2 }}>
        Det här är en publicerad upplaga — innehållet är fryst som det såg ut{" "}
        {publishedDate(published.published_at)}. Svar som kommit in senare syns i enkätens
        egen rapport, inte här.
      </Alert>

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      <ReportBody report={report} />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Avpublicera rapporten?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Upplagan tas bort från Rapporter. Enkäten och svaren påverkas inte, och du kan
            publicera en ny upplaga när som helst.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Avbryt</Button>
          <Button color="error" variant="contained" onClick={unpublish} disabled={remove.isPending}>
            Avpublicera
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PublishedReport;
