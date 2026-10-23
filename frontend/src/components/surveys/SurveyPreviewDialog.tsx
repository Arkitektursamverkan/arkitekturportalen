import React, { useMemo, useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography,
} from "@mui/material";
import type { AnswerValue, SurveyAnswers } from "@/api/mySurveys";
import type { Question } from "@/api/surveys";
import QuestionField from "@/components/surveys/QuestionField";
import { computeVisiblePath } from "@/utils/surveyFlow";

/**
 * Shows the survey form exactly as a respondent will see it — including
 * branching, which reacts to the test answers filled in here. Nothing is
 * saved; the preview always reflects the editor's current (possibly
 * unsaved) state so admins can check the form before opening the survey.
 */
const SurveyPreviewDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  questions: Question[];
  systemName?: string;
}> = ({ open, onClose, title, description, questions, systemName = "Exempelapplikationen" }) => {
  const [answers, setAnswers] = useState<SurveyAnswers>({});

  const { visibleIds, ended } = useMemo(
    () => computeVisiblePath(questions, answers),
    [questions, answers],
  );
  const visibleQuestions = questions.filter((q) => visibleIds.includes(q.id));
  const setAnswer = (qid: string, value: AnswerValue) => setAnswers((a) => ({ ...a, [qid]: value }));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Förhandsgranska formulär</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Så här ser formuläret ut för mottagaren. Provklicka gärna — förgreningar följer dina
          testsvar och ingenting sparas.
        </Alert>

        <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{title || "Namnlös enkät"}</Typography>
        {description && (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>{description}</Typography>
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Applikation: {systemName}</Typography>

        <Stack spacing={2}>
          {visibleQuestions.map((q) => (
            <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
              <QuestionField
                question={q}
                value={answers[q.id]}
                disabled={false}
                nodeId={undefined}
                variableValues={{ system_name: systemName }}
                onChange={(v) => setAnswer(q.id, v)}
              />
            </Paper>
          ))}
          {visibleQuestions.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Inga frågor ännu — lägg till frågor i redigeraren för att se dem här.
            </Typography>
          )}
        </Stack>

        {ended && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Baserat på testsvaren är det inte fler frågor att besvara — här kan mottagaren skicka in.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAnswers({})} disabled={Object.keys(answers).length === 0}>
          Rensa testsvar
        </Button>
        <Button variant="contained" onClick={onClose}>Stäng</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SurveyPreviewDialog;
