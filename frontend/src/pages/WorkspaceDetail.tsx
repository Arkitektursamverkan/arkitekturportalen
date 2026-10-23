import React, { useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SettingsIcon from "@mui/icons-material/Settings";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import { useNavigate, useParams } from "react-router-dom";
import {
  canWrite as canWriteIn, useDeleteWorkspace, useUpdateWorkspace, useWorkspace,
  type WorkspaceStatus, type WorkspaceVisibility, type Workspace,
} from "@/api/workspaces";
import WorkspacePages from "@/components/workspace/WorkspacePages";
import WorkspaceMeetings from "@/components/workspace/WorkspaceMeetings";
import WorkspaceFiles from "@/components/workspace/WorkspaceFiles";
import WorkspaceDiscussion from "@/components/workspace/WorkspaceDiscussion";
import WorkspaceTasks from "@/components/workspace/WorkspaceTasks";
import WorkspaceMembers, { ROLE_LABEL } from "@/components/workspace/WorkspaceMembers";
import WorkspaceCalendar from "@/components/workspace/WorkspaceCalendar";
import { kindCopy } from "@/config/workspaceKinds";

const TABS = ["sidor", "moten", "kalender", "diskussion", "filer", "uppgifter", "medlemmar"] as const;

const WorkspaceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ws, isLoading, error } = useWorkspace(id);
  const [tab, setTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>
    );
  }
  if (error || !ws) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Alert severity="warning">
          Ytan kunde inte hämtas. Den kan ha tagits bort, eller så saknar du behörighet.
        </Alert>
        <Button sx={{ mt: 2 }} startIcon={<ArrowBackIcon />} onClick={() => navigate("/uppdrag")}>
          Till uppdragslistan
        </Button>
      </Container>
    );
  }

  const writable = canWriteIn(ws);
  const isOwner = ws.my_role === "owner";
  const copy = kindCopy(ws.kind);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(copy.listPath)}>
        {copy.listTitle}
      </Button>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mt: 1, mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{ws.name}</Typography>
            <Chip
              size="small"
              variant="outlined"
              icon={ws.visibility === "private" ? <LockIcon /> : <PublicIcon />}
              label={ws.visibility === "private" ? "Privat" : "Intern"}
            />
            {ws.status === "archived" && <Chip size="small" label="Arkiverat" />}
          </Stack>
          {ws.description && (
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              {ws.description}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Din roll: {ROLE_LABEL[ws.my_role]}
            {!ws.is_member && " (via behörighet, inte medlemskap)"} · {ws.members.length}{" "}
            {copy.membersNoun}
          </Typography>
        </Box>
        {isOwner && (
          <Button startIcon={<SettingsIcon />} onClick={() => setSettingsOpen(true)}>
            Inställningar
          </Button>
        )}
      </Stack>

      {!writable && ws.status === "active" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Du har läsbehörighet i {copy.definite}.
          {ws.kind === "arbetsgrupp" && " Deltagare i gruppen kan skriva."}
        </Alert>
      )}
      {ws.status === "archived" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {copy.definite[0].toUpperCase() + copy.definite.slice(1)} är arkiverad och skrivskyddad.
          {isOwner && " Öppna Inställningar för att återaktivera den."}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Sidor" />
        <Tab label="Möten" />
        <Tab label="Kalender" />
        <Tab label="Diskussion" />
        <Tab label="Länkar" />
        <Tab label="Uppgifter" />
        <Tab label={copy.membersLabel} />
      </Tabs>

      {TABS[tab] === "sidor" && <WorkspacePages workspaceId={ws.id} canEdit={writable} />}
      {TABS[tab] === "moten" && <WorkspaceMeetings workspaceId={ws.id} canEdit={writable} />}
      {TABS[tab] === "kalender" && <WorkspaceCalendar workspaceId={ws.id} canEdit={writable} />}
      {TABS[tab] === "diskussion" && (
        <WorkspaceDiscussion workspaceId={ws.id} canWrite={writable} isOwner={isOwner} />
      )}
      {TABS[tab] === "filer" && <WorkspaceFiles workspaceId={ws.id} canEdit={writable} />}
      {TABS[tab] === "uppgifter" && (
        <WorkspaceTasks workspaceId={ws.id} members={ws.members} canEdit={writable} />
      )}
      {TABS[tab] === "medlemmar" && <WorkspaceMembers workspace={ws} />}

      <SettingsDialog
        workspace={ws}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDeleted={() => navigate(copy.listPath)}
      />
    </Container>
  );
};

const SettingsDialog: React.FC<{
  workspace: Workspace;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}> = ({ workspace, open, onClose, onDeleted }) => {
  const update = useUpdateWorkspace();
  const del = useDeleteWorkspace();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [visibility, setVisibility] = useState<WorkspaceVisibility>(workspace.visibility);
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = kindCopy(workspace.kind);

  // Re-seed the form each time the dialog opens on a (possibly updated) workspace.
  React.useEffect(() => {
    if (open) {
      setName(workspace.name);
      setDescription(workspace.description);
      setVisibility(workspace.visibility);
      setStatus(workspace.status);
      setConfirmDelete(false);
      setError(null);
    }
  }, [open, workspace]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Inställningar för {copy.definite}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Namn" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField
            label="Beskrivning"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            select
            label="Synlighet"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as WorkspaceVisibility)}
            fullWidth
          >
            <MenuItem value="private">Privat — bara {copy.membersNoun}</MenuItem>
            <MenuItem value="internal">Intern — alla inloggade får läsa</MenuItem>
          </TextField>
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkspaceStatus)}
            helperText={`En arkiverad yta är skrivskyddad och döljs i navigeringen.`}
            fullWidth
          >
            <MenuItem value="active">Aktivt</MenuItem>
            <MenuItem value="archived">Arkiverat</MenuItem>
          </TextField>

          {confirmDelete ? (
            <Alert severity="error" action={
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setConfirmDelete(false)}>Avbryt</Button>
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  onClick={async () => {
                    try {
                      await del.mutateAsync(workspace.id);
                      onDeleted();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Kunde inte ta bort ytan");
                    }
                  }}
                >
                  Ta bort
                </Button>
              </Stack>
            }>
              Allt innehåll — sidor, möten, kalender, filer, inlägg och uppgifter — tas bort permanent.
            </Alert>
          ) : (
            <Button color="error" size="small" onClick={() => setConfirmDelete(true)} sx={{ alignSelf: "flex-start" }}>
              Ta bort {copy.definite}
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Stäng</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || update.isPending}
          onClick={async () => {
            setError(null);
            try {
              await update.mutateAsync({
                id: workspace.id,
                name: name.trim(),
                description: description.trim(),
                visibility,
                status,
              });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunde inte spara");
            }
          }}
        >
          Spara
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceDetail;
