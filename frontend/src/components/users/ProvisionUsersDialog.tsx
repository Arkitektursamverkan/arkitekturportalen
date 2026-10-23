import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  useProvisionCandidates,
  useProvisionUsers,
  type ProvisionCandidate,
  type ProvisionResult,
} from "@/api/users";

const ROLE_ATTRIBUTES = ["systemförvaltare", "systemägare", "systemadministratör"];

interface Props {
  open: boolean;
  onClose: () => void;
}

interface RowState {
  selected: boolean;
  email: string;
}

const candidateKey = (c: ProvisionCandidate) => c.suggested_email || c.name.toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ProvisionUsersDialog: React.FC<Props> = ({ open, onClose }) => {
  const [attributeKeys, setAttributeKeys] = useState<string[]>(ROLE_ATTRIBUTES);
  const { data: candidates, isLoading } = useProvisionCandidates(attributeKeys, open);
  const provision = useProvisionUsers();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  useEffect(() => {
    if (!candidates) return;
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const c of candidates) {
        const key = candidateKey(c);
        next[key] = prev[key] ?? {
          selected: !c.existing_user_id && !!c.suggested_email,
          email: c.suggested_email,
        };
      }
      return next;
    });
  }, [candidates]);

  const toggleAttribute = (attr: string) => {
    setAttributeKeys((keys) =>
      keys.includes(attr) ? keys.filter((k) => k !== attr) : [...keys, attr],
    );
  };

  const newCandidates = useMemo(
    () => (candidates ?? []).filter((c) => !c.existing_user_id),
    [candidates],
  );
  const selectedEntries = useMemo(
    () =>
      newCandidates
        .map((c) => ({ candidate: c, state: rows[candidateKey(c)] }))
        .filter((e) => e.state?.selected),
    [newCandidates, rows],
  );
  const invalidCount = selectedEntries.filter((e) => !EMAIL_RE.test(e.state.email.trim())).length;

  const allSelected = newCandidates.length > 0 && selectedEntries.length === newCandidates.length;
  const toggleAll = () => {
    setRows((prev) => {
      const next = { ...prev };
      for (const c of newCandidates) {
        const key = candidateKey(c);
        next[key] = { ...(next[key] ?? { email: c.suggested_email }), selected: !allSelected };
      }
      return next;
    });
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    provision.reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      const res = await provision.mutateAsync(
        selectedEntries.map((e) => ({
          name: e.candidate.name,
          email: e.state.email.trim().toLowerCase(),
        })),
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa användarna");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Förbered användare från systemroller</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Listan bygger på personer som står som systemroll på objekten. E-postadressen föreslås
          som fornamn.efternamn — kontrollera och justera vid behov. Användarna skapas i förväg
          så att enkäter kan tilldelas dem innan de loggat in första gången; vid första
          Microsoft-inloggningen kopplas kontot ihop via e-postadressen.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <Typography variant="body2" sx={{ mr: 1 }}>
            Roller:
          </Typography>
          {ROLE_ATTRIBUTES.map((attr) => (
            <Chip
              key={attr}
              label={attr.charAt(0).toUpperCase() + attr.slice(1)}
              size="small"
              color={attributeKeys.includes(attr) ? "primary" : "default"}
              variant={attributeKeys.includes(attr) ? "filled" : "outlined"}
              onClick={() => toggleAttribute(attr)}
            />
          ))}
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert severity={result.skipped.length ? "warning" : "success"} sx={{ mb: 2 }}>
            {result.created.length} användare skapades.
            {result.skipped.length > 0 && (
              <>
                {" "}
                {result.skipped.length} hoppades över:{" "}
                {result.skipped.map((s) => s.email).join(", ")}
              </>
            )}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={selectedEntries.length > 0 && !allSelected}
                      onChange={toggleAll}
                      disabled={newCandidates.length === 0}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Namn</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>E-post</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Roller</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Applikation</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(candidates ?? []).map((c) => {
                  const key = candidateKey(c);
                  const state = rows[key];
                  const exists = !!c.existing_user_id;
                  const email = state?.email ?? c.suggested_email;
                  const emailInvalid = !exists && !!state?.selected && !EMAIL_RE.test(email.trim());
                  const systems = [...new Set(c.sources.map((s) => s.node_name))];
                  return (
                    <TableRow key={key} hover sx={exists ? { opacity: 0.6 } : undefined}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={!exists && !!state?.selected}
                          disabled={exists}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [key]: { email: prev[key]?.email ?? email, selected: e.target.checked },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{c.name}</Typography>
                      </TableCell>
                      <TableCell>
                        {exists ? (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {c.suggested_email || "–"}
                          </Typography>
                        ) : (
                          <TextField
                            size="small"
                            fullWidth
                            value={email}
                            error={emailInvalid}
                            helperText={
                              c.email_is_guessed && !emailInvalid ? "Föreslagen — kontrollera" : emailInvalid ? "Ogiltig e-postadress" : undefined
                            }
                            onChange={(e) =>
                              setRows((prev) => ({
                                ...prev,
                                [key]: { selected: prev[key]?.selected ?? false, email: e.target.value },
                              }))
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                          {c.roles.map((r) => (
                            <Chip key={r} label={r} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={systems.join(", ")}>
                          <Typography variant="body2" noWrap sx={{ color: "text.secondary", maxWidth: 220 }}>
                            {systems.length === 1 ? systems[0] : `${systems.length} applikationer`}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={exists ? "Har konto" : "Ny"}
                          size="small"
                          color={exists ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(candidates ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Inga personer hittades i de valda systemrollerna.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Stäng</Button>
        <Button
          variant="contained"
          disabled={selectedEntries.length === 0 || invalidCount > 0 || provision.isPending}
          onClick={submit}
        >
          {provision.isPending
            ? "Skapar…"
            : `Skapa ${selectedEntries.length} användare`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProvisionUsersDialog;
