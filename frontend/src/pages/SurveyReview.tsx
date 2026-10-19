import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import { useNavigate, useParams } from "react-router-dom";
import { downloadSurveyResponsesCsv, useReviewResponse, useSurvey, useSurveyResponses } from "@/api/surveys";
import { useEdges, useCreateEdge } from "@/api/edges";
import { useNodes } from "@/api/nodes";
import { renderSurveyText } from "@/utils/surveyVariables";
import type { Question, SurveyResponseSummary } from "@/api/surveys";

const fmtAvg = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 1 });

function matrixValues(response: SurveyResponseSummary, questionId: string): Record<string, number> {
  const value = response.answers?.[questionId];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, number>)
    : {};
}

/**
 * Aggregated averages for one rating-matrix question: one line per system
 * (a system can have many responses, e.g. slumpenkäter), with the average
 * per parameter and a combined average where every parameter weighs equally.
 */
const MatrixSummaryTable: React.FC<{
  question: Question;
  responses: SurveyResponseSummary[];
}> = ({ question, responses }) => {
  const rows = (question.rows ?? []).filter(Boolean);
  if (rows.length === 0) return null;

  const groups = new Map<string, { label: string; responses: SurveyResponseSummary[] }>();
  for (const r of responses) {
    const key = r.node_id ?? "__none__";
    const group = groups.get(key) ?? { label: r.node_name ?? "Utan applikation", responses: [] };
    group.responses.push(r);
    groups.set(key, group);
  }

  const averages = (rs: SurveyResponseSummary[]) => {
    const perRow = rows.map((row) => {
      const values = rs
        .map((r) => matrixValues(r, question.id)[row])
        .filter((v): v is number => typeof v === "number");
      return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    });
    const present = perRow.filter((v): v is number => v !== null);
    const overall = present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
    return { perRow, overall };
  };

  const grouped = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "sv"));
  const total = averages(responses);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {renderSurveyText(question.label, { system_name: "applikationen" })}
      </Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Applikation</TableCell>
              {rows.map((row) => (
                <TableCell key={row} align="right" sx={{ fontWeight: 700 }}>{row}</TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 700 }}>Snitt</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Antal svar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grouped.map((g) => {
              const { perRow, overall } = averages(g.responses);
              return (
                <TableRow key={g.label}>
                  <TableCell>{g.label}</TableCell>
                  {perRow.map((avg, i) => (
                    <TableCell key={rows[i]} align="right">{avg !== null ? fmtAvg(avg) : "–"}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {overall !== null ? fmtAvg(overall) : "–"}
                  </TableCell>
                  <TableCell align="right">{g.responses.length}</TableCell>
                </TableRow>
              );
            })}
            {grouped.length > 1 && (
              <TableRow sx={{ "& td": { borderTop: "2px solid", borderTopColor: "divider" } }}>
                <TableCell sx={{ fontWeight: 700 }}>Alla applikationer</TableCell>
                {total.perRow.map((avg, i) => (
                  <TableCell key={rows[i]} align="right" sx={{ fontWeight: 700 }}>
                    {avg !== null ? fmtAvg(avg) : "–"}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {total.overall !== null ? fmtAvg(total.overall) : "–"}
                </TableCell>
                <TableCell align="right">{responses.length}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const SurveyReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: survey } = useSurvey(id);
  const { data: responses, isLoading } = useSurveyResponses(id);
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges({ edge_type: "INTEGRATES_WITH" });
  const createEdge = useCreateEdge();
  const reviewResponse = useReviewResponse(id ?? "");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const nodeName = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n.name]));
    return (nodeId: string) => byId.get(nodeId) ?? nodeId;
  }, [nodes]);

  const edgeExists = (a: string, b: string) =>
    edges.some((e) => (e.source_id === a && e.target_id === b) || (e.source_id === b && e.target_id === a));

  if (isLoading || !survey || !id) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  const systemPickerQuestions = survey.questions.filter((q) => q.type === "system_picker");
  const matrixQuestions = survey.questions.filter((q) => q.type === "rating_matrix");
  const reviewable = (responses ?? []).filter((r) => r.status === "submitted" || r.status === "reviewed");

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/surveys/${id}`)}>Tillbaka</Button>
        <Typography variant="h4" fontWeight={700}>Granska svar — {survey.title}</Typography>
        <Tooltip title="Laddar ner alla inskickade och granskade svar som en CSV-fil (öppnas i Excel)">
          <span style={{ marginLeft: "auto" }}>
            <Button
              startIcon={<DownloadIcon />}
              variant="outlined"
              disabled={reviewable.length === 0 || exporting}
              onClick={async () => {
                setExporting(true);
                setExportError(null);
                try {
                  await downloadSurveyResponsesCsv(id);
                } catch {
                  setExportError("Exporten misslyckades. Försök igen.");
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "Exporterar…" : "Exportera svar"}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}

      {reviewable.length === 0 && (
        <Typography variant="body2" color="text.secondary">Inga inskickade svar att granska ännu.</Typography>
      )}

      {matrixQuestions.length > 0 && reviewable.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Samlad bedömning</Typography>
          {matrixQuestions.map((q) => (
            <MatrixSummaryTable key={q.id} question={q} responses={reviewable} />
          ))}
        </Paper>
      )}

      <Stack spacing={2}>
        {reviewable.map((response) => (
          <Paper key={response.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {response.node_name ?? response.assigned_user_name ?? "Manuell mottagare"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Svarat av {response.submitted_by ?? "okänd"} {response.submitted_at && new Date(response.submitted_at).toLocaleString("sv-SE")}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={response.status === "reviewed" ? "Granskad" : "Väntar granskning"}
                color={response.status === "reviewed" ? "success" : "warning"}
              />
            </Stack>

            {systemPickerQuestions.length > 0 && response.node_id && (
              <Box sx={{ mt: 1.5 }}>
                {systemPickerQuestions.map((q) => {
                  const picked = (response.answers?.[q.id] as string[] | undefined) ?? [];
                  if (picked.length === 0) return null;
                  const nodeId = response.node_id as string;
                  return (
                    <Box key={q.id} sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {renderSurveyText(q.label, { system_name: response.node_name ?? "" })}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {picked.map((pickedId) => {
                          const exists = edgeExists(nodeId, pickedId);
                          return (
                            <Stack key={pickedId} direction="row" spacing={0.5} alignItems="center">
                              <Chip
                                label={`${response.node_name} ↔ ${nodeName(pickedId)}`}
                                variant={exists ? "filled" : "outlined"}
                                color={exists ? "default" : "primary"}
                              />
                              {exists ? (
                                <Typography variant="caption" color="text.secondary">Finns redan</Typography>
                              ) : (
                                <Button
                                  size="small"
                                  onClick={() => createEdge.mutateAsync({
                                    source_id: nodeId,
                                    target_id: pickedId,
                                    type: "INTEGRATES_WITH",
                                    // The survey asks "which systems does this
                                    // one exchange data with" — both ways.
                                    direction: "BIDIRECTIONAL",
                                  })}
                                >
                                  Skapa integration
                                </Button>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}
              </Box>
            )}

            {Object.entries(response.answers ?? {})
              .filter(([qid]) => !systemPickerQuestions.some((q) => q.id === qid))
              .map(([qid, value]) => {
                const question = survey.questions.find((q) => q.id === qid);
                if (!question) return null;
                const label = renderSurveyText(question.label, { system_name: response.node_name ?? "" });
                if (question.type === "rating_matrix") {
                  const filled = matrixValues(response, qid);
                  const rated = (question.rows ?? []).filter((row) => typeof filled[row] === "number");
                  const avg = rated.length
                    ? rated.reduce((sum, row) => sum + filled[row], 0) / rated.length
                    : null;
                  return (
                    <Box key={qid} sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">
                        {rated.map((row) => `${row}: ${filled[row]}`).join(" · ") || "—"}
                        {avg !== null && rated.length > 1 ? ` — snitt ${fmtAvg(avg)}` : ""}
                      </Typography>
                    </Box>
                  );
                }
                return (
                  <Box key={qid} sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{Array.isArray(value) ? value.join(", ") : String(value)}</Typography>
                  </Box>
                );
              })}

            {response.status !== "reviewed" && (
              <Box sx={{ mt: 2 }}>
                <Button size="small" variant="contained" onClick={() => reviewResponse.mutateAsync(response.id)}>
                  Markera som granskad
                </Button>
              </Box>
            )}
          </Paper>
        ))}
      </Stack>
    </Container>
  );
};

export default SurveyReview;
