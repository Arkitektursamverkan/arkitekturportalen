import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Button, CircularProgress, Container, Paper, Stack, Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useNavigate, useParams } from "react-router-dom";
import {
  useMySurveyResponse, useMySurveys, useSubmitAnswers, type AnswerValue, type SurveyAnswers,
} from "@/api/mySurveys";
import QuestionField from "@/components/surveys/QuestionField";
import { computeVisiblePath } from "@/utils/surveyFlow";

const SurveyRespond: React.FC = () => {
  const { responseId } = useParams<{ responseId: string }>();
  const navigate = useNavigate();
  const { data: response, isLoading } = useMySurveyResponse(responseId);
  const { data: mySurveys } = useMySurveys();
  const submit = useSubmitAnswers(responseId ?? "");

  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [error, setError] = useState<string | null>(null);
  // Which response the thank-you view belongs to. Chaining to the next survey
  // keeps this route mounted, so tying it to an id — rather than a plain
  // boolean — makes the new survey start clean without a flash of the old
  // thank-you screen.
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const submitted = submittedId !== null && submittedId === responseId;

  // Answering one survey chains straight into the next unanswered one, so the
  // user works through the whole pile in one sitting instead of going back to
  // the list between each. Submitting invalidates the my-surveys list, so by
  // the time the thank-you view times out this holds fresh data — the current
  // response is filtered out explicitly in case the refetch is still in flight.
  const otherPending = useMemo(
    () =>
      (mySurveys ?? []).filter(
        (r) => r.id !== responseId && r.status === "pending" && r.survey_status === "open",
      ),
    [mySurveys, responseId],
  );
  const nextPending = otherPending[0];

  // Read at timeout time, so a refetch landing mid-countdown doesn't restart it.
  const nextPendingId = useRef<string | undefined>(undefined);
  nextPendingId.current = nextPending?.id;

  // The route stays mounted when chaining to the next response — clear the
  // previous survey's answers and error so nothing bleeds into the new one.
  useEffect(() => {
    setAnswers({});
    setError(null);
  }, [responseId]);

  useEffect(() => {
    if (response) setAnswers(response.answers ?? {});
  }, [response]);

  // After a successful submit: show the thank-you view for a few seconds,
  // then open the next unanswered survey — or return to the overview when
  // this was the last one.
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => {
      const next = nextPendingId.current;
      navigate(next ? `/my-surveys/${next}` : "/my-surveys");
    }, 3000);
    return () => clearTimeout(timer);
  }, [submitted, responseId, navigate]);

  const { visibleIds, ended } = useMemo(
    () => computeVisiblePath(response?.questions ?? [], answers),
    [response, answers],
  );

  if (isLoading || !response || !responseId) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: "center" }}>
        <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Tack för ditt svar!
        </Typography>
        {nextPending ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Du har {otherPending.length === 1 ? "1 enkät" : `${otherPending.length} enkäter`} kvar
              att besvara.{" "}
              {nextPending.node_name
                ? `Nästa gäller ${nextPending.node_name} och öppnas automatiskt…`
                : "Nästa öppnas automatiskt…"}
            </Typography>
            <Button sx={{ mt: 2 }} onClick={() => navigate("/my-surveys")}>
              Avbryt och gå till Mina enkäter
            </Button>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Du skickas nu tillbaka till Mina enkäter…
          </Typography>
        )}
      </Container>
    );
  }

  const surveyClosed = response.survey_status === "closed";
  const lockedByReview = response.status === "reviewed" && !response.allow_multiple_responses;
  const readOnly = surveyClosed || lockedByReview;
  const setAnswer = (qid: string, value: AnswerValue) => setAnswers((a) => ({ ...a, [qid]: value }));

  const visibleQuestions = response.questions.filter((q) => visibleIds.includes(q.id));

  const handleSubmit = async () => {
    setError(null);
    for (const q of visibleQuestions) {
      if (!q.required) continue;
      const value = answers[q.id];
      if (q.type === "rating_matrix") {
        const rows = (q.rows ?? []).filter(Boolean);
        const filled = (value as Record<string, number> | undefined) ?? {};
        if (rows.some((row) => filled[row] === undefined)) {
          setError(`Fältet "${q.label}" är obligatoriskt — gradera alla parametrar`);
          return;
        }
        continue;
      }
      const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
      if (empty) {
        setError(`Fältet "${q.label}" är obligatoriskt`);
        return;
      }
    }
    try {
      await submit.mutateAsync(answers);
      setSubmittedId(responseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>{response.survey_title}</Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>{response.survey_description}</Typography>
      {response.survey_due_date && !surveyClosed && (
        <Typography variant="body2" color="text.secondary" mb={1}>
          Besvaras senast <strong>{new Date(response.survey_due_date).toLocaleDateString("sv-SE")}</strong>.
        </Typography>
      )}
      {response.node_name && (
        <Typography variant="subtitle1" fontWeight={600} mb={3}>Applikation: {response.node_name}</Typography>
      )}

      {surveyClosed && (
        <Alert severity="info" sx={{ mb: 3 }}>Enkäten är stängd och tar inte längre emot svar.</Alert>
      )}
      {lockedByReview && !surveyClosed && (
        <Alert severity="info" sx={{ mb: 3 }}>Det här svaret är granskat och kan inte längre ändras.</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Stack spacing={2}>
        {visibleQuestions.map((q) => (
          <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
            <QuestionField
              question={q}
              value={answers[q.id]}
              disabled={readOnly}
              nodeId={response.node_id ?? undefined}
              variableValues={{ system_name: response.node_name ?? "" }}
              onChange={(v) => setAnswer(q.id, v)}
            />
          </Paper>
        ))}
      </Stack>

      {ended && !readOnly && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Baserat på dina svar är det inte fler frågor att besvara — du kan skicka in nu.
        </Alert>
      )}

      {!readOnly && (
        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button variant="contained" onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending ? "Skickar…" : "Skicka in svar"}
          </Button>
          <Button onClick={() => navigate("/my-surveys")}>Tillbaka till Mina enkäter</Button>
        </Stack>
      )}
    </Container>
  );
};

export default SurveyRespond;
