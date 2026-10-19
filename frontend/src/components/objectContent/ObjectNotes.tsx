import React, { useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, IconButton, Paper, Stack, Switch, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import LockIcon from "@mui/icons-material/Lock";
import GroupsIcon from "@mui/icons-material/Groups";
import { useTranslation } from "react-i18next";
import ErrorAlert from "@/components/common/ErrorAlert";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import MarkdownView from "@/components/common/MarkdownView";
import {
  useCreateNote, useDeleteNote, useNodeNotes, useUpdateNote,
  type NodeNote, type NoteVisibility,
} from "@/api/nodeContent";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

const VisibilityToggle: React.FC<{ value: NoteVisibility; onChange: (v: NoteVisibility) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <Tooltip title={value === "private" ? t("objectContent.notes.privateHint") : t("objectContent.notes.sharedHint")}>
      <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v) => v && onChange(v)}>
        <ToggleButton value="shared" sx={{ px: 1.5, textTransform: "none" }}>
          <GroupsIcon fontSize="small" sx={{ mr: 0.5 }} />{t("objectContent.notes.shared")}
        </ToggleButton>
        <ToggleButton value="private" sx={{ px: 1.5, textTransform: "none" }}>
          <LockIcon fontSize="small" sx={{ mr: 0.5 }} />{t("objectContent.notes.private")}
        </ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  );
};

const ObjectNotes: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useNodeNotes(nodeId);
  const create = useCreateNote(nodeId);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("shared");
  const [pinned, setPinned] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner height={200} />;
  if (error || !data) return <ErrorAlert error={error as Error} />;

  const save = () => {
    setFailure(null);
    create.mutate(
      { body: body.trim(), visibility, pinned },
      {
        onSuccess: () => { setBody(""); setPinned(false); },
        onError: (e) => setFailure(errorText(e, t("common.error"))),
      },
    );
  };

  return (
    <Box maxWidth={860}>
      {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}

      {data.permissions.write_notes ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <MarkdownEditor value={body} onChange={setBody} placeholder={t("objectContent.notes.placeholder")} minRows={4} />
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }}>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
            <FormControlLabel
              control={<Switch size="small" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />}
              label={<Typography variant="body2">{t("objectContent.notes.pin")}</Typography>}
            />
            <Box flexGrow={1} />
            <Button variant="contained" disabled={!body.trim() || create.isPending} onClick={save}>
              {t("objectContent.notes.save")}
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t("objectContent.notes.readOnly")}</Typography>
      )}

      {data.notes.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t("objectContent.notes.empty")}</Typography>
      ) : (
        <Stack spacing={1.5}>
          {data.notes.map((n) => <NoteCard key={n.id} nodeId={nodeId} note={n} onError={setFailure} />)}
        </Stack>
      )}
    </Box>
  );
};

const NoteCard: React.FC<{ nodeId: string; note: NodeNote; onError: (msg: string) => void }> = ({ nodeId, note, onError }) => {
  const { t } = useTranslation();
  const update = useUpdateNote(nodeId);
  const del = useDeleteNote(nodeId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (p: Partial<Pick<NodeNote, "body" | "visibility" | "pinned">>, after?: () => void) =>
    update.mutate({ noteId: note.id, patch: p }, {
      onSuccess: after,
      onError: (e) => onError(errorText(e, t("common.error"))),
    });

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderLeft: 3,
        borderLeftColor: note.pinned ? "primary.main" : note.visibility === "private" ? "warning.main" : "divider",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>{note.author_name ?? "—"}</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(note.created_at)}
          {note.edited_at ? ` · ${t("objectContent.notes.edited")} ${formatDateTime(note.edited_at)}` : ""}
        </Typography>
        {note.pinned && <Chip icon={<PushPinIcon sx={{ fontSize: 12 }} />} label={t("objectContent.notes.pinned")} size="small" sx={{ height: 18, fontSize: 10 }} />}
        {note.visibility === "private" && (
          <Tooltip title={t("objectContent.notes.privateHint")}>
            <Chip icon={<LockIcon sx={{ fontSize: 12 }} />} label={t("objectContent.notes.private")} size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
          </Tooltip>
        )}
        <Box flexGrow={1} />
        {note.can_edit && !editing && (
          <>
            <Tooltip title={note.pinned ? t("objectContent.notes.unpin") : t("objectContent.notes.pin")}>
              <IconButton size="small" onClick={() => patch({ pinned: !note.pinned })}>
                {note.pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={t("objectContent.notes.edit")}>
              <IconButton size="small" onClick={() => { setDraft(note.body); setEditing(true); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("objectContent.notes.delete")}>
              <IconButton size="small" onClick={() => setConfirmDelete(true)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      {editing ? (
        <Box>
          <MarkdownEditor value={draft} onChange={setDraft} minRows={4} autoFocus />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            {/* Only the author decides who sees what they wrote. */}
            {note.is_mine && <VisibilityToggle value={note.visibility} onChange={(v) => patch({ visibility: v })} />}
            <Box flexGrow={1} />
            <Button onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            <Button
              variant="contained"
              disabled={!draft.trim() || update.isPending}
              onClick={() => patch({ body: draft.trim() }, () => setEditing(false))}
            >
              {t("common.save")}
            </Button>
          </Stack>
        </Box>
      ) : (
        <MarkdownView text={note.body} />
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>{t("objectContent.notes.delete")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("objectContent.notes.confirmDelete")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(note.id, {
                onSuccess: () => setConfirmDelete(false),
                onError: (e) => { setConfirmDelete(false); onError(errorText(e, t("common.error"))); },
              })
            }
          >
            {t("objectContent.notes.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ObjectNotes;
