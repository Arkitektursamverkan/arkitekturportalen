import React, { useEffect, useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";

/**
 * An object's description as a field of its own: the label above, the text
 * across the whole width. It saves when the field is left, and only when the
 * text changed. Line breaks are kept. An emptied field is saved as an empty
 * text – the API reads a missing description as "leave it as it is".
 */
const DescriptionField: React.FC<{
  /** Changes with the object shown, so the text starts over. */
  ownerId: string;
  value: string | null | undefined;
  canEdit: boolean;
  onSave: (description: string) => Promise<unknown>;
}> = ({ ownerId, value, canEdit, onSave }) => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const stored = (value ?? "").trim();
  const [text, setText] = useState(stored);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(stored); }, [ownerId, stored]);

  const save = async () => {
    const next = text.trim();
    if (next === stored) { setText(next); return; }
    setSaving(true);
    try {
      await onSave(next);
      setText(next);
    } catch (e) {
      setText(stored);
      enqueueSnackbar(e instanceof Error && e.message ? e.message : t("descriptionField.saveError"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="caption" component="div" sx={{ color: "text.secondary", fontWeight: 600, mb: 0.5 }}>
        {t("common.description")}
      </Typography>
      {canEdit ? (
        <TextField
          fullWidth multiline minRows={3} maxRows={16} size="small" value={text} disabled={saving}
          placeholder={t("descriptionField.placeholder")}
          slotProps={{ htmlInput: { "aria-label": t("common.description") } }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
        />
      ) : (
        <Typography variant="body2" sx={{ color: stored ? "text.primary" : "text.disabled", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
          {stored || "—"}
        </Typography>
      )}
    </Box>
  );
};

export default DescriptionField;
