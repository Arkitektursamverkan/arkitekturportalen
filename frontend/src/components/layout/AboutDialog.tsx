import React, { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslation } from "react-i18next";
import { useHomeBlock, useUpdateHomeBlock } from "@/api/homeBlocks";
import { useRoleStore } from "@/store/roleStore";

const BLOCK_KEY = "about";

/**
 * Info icon for the header. Opens a read-only dialog with the "Om EA-portalen"
 * content. Admins see a pencil to switch into edit mode.
 */
const AboutDialog: React.FC = () => {
  const { t } = useTranslation();
  const { isEditor: isAdmin } = useRoleStore();
  const { data: block } = useHomeBlock(BLOCK_KEY);
  const update = useUpdateHomeBlock();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const title = t("home.blocks.about");
  const body = block?.body ?? "";

  const startEdit = () => {
    setDraft(body);
    setEditing(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(false);
  };

  const save = async () => {
    if (!block) return;
    setSaving(true);
    try {
      await update.mutateAsync({ key: BLOCK_KEY, body: draft, enabled: block.enabled });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tooltip title={t("home.blocks.aboutTooltip")}>
        <IconButton color="inherit" onClick={() => setOpen(true)} sx={{ mr: 0.5 }}>
          <InfoOutlinedIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box flex={1}>{title}</Box>
            {isAdmin && !editing && (
              <Tooltip title={t("home.blocks.edit")}>
                <IconButton size="small" onClick={startEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </DialogTitle>
        <DialogContent>
          {editing ? (
            <TextField
              autoFocus fullWidth multiline minRows={6} maxRows={20}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              sx={{ mt: 1 }}
            />
          ) : body ? (
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{body}</Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {t("home.blocks.empty")}
            </Typography>
          )}
          {!editing && block?.updated_by && block?.updated_at && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              {new Date(block.updated_at).toLocaleString("sv-SE")} · {block.updated_by}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)}>{t("home.blocks.cancel")}</Button>
              <Button variant="contained" disabled={saving} onClick={save}>
                {saving ? "…" : t("home.blocks.save")}
              </Button>
            </>
          ) : (
            <Button onClick={close}>{t("common.close", { defaultValue: "Stäng" })}</Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AboutDialog;
