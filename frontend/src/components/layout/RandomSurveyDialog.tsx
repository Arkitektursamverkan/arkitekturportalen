import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useRandomSurveyStore } from "@/store/randomSurveyStore";

/**
 * Offers the login-triggered random-system survey ("slumpenkät"). The
 * backend rolls the dice once per login session (UserSync) and the winning
 * offer lands in randomSurveyStore. Postponing just closes the dialog — the
 * response slot stays pending and may be re-offered on a later login until
 * answered, but it never shows up under Mina enkäter: this dialog is the
 * only way the user ever sees a slumpenkät.
 */
const RandomSurveyDialog: React.FC = () => {
  const navigate = useNavigate();
  const offer = useRandomSurveyStore((s) => s.offer);
  const clearOffer = useRandomSurveyStore((s) => s.clearOffer);

  if (!offer) return null;

  return (
    <Dialog open onClose={clearOffer} maxWidth="xs" fullWidth>
      <DialogTitle>Hjälp oss förbättra IT-landskapet</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {offer.node_name
            ? `Vi har slumpat fram applikationen ${offer.node_name} till dig. Vill du svara på några snabba frågor i enkäten "${offer.survey_title}"?`
            : `Vill du svara på några snabba frågor i enkäten "${offer.survey_title}"?`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button fullWidth onClick={clearOffer}>
          Skjut upp
        </Button>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            const id = offer.id;
            clearOffer();
            navigate(`/my-surveys/${id}`);
          }}
        >
          Svara nu
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RandomSurveyDialog;
