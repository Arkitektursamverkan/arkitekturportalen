import React, { useState } from "react";
import {
  Box, Chip, CircularProgress, Container, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useMySurveys } from "@/api/mySurveys";
import type { SurveyResponseSummary } from "@/api/surveys";

type ChipColor = "default" | "warning" | "success" | "secondary" | "info";

// A response's state is really a small trail of milestones, not one flat
// status — e.g. a reviewed answer on a repeatable survey is simultaneously
// "Skickat in", "Granskat" AND still "Öppet för fler svar", so it's shown as
// several chips together rather than picking just one label.
function statusChips(r: SurveyResponseSummary): { label: string; color: ChipColor }[] {
  if (r.status === "draft") return [{ label: "Ej publicerad", color: "default" }];

  const closed = r.survey_status === "closed";

  if (r.status === "pending") {
    if (closed) {
      return [
        { label: "Svar ej skickat", color: "default" },
        { label: "Avslutat", color: "default" },
      ];
    }
    return [{ label: "Väntar på svar", color: "warning" }];
  }

  const chips: { label: string; color: ChipColor }[] = [{ label: "Skickat in", color: "success" }];
  if (r.status === "reviewed") {
    chips.push({ label: "Granskat", color: "secondary" });
    if (r.allow_multiple_responses && r.survey_status === "open") {
      chips.push({ label: "Öppet för fler svar", color: "info" });
    }
  }
  if (closed) {
    chips.push({ label: "Avslutat", color: "default" });
  }
  return chips;
}

const isOverdue = (r: SurveyResponseSummary) =>
  r.status === "pending" &&
  r.survey_status === "open" &&
  Boolean(r.survey_due_date) &&
  new Date(r.survey_due_date as string) < new Date(new Date().toDateString());

const DueDateCell: React.FC<{ r: SurveyResponseSummary }> = ({ r }) => {
  if (!r.survey_due_date) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }
  const formatted = new Date(r.survey_due_date).toLocaleDateString("sv-SE");
  if (isOverdue(r)) {
    return (
      <Typography variant="body2" color="error" fontWeight={600}>
        {formatted}
      </Typography>
    );
  }
  return <Typography variant="body2" color="text.secondary">{formatted}</Typography>;
};

const SurveyTable: React.FC<{
  rows: SurveyResponseSummary[];
  emptyMessage: string;
  onOpen: (id: string) => void;
}> = ({ rows, emptyMessage, onOpen }) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 700 }}>Enkät</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>Applikation</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>Besvaras senast</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => onOpen(r.id)}>
            {/* Slumpenkäter never reach this list — the API filters them out. */}
            <TableCell>{r.survey_title}</TableCell>
            <TableCell>{r.node_name ?? "—"}</TableCell>
            <TableCell><DueDateCell r={r} /></TableCell>
            <TableCell>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {statusChips(r).map((c) => (
                  <Chip key={c.label} size="small" label={c.label} color={c.color} />
                ))}
              </Stack>
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} align="center" sx={{ py: 4, color: "text.secondary" }}>
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>
);

const STEPS: { title: string; text: string }[] = [
  { title: "Öppna", text: "Klicka på en enkät i listan nedan så öppnas frågorna." },
  { title: "Svara", text: "Besvara frågorna direkt i webbläsaren. Det tar oftast bara några minuter." },
  { title: "Skicka in", text: "Klicka på Skicka in när du är klar. Ditt svar går till den som skickade ut enkäten." },
];

const HowItWorks: React.FC = () => (
  <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
    <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Så går det till</Typography>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 3 }}>
      {STEPS.map((step, i) => (
        <Stack key={step.title} direction="row" spacing={1.5} sx={{ flex: 1 }} alignItems="flex-start">
          <Box
            sx={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              bgcolor: "primary.main", color: "primary.contrastText",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, mt: "1px",
            }}
          >
            {i + 1}
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600}>{step.title}</Typography>
            <Typography variant="body2" color="text.secondary">{step.text}</Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
  </Paper>
);

const MySurveys: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useMySurveys();
  const [tab, setTab] = useState(0);

  const current = (data ?? []).filter((r) => r.survey_status !== "closed");
  const closed = (data ?? []).filter((r) => r.survey_status === "closed");
  const waiting = current.filter((r) => r.status === "pending");

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Mina enkäter</Typography>
      <Typography variant="body1" color="text.secondary" mb={3} sx={{ maxWidth: 640 }}>
        Välkommen. Här samlas enkäter som är ställda till dig — till exempel i din roll som
        systemförvaltare eller systemägare. Dina svar hjälper oss att hålla bilden av
        organisationens IT-landskap aktuell.
      </Typography>

      <HowItWorks />

      {!isLoading && waiting.length > 0 && (
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Du har <strong>{waiting.length === 1 ? "1 enkät" : `${waiting.length} enkäter`}</strong> som
          väntar på svar.
        </Typography>
      )}

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Aktuella enkäter" />
          <Tab label={`Avslutade enkäter${closed.length > 0 ? ` (${closed.length})` : ""}`} />
        </Tabs>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      ) : tab === 0 ? (
        <SurveyTable
          rows={current}
          emptyMessage="Du har inga enkäter att besvara just nu. När en enkät ställs till dig dyker den upp här."
          onOpen={(id) => navigate(`/my-surveys/${id}`)}
        />
      ) : (
        <SurveyTable
          rows={closed}
          emptyMessage="Inga avslutade enkäter ännu."
          onOpen={(id) => navigate(`/my-surveys/${id}`)}
        />
      )}
    </Container>
  );
};

export default MySurveys;
