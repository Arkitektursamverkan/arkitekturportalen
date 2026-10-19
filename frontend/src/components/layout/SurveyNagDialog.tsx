import React, { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useMySurveys } from "@/api/mySurveys";

/**
 * Nags the user with a blocking-ish popup every time they open the app while
 * a survey response is still pending — the reminder keeps coming back for as
 * long as the survey is unanswered. Fires once per app load (not on every
 * in-app navigation), and answering the survey or the survey closing stops it.
 */
const SurveyNagDialog: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: mySurveys } = useMySurveys();
  const [nagResponseId, setNagResponseId] = useState<string | null>(null);
  const [checkedThisLoad, setCheckedThisLoad] = useState(false);

  useEffect(() => {
    if (!mySurveys || checkedThisLoad) return;
    setCheckedThisLoad(true);

    // Random-system surveys ("slumpenkäter") have their own login-triggered
    // dialog (RandomSurveyDialog) and are never nagged about here — the API
    // already keeps them out of this list.
    const pending = mySurveys.filter(
      (r) => r.status === "pending" && r.survey_status === "open" && r.survey_kind !== "random_system",
    );

    // Don't pop up the nag if they've already navigated to their surveys.
    if (pending.length > 0 && !location.pathname.startsWith("/my-surveys")) {
      setNagResponseId(pending[0].id);
    }
  }, [mySurveys, checkedThisLoad, location.pathname]);

  if (!nagResponseId) return null;

  const survey = mySurveys?.find((r) => r.id === nagResponseId);

  return (
    <Dialog open onClose={() => setNagResponseId(null)} maxWidth="xs" fullWidth>
      <DialogTitle>Du har en enkät att fylla i</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {survey
            ? `"${survey.survey_title}" för ${survey.node_name} väntar på ditt svar.`
            : "En enkät väntar på ditt svar."}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            const id = nagResponseId;
            setNagResponseId(null);
            navigate(`/my-surveys/${id}`);
          }}
        >
          Ta mig till enkäten
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SurveyNagDialog;
