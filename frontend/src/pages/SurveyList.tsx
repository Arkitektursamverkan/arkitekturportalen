import React, { useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, Radio, RadioGroup,
  Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNavigate } from "react-router-dom";
import { useCreateSurvey, useDeleteSurvey, useDuplicateSurvey, useSurveys, type SurveyKind, type SurveyStatus, type SurveySummary } from "@/api/surveys";
import { useRoleStore } from "@/store/roleStore";
import TargetTypePicker from "@/components/surveys/TargetTypePicker";

const STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: "Utkast",
  open: "Öppen",
  paused: "Pausad",
  closed: "Stängd",
};
const STATUS_COLOR: Record<SurveyStatus, "default" | "success" | "warning" | "secondary"> = {
  draft: "default",
  open: "success",
  paused: "warning",
  closed: "secondary",
};

const SurveyList: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useRoleStore();
  const { data, isLoading } = useSurveys();
  const create = useCreateSurvey();
  const duplicate = useDuplicateSurvey();
  const del = useDeleteSurvey();
  const [openNew, setOpenNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [tab, setTab] = useState(0);

  const active = (data ?? []).filter((s) => s.status !== "closed");
  const archived = (data ?? []).filter((s) => s.status === "closed");

  const renderTable = (rows: SurveySummary[], emptyMessage: string) => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Titel</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Besvaras senast</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Skapad av</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Senast uppdaterad</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/surveys/${s.id}`)}>
              <TableCell>
                {s.title}
                {s.kind === "random_system" && (
                  <Chip size="small" label="Slump" variant="outlined" color="info" sx={{ ml: 1 }} />
                )}
              </TableCell>
              <TableCell>
                <Chip size="small" label={STATUS_LABEL[s.status]} color={STATUS_COLOR[s.status]} />
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {s.due_date ? new Date(s.due_date).toLocaleDateString("sv-SE") : "—"}
                </Typography>
              </TableCell>
              <TableCell><Typography variant="body2" sx={{ color: "text.secondary" }}>{s.created_by ?? "—"}</Typography></TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {new Date(s.updated_at).toLocaleString("sv-SE")}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Öppna">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/surveys/${s.id}`); }}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplicera — skapar en ny enkät med samma frågor, utan mottagare">
                  <span>
                    <IconButton
                      size="small"
                      disabled={duplicate.isPending}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const copy = await duplicate.mutateAsync(s.id);
                        navigate(`/surveys/${copy.id}`);
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {isAdmin && (
                  <Tooltip title="Ta bort">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: s.id, title: s.title }); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Enkäter</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Skapa och skicka ut enkäter till t.ex. systemförvaltare — svaren kan sedan granskas och användas som underlag för nya integrationer.
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpenNew(true)}>
          Ny enkät
        </Button>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Aktiva enkäter" />
          <Tab label={`Arkiverade enkäter${archived.length > 0 ? ` (${archived.length})` : ""}`} />
        </Tabs>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      ) : tab === 0 ? (
        renderTable(active, "Inga aktiva enkäter ännu. Klicka på Ny enkät för att börja.")
      ) : (
        renderTable(archived, "Inga arkiverade enkäter ännu.")
      )}

      <NewSurveyDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreate={async (title, description, kind, targetNodeType, targetAttributeKey) => {
          const survey = await create.mutateAsync({
            title,
            description,
            kind,
            target_node_type: targetNodeType,
            target_attribute_key: targetAttributeKey,
          });
          setOpenNew(false);
          navigate(`/surveys/${survey.id}`);
        }}
      />

      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(null)}>
          <DialogTitle>Ta bort "{confirmDelete.title}"?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              Detta tar bort enkäten och alla dess svar permanent. Åtgärden kan inte ångras.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDelete(null)}>Avbryt</Button>
            <Button color="error" variant="contained" onClick={async () => { await del.mutateAsync(confirmDelete.id); setConfirmDelete(null); }}>
              Ta bort
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Container>
  );
};

const NewSurveyDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string, kind: SurveyKind, targetNodeType: string, targetAttributeKey: string) => Promise<void>;
}> = ({ open, onClose, onCreate }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SurveyKind>("standard");
  const [targetNodeType, setTargetNodeType] = useState("Application");
  const [targetAttributeKey, setTargetAttributeKey] = useState("systemförvaltare");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setKind("standard");
    setTargetNodeType("Application");
    setTargetAttributeKey("systemförvaltare");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ny enkät</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus required label="Titel" placeholder="t.ex. Integrationer 2026" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Kort beskrivning (valfri)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as SurveyKind)}>
            <FormControlLabel value="standard" control={<Radio size="small" />} label="Vanlig enkät — skickas till utpekade mottagare" />
            <FormControlLabel value="random_system" control={<Radio size="small" />} label="Slumpenkät — inloggade användare får frågor om en slumpad applikation" />
          </RadioGroup>
          {kind === "standard" ? (
            <>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Enkäten skapar en svarsrad per objekt av vald typ — mottagaren får sina objekt listade och besvarar enkäten en gång per objekt.
              </Typography>
              <TargetTypePicker
                nodeType={targetNodeType}
                attributeKey={targetAttributeKey}
                onChange={({ nodeType, attributeKey }) => { setTargetNodeType(nodeType); setTargetAttributeKey(attributeKey); }}
              />
            </>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              När enkäten är öppen erbjuds inloggade användare (i snitt var 3:e inloggning) att svara på frågorna
              om en slumpmässigt vald aktiv applikation. Ingen mottagarlista behövs — enkättypen kan inte ändras i efterhand.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Avbryt</Button>
        <Button variant="contained" disabled={saving || !title.trim() || (kind === "standard" && !targetAttributeKey.trim())} onClick={async () => {
          setSaving(true);
          try { await onCreate(title.trim(), description.trim(), kind, targetNodeType, targetAttributeKey.trim()); reset(); }
          finally { setSaving(false); }
        }}>{saving ? "Skapar…" : "Skapa & öppna"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SurveyList;
