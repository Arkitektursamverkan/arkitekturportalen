import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, List, ListItemButton, ListItemText, MenuItem, Paper, Stack, TextField, Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import MarkdownView from "@/components/common/MarkdownView";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import { MEETING_TEMPLATES, meetingTemplateLabel } from "@/config/meetingTemplates";
import {
  useCreateMeeting, useDeleteMeeting, useUpdateMeeting, useWorkspaceMeeting, useWorkspaceMeetings,
} from "@/api/workspaces";

interface Props {
  workspaceId: string;
  canEdit: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

const WorkspaceMeetings: React.FC<Props> = ({ workspaceId, canEdit }) => {
  const { data: meetings = [], isLoading } = useWorkspaceMeetings(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: meeting } = useWorkspaceMeeting(workspaceId, selectedId ?? undefined);
  const create = useCreateMeeting(workspaceId);
  const update = useUpdateMeeting(workspaceId);
  const del = useDeleteMeeting(workspaceId);

  const [newOpen, setNewOpen] = useState(false);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meetings.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !meetings.some((m) => m.id === selectedId)) {
      setSelectedId(meetings[0].id);
    }
  }, [meetings, selectedId]);

  useEffect(() => {
    if (meeting) {
      setDraftTitle(meeting.title);
      setDraftDate(meeting.meeting_date ?? "");
      setDraftBody(meeting.body);
      setMode("read");
    }
  }, [meeting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ width: { xs: "100%", md: 280 }, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>Möten</Typography>
            {canEdit && (
              <Tooltip title="Nytt möte">
                <IconButton size="small" onClick={() => setNewOpen(true)}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Divider />
          <List dense disablePadding>
            {meetings.map((m) => (
              <ListItemButton
                key={m.id}
                selected={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              >
                <ListItemText
                  primary={m.title}
                  secondary={
                    <>
                      {m.meeting_date ?? "utan datum"}
                      {" · "}
                      {meetingTemplateLabel(m.template)}
                    </>
                  }
                  primaryTypographyProps={{ fontSize: 13 }}
                  secondaryTypographyProps={{ fontSize: 11 }}
                />
              </ListItemButton>
            ))}
            {!isLoading && meetings.length === 0 && (
              <Box sx={{ px: 2, py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Inga mötesanteckningar ännu.
                </Typography>
              </Box>
            )}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ flex: 1, p: 3, minHeight: 320, width: "100%" }}>
          {!meeting ? (
            <Typography variant="body2" color="text.secondary">
              {canEdit
                ? "Skapa ett möte och välj en mall — anteckningarna får då färdiga rubriker att fylla i."
                : "Det finns inga mötesanteckningar i uppdraget ännu."}
            </Typography>
          ) : mode === "edit" ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Rubrik"
                  size="small"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Mötesdatum"
                  type="date"
                  size="small"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <MarkdownEditor value={draftBody} onChange={setDraftBody} minRows={16} />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={!draftTitle.trim() || update.isPending}
                  onClick={() =>
                    run(async () => {
                      await update.mutateAsync({
                        meetingId: meeting.id,
                        title: draftTitle.trim(),
                        meeting_date: draftDate || null,
                        body: draftBody,
                      });
                      setMode("read");
                    })
                  }
                >
                  Spara
                </Button>
                <Button
                  onClick={() => {
                    setDraftTitle(meeting.title);
                    setDraftDate(meeting.meeting_date ?? "");
                    setDraftBody(meeting.body);
                    setMode("read");
                  }}
                >
                  Avbryt
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Box>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={700}>{meeting.title}</Typography>
                    <Chip size="small" variant="outlined" label={meetingTemplateLabel(meeting.template)} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {meeting.meeting_date ? `Möte ${meeting.meeting_date} · ` : ""}
                    senast uppdaterad {new Date(meeting.updated_at).toLocaleString("sv-SE")}
                    {meeting.updated_by ? ` av ${meeting.updated_by}` : ""}
                  </Typography>
                </Box>
                {canEdit && (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Redigera">
                      <IconButton size="small" onClick={() => setMode("edit")}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Ta bort mötet">
                      <IconButton size="small" onClick={() => run(() => del.mutateAsync(meeting.id))}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <MarkdownView text={meeting.body} emptyText="Inga anteckningar ännu." />
            </Box>
          )}
        </Paper>
      </Stack>

      <NewMeetingDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={async (input) => {
          await run(async () => {
            const created = await create.mutateAsync(input);
            setSelectedId(created.id);
            setDraftTitle(created.title);
            setDraftDate(created.meeting_date ?? "");
            setDraftBody(created.body);
            setNewOpen(false);
            setMode("edit");
          });
        }}
      />
    </Box>
  );
};

const NewMeetingDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    meeting_date: string | null;
    template: string;
    body: string;
  }) => Promise<void>;
}> = ({ open, onClose, onCreate }) => {
  const [templateKey, setTemplateKey] = useState(MEETING_TEMPLATES[0].key);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const template = MEETING_TEMPLATES.find((t) => t.key === templateKey) ?? MEETING_TEMPLATES[0];

  useEffect(() => {
    if (open) {
      setTemplateKey(MEETING_TEMPLATES[0].key);
      setTitle("");
      setDate(today());
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Nytt möte</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Mötesmall"
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            helperText={template.description}
            fullWidth
          >
            {MEETING_TEMPLATES.map((t) => (
              <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
            ))}
          </TextField>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Rubrik"
              placeholder={`${template.label} ${date}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Mötesdatum"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Mallen fyller anteckningarna med färdiga rubriker. Allt går att ändra efteråt.
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, mt: 1, maxHeight: 220, overflow: "auto" }}>
              <MarkdownView text={template.body} />
            </Paper>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onCreate({
                // An empty title falls back to what the placeholder promised.
                title: title.trim() || `${template.label} ${date}`,
                meeting_date: date || null,
                template: template.key,
                body: template.body,
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          Skapa
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceMeetings;
