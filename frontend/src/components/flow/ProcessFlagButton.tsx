/**
 * The flag button of the process view.
 *
 * Two things a reader can say about a process, without being its owner:
 *
 *   - "The process diagram is wrong" – the picture does not show the process
 *     as it is documented. Offered on the diagram tab only.
 *   - "Deviation in the process" – what is done differs from what is
 *     documented. Offered on both the diagram and the graph tab.
 *
 * They are ordinary quality flags (`/nodes/{id}/flags`), so they show up in
 * the object panel and in the report of flagged objects, and an editor
 * answers them there. The button shows how many are raised on the process,
 * and the dialog lists them, so nobody flags the same thing twice.
 */
import { useState } from "react";
import {
  Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, FormLabel, IconButton, Radio, RadioGroup, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import FlagIcon from "@mui/icons-material/Flag";
import { useSnackbar } from "notistack";
import { useTranslation } from "react-i18next";
import { useCreateFlag, useNodeFlags } from "@/api/flags";
import { FLAG_COLORS, PROCESS_FLAG_TYPES, type FlagType } from "@/types/graph";

interface Props {
  nodeId: string;
  /** The flag types this tab offers. */
  types: FlagType[];
}

export default function ProcessFlagButton({ nodeId, types }: Props) {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const { data: flags = [] } = useNodeFlags(nodeId);
  const createFlag = useCreateFlag();
  const [open, setOpen] = useState(false);
  const [typ, setTyp] = useState<FlagType>(types[0]);
  const [text, setText] = useState("");

  // Only the flags this tab is about: a reader of the graph is not helped by
  // being told that the diagram is flagged as wrong.
  const flaggade = flags.filter((f) => PROCESS_FLAG_TYPES.includes(f.flag_type) && types.includes(f.flag_type));
  const vald = types.includes(typ) ? typ : types[0];

  const skicka = async () => {
    try {
      await createFlag.mutateAsync({ nodeId, flag_type: vald, description: text.trim() || null });
      enqueueSnackbar(t("flags.createSuccess"), { variant: "success" });
      setText("");
      setOpen(false);
    } catch {
      enqueueSnackbar(t("flags.createError"), { variant: "error" });
    }
  };

  return (
    <>
      <Tooltip
        title={
          flaggade.length
            ? `${t("flags.process.button")} · ${t("flags.process.count", { count: flaggade.length })}`
            : t("flags.process.button")
        }
      >
        <IconButton
          size="small"
          color="warning"
          onClick={() => setOpen(true)}
          sx={{ bgcolor: "background.paper" }}
          aria-label={t("flags.process.button")}
        >
          <Badge badgeContent={flaggade.length} color="warning" overlap="circular">
            <FlagIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("flags.process.dialogTitle")}</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 0.5 }}>
            <FormLabel>{t("flags.process.what")}</FormLabel>
            <RadioGroup value={vald} onChange={(e) => setTyp(e.target.value as FlagType)}>
              {types.map((ft) => (
                <FormControlLabel
                  key={ft}
                  value={ft}
                  control={<Radio size="small" />}
                  sx={{ alignItems: "flex-start", mt: 0.5 }}
                  label={
                    <Box sx={{ pt: 0.75 }}>
                      <Typography variant="body2">{t(`flags.types.${ft}`)}</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {t(`flags.process.help_${ft}`)}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            sx={{ mt: 2 }}
            label={t("flags.description")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("flags.process.descriptionPlaceholder")}
          />

          {flaggade.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                {t("flags.process.existing")}
              </Typography>
              <Stack spacing={0.75}>
                {flaggade.map((f) => (
                  <Box key={f.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip size="small" label={t(`flags.types.${f.flag_type}`)} color={FLAG_COLORS[f.flag_type]} />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {new Date(f.created_at).toLocaleDateString()}
                        {f.created_by ? ` · ${f.created_by}` : ""}
                      </Typography>
                    </Stack>
                    {f.description && (
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-line" }}>
                        {f.description}
                      </Typography>
                    )}
                    {f.response && (
                      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary", whiteSpace: "pre-line" }}>
                        {t("flags.process.answer")}: {f.response}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" color="warning" disabled={createFlag.isPending} onClick={skicka}>
            {createFlag.isPending ? <CircularProgress size={16} color="inherit" /> : t("flags.submit")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
