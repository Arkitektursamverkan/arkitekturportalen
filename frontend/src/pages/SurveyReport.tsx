import React, { useState } from "react";
import {
  Alert, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Snackbar, Stack, TextField, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import PublishIcon from "@mui/icons-material/Publish";
import { useNavigate, useParams } from "react-router-dom";
import { downloadSurveyReport, useSurveyReport } from "@/api/surveys";
import { usePublishReport } from "@/api/publishedReports";
import ReportBody from "@/components/survey/ReportBody";

/**
 * One compiled report: the questions tagged with this report's number plus the
 * ones its conditions select on, for the responses that meet those conditions.
 * All of it is set up in the survey editor and can be changed after the survey
 * has been published — publishing an edition freezes a copy under "Rapporter".
 */
const SurveyReport: React.FC = () => {
  const { id, number } = useParams<{ id: string; number: string }>();
  const navigate = useNavigate();
  const reportNumber = Number(number);
  const { data: report, isLoading, isError } = useSurveyReport(id, reportNumber);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const publish = usePublishReport();

  const download = async (format: "csv" | "pdf") => {
    if (!id) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadSurveyReport(id, reportNumber, format);
    } catch {
      setDownloadError("Nedladdningen misslyckades. Försök igen.");
    } finally {
      setDownloading(null);
    }
  };

  const openPublish = () => {
    setPublishName(report?.name ?? "");
    setPublishOpen(true);
  };

  const doPublish = async () => {
    if (!id) return;
    try {
      const created = await publish.mutateAsync({
        surveyId: id, number: reportNumber, name: publishName.trim() || undefined,
      });
      setPublishOpen(false);
      setPublishedId(created.id);
    } catch {
      setDownloadError("Rapporten kunde inte publiceras. Försök igen.");
    }
  };

  if (isLoading || !id) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (isError || !report) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/surveys/${id}`)}>Tillbaka</Button>
        <Alert severity="error" sx={{ mt: 2 }}>Rapporten kunde inte hämtas.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", mb: 1, flexWrap: "wrap" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/surveys/${id}`)}>Tillbaka</Button>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>{report.name}</Typography>
        <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
          <Button
            startIcon={<PublishIcon />}
            variant="contained"
            disabled={publish.isPending}
            onClick={openPublish}
          >
            {publish.isPending ? "Publicerar…" : "Publicera"}
          </Button>
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
        </Stack>
      </Stack>

      <Typography variant="body2" gutterBottom sx={{ color: "text.secondary" }}>
        {report.survey_title} — {report.matching_count} av {report.answered_count} inkomna svar
      </Typography>

      {downloadError && <Alert severity="error" sx={{ my: 2 }}>{downloadError}</Alert>}

      <ReportBody report={report} />

      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Publicera rapport</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Rapporten fryses som den ser ut nu — {report.matching_count} av {report.answered_count}{" "}
            inkomna svar — och hamnar under Rapporter, i mappen för enkäter, med dagens datum.
            Svar som kommer in senare ändrar inte den publicerade upplagan; publicera
            igen när du vill ha en ny.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Rapportnamn"
            value={publishName}
            onChange={(e) => setPublishName(e.target.value)}
            helperText="Visas i menyn tillsammans med publiceringsdatum."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishOpen(false)}>Avbryt</Button>
          <Button variant="contained" onClick={doPublish} disabled={publish.isPending}>
            Publicera
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={publishedId !== null}
        autoHideDuration={8000}
        onClose={() => setPublishedId(null)}
        message="Rapporten är publicerad"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => navigate(`/reports/published/${publishedId}`)}
          >
            Visa
          </Button>
        }
      />
    </Container>
  );
};

export default SurveyReport;
