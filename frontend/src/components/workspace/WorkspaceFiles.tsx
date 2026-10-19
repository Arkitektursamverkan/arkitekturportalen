import React, { useRef, useState } from "react";
import {
  Alert, Box, Button, IconButton, LinearProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AddLinkIcon from "@mui/icons-material/AddLink";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import {
  downloadWorkspaceFile, useCreateLink, useDeleteFile, useUploadFile, useWorkspaceFiles,
} from "@/api/workspaces";

const MAX_MB = 25;
// File uploads are hidden for now; only links can be added. Existing files can still be downloaded.
const UPLOADS_ENABLED = false;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  workspaceId: string;
  canEdit: boolean;
}

const WorkspaceFiles: React.FC<Props> = ({ workspaceId, canEdit }) => {
  const { data: files = [] } = useWorkspaceFiles(workspaceId);
  const upload = useUploadFile(workspaceId);
  const createLink = useCreateLink(workspaceId);
  const del = useDeleteFile(workspaceId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Filen är för stor (max ${MAX_MB} MB).`);
      return;
    }
    try {
      await upload.mutateAsync({ file, description: description.trim() });
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uppladdningen misslyckades");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const addLink = async () => {
    setError(null);
    if (!/^https?:\/\//i.test(linkUrl.trim())) {
      setError("Länken måste börja med https:// eller http://");
      return;
    }
    try {
      await createLink.mutateAsync({
        title: linkTitle.trim(),
        url: linkUrl.trim(),
        description: linkDescription.trim(),
      });
      setLinkTitle("");
      setLinkUrl("");
      setLinkDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Länken kunde inte sparas");
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {canEdit && (
        <Box sx={{ mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
            <TextField
              size="small"
              label="Titel"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <TextField
              size="small"
              label="Länk (https://…)"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              sx={{ flex: 1, minWidth: 260 }}
            />
            <TextField
              size="small"
              label="Beskrivning (valfritt)"
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              sx={{ minWidth: 220 }}
            />
            <Button
              variant="contained"
              startIcon={<AddLinkIcon />}
              disabled={createLink.isPending || !linkTitle.trim() || !linkUrl.trim()}
              onClick={addLink}
              sx={{ whiteSpace: "nowrap" }}
            >
              Lägg till länk
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Länka till dokument som förvaltas någon annanstans, t.ex. i SharePoint, så att det inte uppstår inaktuella kopior.
          </Typography>
        </Box>
      )}

      {UPLOADS_ENABLED && canEdit && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems="center">
          <TextField
            size="small"
            label="Beskrivning (valfritt)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ minWidth: 320 }}
          />
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            Ladda upp fil
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => handlePick(e.target.files?.[0])}
          />
          <Typography variant="caption" color="text.secondary">Max {MAX_MB} MB per fil</Typography>
        </Stack>
      )}
      {upload.isPending && <LinearProgress sx={{ mb: 2 }} />}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Namn</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Beskrivning</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Storlek</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Tillagd</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {files.map((f) => (
            <TableRow key={f.id} hover>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  {f.url
                    ? <LinkIcon fontSize="small" color="action" />
                    : <InsertDriveFileOutlinedIcon fontSize="small" color="action" />}
                  <Typography variant="body2">{f.filename}</Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">{f.description || "—"}</Typography>
              </TableCell>
              <TableCell>{f.url ? "—" : formatSize(f.size_bytes)}</TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {new Date(f.uploaded_at).toLocaleDateString("sv-SE")}
                  {f.uploaded_by ? ` · ${f.uploaded_by}` : ""}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {f.url ? (
                  <Tooltip title={f.url}>
                    <IconButton size="small" component="a" href={f.url} target="_blank" rel="noopener noreferrer">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Ladda ner">
                    <IconButton
                      size="small"
                      onClick={() =>
                        downloadWorkspaceFile(workspaceId, f).catch((e) =>
                          setError(e instanceof Error ? e.message : "Nedladdningen misslyckades"),
                        )
                      }
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip title="Ta bort">
                    <IconButton size="small" onClick={() => del.mutate(f.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
          {files.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                Inga länkar ännu.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
};

export default WorkspaceFiles;
