import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import {
  type DocumentTypeKey,
  type MetadataEntry,
  useDocumentMetadata,
  useUpdateDocumentMetadata,
} from "@/api/documentMetadata";

interface Props {
  open: boolean;
  onClose: () => void;
  documentType: DocumentTypeKey;
  title: string;
}

export const DocumentMetadataEditor: React.FC<Props> = ({ open, onClose, documentType, title }) => {
  const { data, isLoading } = useDocumentMetadata(documentType);
  const updater = useUpdateDocumentMetadata(documentType);
  const [entries, setEntries] = useState<MetadataEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && data) {
      setEntries(data.entries.map((e) => ({ ...e })));
      setError(null);
    }
  }, [open, data]);

  const updateEntry = (i: number, patch: Partial<MetadataEntry>) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const removeEntry = (i: number) => setEntries((prev) => prev.filter((_, idx) => idx !== i));

  const addEntry = () =>
    setEntries((prev) => [...prev, { label: "", value: "" }]);

  const move = (i: number, delta: -1 | 1) => {
    const target = i + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[i], next[target]] = [next[target], next[i]];
    setEntries(next);
  };

  const save = async () => {
    setError(null);
    const cleaned = entries
      .map((e) => ({ label: e.label.trim(), value: e.value.trim() }))
      .filter((e) => e.label.length > 0);
    try {
      await updater.mutateAsync(cleaned);
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? "Kunde inte spara metadata");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Sidfotsmetadata — {title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Fält som visas i PDF-sidfoten. Raderna fördelas växelvis i vänster
          och höger kolumn. Auto-fält (Dokumentnamn, Uppdaterad/genomgången)
          ankrar översta raden och hanteras automatiskt.
        </Typography>

        {isLoading ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Laddar…</Typography>
        ) : (
          <Stack spacing={1}>
            {entries.map((e, i) => (
              <Stack
                key={i}
                direction="row"
                spacing={1}
                sx={{ alignItems: "center" }}
              >
                <TextField
                  label="Etikett"
                  value={e.label}
                  onChange={(ev) => updateEntry(i, { label: ev.target.value })}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Värde"
                  value={e.value}
                  onChange={(ev) => updateEntry(i, { value: ev.target.value })}
                  size="small"
                  sx={{ flex: 2 }}
                />
                <Tooltip title="Flytta upp">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Flytta ner">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => move(i, 1)}
                      disabled={i === entries.length - 1}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Ta bort rad">
                  <IconButton size="small" color="error" onClick={() => removeEntry(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
            <Box>
              <Button startIcon={<AddIcon />} onClick={addEntry} size="small">
                Lägg till rad
              </Button>
            </Box>
          </Stack>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button variant="contained" onClick={save} disabled={updater.isPending}>
          {updater.isPending ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DocumentMetadataEditor;
