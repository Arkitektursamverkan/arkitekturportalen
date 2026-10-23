import React, { useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import {
  downloadGlossaryPdf,
  downloadGlossaryVersionPdf,
  useCreateGlossaryTerm,
  useDeleteGlossaryTerm,
  useGlossaryTerms,
  useGlossaryVersions,
  useUpdateGlossaryTerm,
  type GlossaryTerm,
  type GlossaryTermCreate,
} from "@/api/glossary";
import { useRoleStore } from "@/store/roleStore";
import CommentsThread from "@/components/comments/CommentsThread";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";

const SWEDISH_ALPHABET = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z","Å","Ä","Ö",
];

const FALLBACK_LETTER = "#";

const firstLetter = (term: string): string => {
  const ch = (term.trim()[0] || "").toUpperCase();
  if (SWEDISH_ALPHABET.includes(ch)) return ch;
  return FALLBACK_LETTER;
};

const sectionId = (letter: string) => `glossary-letter-${letter === FALLBACK_LETTER ? "_other" : letter}`;

const Glossary: React.FC = () => {
  const { isEditor: isAdmin } = useRoleStore();
  const { data: terms = [], isLoading } = useGlossaryTerms();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } = useGlossaryVersions();
  const createMutation = useCreateGlossaryTerm();
  const updateMutation = useUpdateGlossaryTerm();
  const deleteMutation = useDeleteGlossaryTerm();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GlossaryTermCreate>({ term: "", definition: "" });
  const indexBarRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(
      (t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q),
    );
  }, [terms, search]);

  const { grouped, lettersWithTerms } = useMemo(() => {
    const map = new Map<string, GlossaryTerm[]>();
    for (const t of filtered) {
      const letter = firstLetter(t.term);
      const bucket = map.get(letter) ?? [];
      bucket.push(t);
      map.set(letter, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.term.localeCompare(b.term, "sv"));
    }
    const letters = new Set<string>(map.keys());
    return { grouped: map, lettersWithTerms: letters };
  }, [filtered]);

  const orderedLetters = useMemo(() => {
    const all = [...SWEDISH_ALPHABET];
    if (lettersWithTerms.has(FALLBACK_LETTER)) all.push(FALLBACK_LETTER);
    return all.filter((l) => grouped.has(l));
  }, [grouped, lettersWithTerms]);

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(sectionId(letter));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ term: "", definition: "" });
    setDialogOpen(true);
  };

  const openEdit = (t: GlossaryTerm) => {
    setEditingId(t.id);
    setForm({ term: t.term, definition: t.definition });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmed = form.term.trim();
    if (!trimmed) return;
    const payload = { term: trimmed, definition: form.definition ?? "" };
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (t: GlossaryTerm) => {
    if (!window.confirm(`Ta bort termen "${t.term}"?`)) return;
    await deleteMutation.mutateAsync(t.id);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Ordlista
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Lägg till term
          </Button>
        )}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Begrepp som används i arkitekturarbetet. Klicka på en bokstav för att hoppa till sektionen.
      </Typography>

      <DocumentExportPanel
        title="Ordlista"
        documentType="glossary"
        versions={versions}
        isLoading={versionsLoading}
        isAdmin={isAdmin}
        onDownload={(opts) => downloadGlossaryPdf(opts)}
        onDownloadVersion={(id) => downloadGlossaryVersionPdf(id)}
        onVersionsRefresh={() => { void refetchVersions(); }}
      />

      <Box sx={{ mt: 3, mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Sök term eller definition…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")} aria-label="Rensa sökning">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }
          }}
        />
      </Box>

      <Paper
        ref={indexBarRef}
        elevation={0}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          p: 1.5,
          mb: 3,
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          justifyContent: "center",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
        }}
      >
        {[...SWEDISH_ALPHABET, ...(lettersWithTerms.has(FALLBACK_LETTER) ? [FALLBACK_LETTER] : [])].map((letter) => {
          const enabled = lettersWithTerms.has(letter);
          return (
            <Button
              key={letter}
              size="small"
              variant={enabled ? "outlined" : "text"}
              disabled={!enabled}
              onClick={() => enabled && scrollToLetter(letter)}
              sx={{
                minWidth: 32,
                px: 1,
                py: 0.25,
                fontWeight: enabled ? 700 : 400,
                color: enabled ? "primary.main" : "text.disabled",
                borderColor: enabled ? "primary.main" : "transparent",
              }}
            >
              {letter}
            </Button>
          );
        })}
      </Paper>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : orderedLetters.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body1">
            {search ? `Inga termer matchar "${search}".` : "Inga termer i ordlistan ännu."}
          </Typography>
        </Box>
      ) : (
        orderedLetters.map((letter) => {
          const items = grouped.get(letter) ?? [];
          return (
            <Box key={letter} sx={{ mb: 4 }}>
              <Box
                id={sectionId(letter)}
                sx={{
                  scrollMarginTop: "80px",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1.5,
                  mb: 1.5,
                  pb: 0.75,
                  borderBottom: (theme) => `2px solid ${theme.palette.primary.main}`,
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 800, color: "primary.main" }}>
                  {letter === FALLBACK_LETTER ? "Övrigt" : letter}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {items.length} {items.length === 1 ? "term" : "termer"}
                </Typography>
              </Box>
              <Stack spacing={1.5}>
                {items.map((t) => (
                  <TermCard
                    key={t.id}
                    term={t}
                    isAdmin={isAdmin}
                    onEdit={() => openEdit(t)}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </Stack>
            </Box>
          );
        })
      )}

      <TermDialog
        open={dialogOpen}
        editing={editingId !== null}
        form={form}
        onChange={setForm}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />
    </Box>
  );
};

interface TermCardProps {
  term: GlossaryTerm;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const TermCard: React.FC<TermCardProps> = ({ term, isAdmin, onEdit, onDelete }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      borderLeft: (theme) => `4px solid ${theme.palette.primary.main}`,
      "&:hover": { boxShadow: 1 },
    }}
  >
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {term.term}
        </Typography>
        {term.definition && (
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", color: "text.primary", lineHeight: 1.6 }}
          >
            {term.definition}
          </Typography>
        )}
      </Box>
      {isAdmin && (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Redigera">
            <IconButton size="small" onClick={onEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Ta bort">
            <IconButton size="small" onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Stack>
    <Box sx={{ mt: 1 }}>
      <CommentsThread subjectType="glossary_term" subjectId={term.id} contextLabel={term.term} />
    </Box>
  </Paper>
);

interface DialogProps {
  open: boolean;
  editing: boolean;
  form: GlossaryTermCreate;
  onChange: (f: GlossaryTermCreate) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}

const TermDialog: React.FC<DialogProps> = ({ open, editing, form, onChange, onClose, onSave, saving }) => {
  const set = <K extends keyof GlossaryTermCreate>(key: K, value: GlossaryTermCreate[K]) =>
    onChange({ ...form, [key]: value });
  const valid = form.term.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{editing ? "Redigera term" : "Lägg till term"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Term"
            value={form.term}
            onChange={(e) => set("term", e.target.value)}
            required
            autoFocus
            helperText="Den första bokstaven används för att placera termen i indexet"
          />
          <TextField
            label="Definition"
            value={form.definition ?? ""}
            onChange={(e) => set("definition", e.target.value)}
            multiline
            minRows={4}
            helperText="Använd blank rad för nytt stycke"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button onClick={onSave} variant="contained" disabled={!valid || saving}>
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default Glossary;
