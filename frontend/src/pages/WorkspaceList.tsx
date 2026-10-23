import React, { useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Chip,
  CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import { useNavigate } from "react-router-dom";
import {
  useCreateWorkspace, useDirectory, useWorkspaces,
  type DirectoryUser, type WorkspaceKind, type WorkspaceVisibility,
} from "@/api/workspaces";
import { ROLE_LABEL } from "@/components/workspace/WorkspaceMembers";
import { kindCopy } from "@/config/workspaceKinds";
import { useHomeBlock, useUpdateHomeBlock } from "@/api/homeBlocks";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import MarkdownView from "@/components/common/MarkdownView";
import { useRoleStore } from "@/store/roleStore";

interface Props {
  /** Which kind of yta this list shows — the route decides. */
  kind?: WorkspaceKind;
}

const WorkspaceList: React.FC<Props> = ({ kind = "uppdrag" }) => {
  const navigate = useNavigate();
  const { isEditor } = useRoleStore();
  const { data: workspaces = [], isLoading } = useWorkspaces(kind);
  const create = useCreateWorkspace();
  const [open, setOpen] = useState(false);
  const copy = kindCopy(kind);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>{copy.listTitle}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{copy.listIntro}</Typography>
        </Box>
        {isEditor && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            {copy.createLabel}
          </Button>
        )}
      </Stack>

      {kind === "arbetsgrupp" && <WorkgroupCharter />}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Namn</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Synlighet</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Min roll</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{copy.membersLabel}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Senast uppdaterad</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workspaces.map((w) => (
                <TableRow
                  key={w.id}
                  hover
                  sx={{ cursor: "pointer", opacity: w.status === "archived" ? 0.6 : 1 }}
                  onClick={() => navigate(`${copy.listPath}/${w.id}`)}
                >
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <GroupWorkIcon fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.name}</Typography>
                        {w.description && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {w.description}
                          </Typography>
                        )}
                      </Box>
                      {w.status === "archived" && <Chip size="small" label="Arkiverat" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      icon={w.visibility === "private" ? <LockIcon /> : <PublicIcon />}
                      label={w.visibility === "private" ? "Privat" : "Intern"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={w.is_member ? ROLE_LABEL[w.my_role] : `${ROLE_LABEL[w.my_role]} (ej medlem)`}
                      color={w.my_role === "owner" ? "primary" : "default"}
                    />
                  </TableCell>
                  <TableCell>{w.member_count}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {new Date(w.updated_at).toLocaleString("sv-SE")}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              {workspaces.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    {isEditor
                      ? `Inga ännu. Klicka på ${copy.createLabel} för att skapa en.`
                      : copy.emptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <NewWorkspaceDialog
        open={open}
        kind={kind}
        onClose={() => setOpen(false)}
        onCreate={async (input) => {
          const ws = await create.mutateAsync({ ...input, kind });
          setOpen(false);
          navigate(`${copy.listPath}/${ws.id}`);
        }}
      />
    </Container>
  );
};

/** Syfte och uppdrag — gemensamt för alla arbetsgrupper, så det står ovanför
    listan i stället för i varje enskild grupp. Texten är ett redigerbart
    block (Markdown); utan text ser bara redaktörer rutan, för att fylla i den. */
const CHARTER_KEY = "workgroup_charter";

const WorkgroupCharter: React.FC = () => {
  const { isEditor } = useRoleStore();
  const { data: block, isLoading } = useHomeBlock(CHARTER_KEY);
  const update = useUpdateHomeBlock();
  const [draft, setDraft] = useState<string | null>(null);
  const body = block?.body ?? "";

  if (isLoading || (!body && !isEditor)) return null;

  const save = async () => {
    if (draft === null) return;
    await update.mutateAsync({ key: CHARTER_KEY, body: draft, enabled: true });
    setDraft(null);
  };

  return (
    <Accordion defaultExpanded disableGutters sx={{ mb: 3 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Syfte och uppdrag</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {draft !== null ? (
          <>
            <MarkdownEditor value={draft} onChange={setDraft} minRows={12} autoFocus />
            {update.isError && <Alert severity="error" sx={{ mt: 1 }}>Det gick inte att spara.</Alert>}
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", mt: 1 }}>
              <Button onClick={() => setDraft(null)}>Avbryt</Button>
              <Button variant="contained" onClick={save} disabled={update.isPending}>Spara</Button>
            </Stack>
          </>
        ) : (
          <>
            <MarkdownView
              text={body}
              emptyText="Arbetsgruppernas syfte och uppdrag är inte beskrivet än."
            />
            {isEditor && (
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mt: 1 }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {block?.updated_by ? `Senast ändrad av ${block.updated_by}` : ""}
                </Typography>
                <Button size="small" startIcon={<EditIcon />} onClick={() => setDraft(body)}>
                  Redigera
                </Button>
              </Stack>
            )}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

const NewWorkspaceDialog: React.FC<{
  open: boolean;
  kind: WorkspaceKind;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    visibility: WorkspaceVisibility;
    member_ids: string[];
  }) => Promise<void>;
}> = ({ open, kind, onClose, onCreate }) => {
  const copy = kindCopy(kind);
  const { data: directory = [] } = useDirectory(open);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // An arbetsgrupp is internal by default: everyone reads, deltagare write.
  const [visibility, setVisibility] = useState<WorkspaceVisibility>(
    kind === "arbetsgrupp" ? "internal" : "private",
  );
  const [members, setMembers] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setName("");
    setDescription("");
    setVisibility(kind === "arbetsgrupp" ? "internal" : "private");
    setMembers([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{copy.createLabel}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Namn"
            placeholder={kind === "arbetsgrupp" ? "t.ex. Affärsstöd" : "t.ex. Inventering av IT-landskapet"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />
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
            helperText={
              visibility === "private"
                ? `Bara ${copy.membersNoun} ser ${copy.definite}.`
                : `Alla inloggade får läsa; bara ${copy.membersNoun} kan skriva.`
            }
            fullWidth
          >
            <MenuItem value="private">Privat</MenuItem>
            <MenuItem value="internal">Intern (läsbar för alla inloggade)</MenuItem>
          </TextField>
          <Autocomplete
            multiple
            options={directory}
            value={members}
            onChange={(_, v) => setMembers(v)}
            getOptionLabel={(o) => `${o.name} (${o.email})`}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField {...params} label={copy.membersLabel} placeholder="Sök namn eller e-post" />
            )}
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Du blir automatiskt ägare. Roller kan ändras efteråt under {copy.membersLabel}.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onCreate({
                name: name.trim(),
                description: description.trim(),
                visibility,
                member_ids: members.map((m) => m.id),
              });
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : `Kunde inte skapa ${copy.definite}`);
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

export default WorkspaceList;
