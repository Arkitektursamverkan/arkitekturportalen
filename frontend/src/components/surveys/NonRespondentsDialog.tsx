import React, { useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import { triggerDownload } from "@/api/targetArchitecture";
import { nonRespondentEmails, nonRespondentsCsv, type NonRespondent } from "@/utils/surveyNonRespondents";

interface Props {
  open: boolean;
  onClose: () => void;
  surveyTitle: string;
  people: NonRespondent[];
  /** How many people have been sent the survey in total. */
  sentCount: number;
}

function fileName(title: string): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `inte-svarat-${slug || "enkat"}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** Who has been sent the survey and not answered yet — for reminders. */
const NonRespondentsDialog: React.FC<Props> = ({ open, onClose, surveyTitle, people, sentCount }) => {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const emails = nonRespondentEmails(people);
  // Only worth a column when some row is about an object (not a general send-out).
  const showObjects = people.some((p) => p.objects.length > 0 || p.sent > 1);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(emails);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const close = () => {
    setCopyState("idle");
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Inte svarat</DialogTitle>
      <DialogContent>
        {sentCount === 0 ? (
          <Alert severity="warning">
            Enkäten är inte utskickad till någon ännu. Lansera till mottagarna först.
          </Alert>
        ) : people.length === 0 ? (
          <Alert severity="success">
            Alla {sentCount} som fått enkäten har svarat.
          </Alert>
        ) : (
          <>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              {people.length} av {sentCount} som fått enkäten har inte svarat
              {showObjects ? " på allt" : ""}. Den som inte fått enkäten utskickad är inte med.
            </Typography>
            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Namn</TableCell>
                    <TableCell>E-post</TableCell>
                    {showObjects && <TableCell>Obesvarade</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {people.map((p) => (
                    <TableRow key={p.userId}>
                      <TableCell>{p.name || "—"}</TableCell>
                      <TableCell>{p.email || "—"}</TableCell>
                      {showObjects && (
                        <TableCell>
                          {p.unanswered} av {p.sent}
                          {p.objects.length > 0 && (
                            <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
                              {" – "}{p.objects.join(", ")}
                            </Typography>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {copyState === "copied" && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Adresserna är kopierade, separerade med semikolon – klistra in i Till-fältet i Outlook.
              </Alert>
            )}
            {copyState === "failed" && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Webbläsaren tillät inte kopiering. Ladda ner listan i stället.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Stäng</Button>
        <Button
          startIcon={<DownloadIcon />}
          disabled={people.length === 0}
          onClick={() => triggerDownload(new Blob([nonRespondentsCsv(people)], { type: "text/csv;charset=utf-8" }), fileName(surveyTitle))}
        >
          Ladda ner lista (CSV)
        </Button>
        <Button variant="contained" startIcon={<ContentCopyIcon />} disabled={!emails} onClick={copy}>
          {copyState === "copied" ? "Kopierat" : "Kopiera e-postadresser"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NonRespondentsDialog;
