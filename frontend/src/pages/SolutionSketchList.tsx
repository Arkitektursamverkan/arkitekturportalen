import React, { useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  useCreateSketch, useDeleteSketch, useSolutionSketches,
  type SketchStatus,
} from "@/api/solutionSketches";
import { useRoleStore } from "@/store/roleStore";

const STATUS_LABEL: Record<SketchStatus, string> = {
  draft: "Utkast",
  in_review: "Under granskning",
  approved: "Godkänd",
  archived: "Arkiverad",
};
const STATUS_COLOR: Record<SketchStatus, "default" | "warning" | "success" | "secondary"> = {
  draft: "default",
  in_review: "warning",
  approved: "success",
  archived: "secondary",
};

const SolutionSketchList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isEditor: isAdmin } = useRoleStore();
  const { data, isLoading } = useSolutionSketches();
  const create = useCreateSketch();
  const del = useDeleteSketch();
  const [openNew, setOpenNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("solutionSketch.title", { defaultValue: "Lösningsskiss" })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("solutionSketch.subtitle", {
              defaultValue: "Strukturerat stöd för nya digitala initiativ — fyll i en skiss för att hitta överlapp, relevanta principer och frågor inför upphandling.",
            })}
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpenNew(true)}>
          {t("solutionSketch.new", { defaultValue: "Ny skiss" })}
        </Button>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Titel</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Skapad av</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Senast uppdaterad</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data ?? []).map((s) => (
                <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/solution-sketches/${s.id}`)}>
                  <TableCell>{s.title}</TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[s.status]} color={STATUS_COLOR[s.status]} />
                  </TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{s.created_by ?? "—"}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(s.updated_at).toLocaleString("sv-SE")}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Öppna">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/solution-sketches/${s.id}`); }}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
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
              {(data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    Inga skisser ännu. Klicka på <strong>Ny skiss</strong> för att börja.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <NewSketchDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreate={async (title, description) => {
          const sk = await create.mutateAsync({ title, description });
          setOpenNew(false);
          navigate(`/solution-sketches/${sk.id}`);
        }}
      />

      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(null)}>
          <DialogTitle>Ta bort "{confirmDelete.title}"?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">Detta tar bort skissen permanent. Åtgärden kan inte ångras.</Typography>
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

const NewSketchDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string) => Promise<void>;
}> = ({ open, onClose, onCreate }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ny lösningsskiss</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus required label="Titel" placeholder="t.ex. Bokningssystem för uthyrning" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Kort beskrivning (valfri)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setTitle(""); setDescription(""); onClose(); }}>Avbryt</Button>
        <Button variant="contained" disabled={saving || !title.trim()} onClick={async () => {
          setSaving(true);
          try { await onCreate(title.trim(), description.trim()); setTitle(""); setDescription(""); }
          finally { setSaving(false); }
        }}>{saving ? "Skapar…" : "Skapa & öppna"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SolutionSketchList;
