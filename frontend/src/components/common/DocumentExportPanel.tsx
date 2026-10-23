import React, { useState } from "react";
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
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  IconButton,
  Radio,
  RadioGroup,
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
import DownloadIcon from "@mui/icons-material/Download";
import PublishIcon from "@mui/icons-material/Publish";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import type { DocumentVersion, DocumentVersionList } from "@/api/targetArchitecture";
import type { DocumentTypeKey } from "@/api/documentMetadata";
import DocumentMetadataEditor from "./DocumentMetadataEditor";

export type DownloadOpts = {
  bump?: "major" | "minor";
  changeNote?: string;
  statuses?: string[];
  approved?: boolean;
};

interface Props {
  title: string;
  documentType: DocumentTypeKey;
  versions: DocumentVersionList | undefined;
  isLoading: boolean;
  isAdmin: boolean;
  onDownload: (opts: DownloadOpts) => Promise<void>;
  onDownloadVersion?: (versionId: string) => Promise<void>;
  onVersionsRefresh: () => void;
  /**
   * If set, clicking "Ladda ner PDF" first opens a checkbox dialog so the
   * user can choose which of these statuses to include. All pre-checked.
   * The selected statuses are forwarded as `opts.statuses` to `onDownload`.
   */
  availableStatuses?: string[];
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const DocumentExportPanel: React.FC<Props> = ({
  title,
  documentType,
  versions,
  isLoading,
  isAdmin,
  onDownload,
  onDownloadVersion,
  onVersionsRefresh,
  availableStatuses,
}) => {
  const [busy, setBusy] = useState<"download" | "minor" | "major" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [publishMajorOpen, setPublishMajorOpen] = useState(false);
  const [publishMajorNote, setPublishMajorNote] = useState("");
  const [publishMinorOpen, setPublishMinorOpen] = useState(false);
  const [publishMinorNote, setPublishMinorNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [versionType, setVersionType] = useState<"draft" | "approved">("draft");
  const [statusSelection, setStatusSelection] = useState<string[]>(availableStatuses ?? []);

  const runDownload = async (opts: DownloadOpts) => {
    const tag: "major" | "minor" | "download" =
      opts.bump === "major" ? "major" : opts.bump === "minor" ? "minor" : "download";
    setBusy(tag);
    setError(null);
    try {
      await onDownload(opts);
      onVersionsRefresh();
    } catch (e) {
      setError((e as Error)?.message ?? "Nedladdning misslyckades");
    } finally {
      setBusy(null);
    }
  };

  const handlePublishMajor = async () => {
    const note = publishMajorNote.trim();
    setPublishMajorOpen(false);
    setPublishMajorNote("");
    await runDownload({ bump: "major", changeNote: note || undefined });
  };

  const handlePublishMinor = async () => {
    const note = publishMinorNote.trim();
    setPublishMinorOpen(false);
    setPublishMinorNote("");
    await runDownload({ bump: "minor", changeNote: note || undefined });
  };

  const handleDownloadClick = () => {
    setStatusSelection(availableStatuses ?? []);
    setVersionType("draft");
    setDownloadDialogOpen(true);
  };

  const handleConfirmDownload = async () => {
    setDownloadDialogOpen(false);
    const opts: DownloadOpts = { approved: versionType === "approved" };
    if (availableStatuses && availableStatuses.length > 0) opts.statuses = statusSelection;
    await runDownload(opts);
  };

  const toggleStatus = (s: string) =>
    setStatusSelection((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const handleDownloadHistorical = async (versionId: string) => {
    if (!onDownloadVersion) return;
    setHistoryBusyId(versionId);
    setError(null);
    try {
      await onDownloadVersion(versionId);
    } catch (e) {
      setError((e as Error)?.message ?? "Nedladdning misslyckades");
    } finally {
      setHistoryBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Hämtar versioner…
        </Typography>
      </Box>
    );
  }

  const latest = versions?.latest;
  const pending = versions?.pending_changes ?? 0;
  const allVersions: DocumentVersion[] = versions?.items ?? [];

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.5,
        mb: 2,
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {title} — PDF-export
          </Typography>
          {latest ? (
            <Chip
              size="small"
              label={`Senaste: v${latest.version_major}.${latest.version_minor}${latest.is_major ? " (huvud)" : ""}`}
              color={latest.is_major ? "primary" : "default"}
              variant="outlined"
            />
          ) : (
            <Chip size="small" label="Ingen version än" variant="outlined" />
          )}
          {latest && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {formatDate(latest.created_at)}
              {latest.created_by ? ` · ${latest.created_by}` : ""}
            </Typography>
          )}
          {pending > 0 && (
            <Tooltip title="Ändringar som gjorts sedan senaste publicerade version.">
              <Chip
                size="small"
                color="warning"
                label={`${pending} ${pending === 1 ? "opublicerad ändring" : "opublicerade ändringar"}`}
              />
            </Tooltip>
          )}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Tooltip title="Välj dokumenttyp (delversion eller fastställd) och ladda ner senaste version som PDF.">
            <span>
              <Button
                variant="contained"
                size="small"
                startIcon={busy === "download" ? <CircularProgress size={14} /> : <DownloadIcon />}
                disabled={busy !== null}
                onClick={handleDownloadClick}
              >
                Ladda ner PDF
              </Button>
            </span>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Publicera nuvarande innehåll som ny delversion (t.ex. 0.1 → 0.2) med en egen kommentar.">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={busy === "minor" ? <CircularProgress size={14} /> : <PublishIcon />}
                  disabled={busy !== null}
                  onClick={() => {
                    setPublishMinorNote("");
                    setPublishMinorOpen(true);
                  }}
                >
                  Publicera delversion
                </Button>
              </span>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Publicera nuvarande innehåll som en ny huvudversion (t.ex. 1.0, 2.0). Bumpar major-numret.">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  color="primary"
                  startIcon={busy === "major" ? <CircularProgress size={14} /> : <PublishIcon />}
                  disabled={busy !== null}
                  onClick={() => {
                    setPublishMajorNote("");
                    setPublishMajorOpen(true);
                  }}
                >
                  Publicera huvudversion
                </Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Visa alla versioner med kommentarer och ladda ner äldre versioner.">
            <span>
              <Button
                variant="text"
                size="small"
                startIcon={<HistoryIcon />}
                onClick={() => setHistoryOpen(true)}
                disabled={allVersions.length === 0}
              >
                Versionshistorik
              </Button>
            </span>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Redigera metadata som visas i PDF-sidfoten (Ansvarig, Avdelning, m.m.)">
              <span>
                <Button
                  variant="text"
                  size="small"
                  startIcon={<SettingsIcon />}
                  onClick={() => setMetaOpen(true)}
                >
                  Sidfotsmetadata
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Dialog
        open={downloadDialogOpen}
        onClose={() => (busy ? undefined : setDownloadDialogOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Ladda ner PDF — {title}</DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mb: availableStatuses && availableStatuses.length > 0 ? 0 : 1 }}>
            <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>Dokumenttyp</FormLabel>
            <RadioGroup
              value={versionType}
              onChange={(e) => setVersionType(e.target.value as "draft" | "approved")}
            >
              <FormControlLabel
                value="draft"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Delversion</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Fastställt och Fastställt av lämnas tomma
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="approved"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Fastställd version</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Inkluderar fastställningsdatum och fastställt av från arkitekturresan
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>
          {availableStatuses && availableStatuses.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>
                Statusar att inkludera
              </FormLabel>
              <FormGroup>
                {availableStatuses.map((s) => (
                  <FormControlLabel
                    key={s}
                    control={
                      <Checkbox
                        size="small"
                        checked={statusSelection.includes(s)}
                        onChange={() => toggleStatus(s)}
                      />
                    }
                    label={s}
                  />
                ))}
              </FormGroup>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialogOpen(false)} disabled={busy !== null}>
            Avbryt
          </Button>
          <Button
            onClick={handleConfirmDownload}
            variant="contained"
            disabled={
              busy !== null ||
              (availableStatuses && availableStatuses.length > 0 && statusSelection.length === 0)
            }
            startIcon={busy === "download" ? <CircularProgress size={14} /> : <DownloadIcon />}
          >
            Ladda ner
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={publishMinorOpen}
        onClose={() => (busy ? undefined : setPublishMinorOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Publicera delversion — {title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            En ny delversion skapas av det nuvarande innehållet (minor-numret
            bumpas, t.ex. 0.1 → 0.2). Kommentaren sparas på versionen och syns
            i PDF:en samt i versionshistoriken.
          </DialogContentText>
          <TextField
            autoFocus
            label="Kommentar (frivillig)"
            placeholder='T.ex. "Justering av principformuleringar"'
            value={publishMinorNote}
            onChange={(e) => setPublishMinorNote(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishMinorOpen(false)} disabled={busy !== null}>
            Avbryt
          </Button>
          <Button
            onClick={handlePublishMinor}
            variant="contained"
            disabled={busy !== null}
            startIcon={busy === "minor" ? <CircularProgress size={14} /> : <PublishIcon />}
          >
            Bekräfta publicering
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={publishMajorOpen}
        onClose={() => (busy ? undefined : setPublishMajorOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Publicera huvudversion — {title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            En ny huvudversion skapas av det nuvarande innehållet (major-numret
            bumpas, t.ex. 1.0 → 2.0). Kommentaren sparas på versionen och syns
            i PDF:en samt i versionshistoriken.
          </DialogContentText>
          <TextField
            autoFocus
            label="Kommentar (frivillig)"
            placeholder='T.ex. "Beslutat av arkitekturrådet 2026-05-15"'
            value={publishMajorNote}
            onChange={(e) => setPublishMajorNote(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishMajorOpen(false)} disabled={busy !== null}>
            Avbryt
          </Button>
          <Button
            onClick={handlePublishMajor}
            variant="contained"
            color="primary"
            disabled={busy !== null}
            startIcon={busy === "major" ? <CircularProgress size={14} /> : <PublishIcon />}
          >
            Bekräfta publicering
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Versionshistorik — {title}</DialogTitle>
        <DialogContent>
          {allVersions.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Inga versioner ännu.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Skapad</TableCell>
                    <TableCell>Av</TableCell>
                    <TableCell>Kommentar</TableCell>
                    <TableCell align="right">Ladda ner</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allVersions.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            v{v.version_major}.{v.version_minor}
                          </Typography>
                          {v.is_major && (
                            <Chip label="huvud" size="small" color="primary" variant="outlined" />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDateTime(v.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{v.created_by ?? "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            whiteSpace: "pre-wrap",
                            color: v.change_summary ? "text.primary" : "text.disabled",
                            fontStyle: v.change_summary ? "normal" : "italic",
                          }}
                        >
                          {v.change_summary || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {onDownloadVersion ? (
                          <Tooltip title="Ladda ner denna version som PDF">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleDownloadHistorical(v.id)}
                                disabled={historyBusyId !== null}
                              >
                                {historyBusyId === v.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <DownloadIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Stäng</Button>
        </DialogActions>
      </Dialog>

      <DocumentMetadataEditor
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        documentType={documentType}
        title={title}
      />
    </Box>
  );
};

export default DocumentExportPanel;
