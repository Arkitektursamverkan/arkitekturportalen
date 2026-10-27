import React, { useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AddLinkIcon from "@mui/icons-material/AddLink";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import LockIcon from "@mui/icons-material/Lock";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useTranslation } from "react-i18next";
import ErrorAlert from "@/components/common/ErrorAlert";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import PdfViewerWindow, { type PdfSource } from "@/components/common/PdfViewerWindow";
import { canViewSharePoint, fetchSharePointPdf, isSharePointUrl } from "@/api/sharepoint";
import {
  DOCUMENT_TYPES, fetchDocumentBlob, fetchDocumentFile, useCreateLink, useDeleteDocument, useDocumentVersions,
  useNodeDocuments, useUpdateDocument, useUploadDocument, useUploadVersion,
  type DocumentMeta, type NodeDocument, type NodePermissions,
} from "@/api/nodeContent";

const MAX_MB = 25;
// File uploads are hidden for now; only links can be added. Existing files can still be downloaded.
const UPLOADS_ENABLED = false;
// Mirrors the backend's allow-list; the backend is what enforces it.
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.vsd,.vsdx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.json,.xml,.bpmn,.png,.jpg,.jpeg,.gif,.webp,.msg,.eml,.zip";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
const today = () => new Date().toISOString().slice(0, 10);

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

type DialogState =
  | { mode: "file" }
  | { mode: "link" }
  | { mode: "edit"; doc: NodeDocument }
  | { mode: "versions"; doc: NodeDocument }
  | { mode: "delete"; doc: NodeDocument }
  | null;

const ObjectDocuments: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useNodeDocuments(nodeId);
  const del = useDeleteDocument(nodeId);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PdfSource | null>(null);

  if (isLoading) return <LoadingSpinner height={200} />;
  if (error || !data) return <ErrorAlert error={error as Error} />;

  const { permissions, documents } = data;
  const fetchFile = (doc: NodeDocument) => {
    if (!doc.current_version) return;
    fetchDocumentFile(doc.node_id, doc.id, doc.current_version).catch((e) =>
      setFailure(errorText(e, t("common.error"))),
    );
  };
  const view = (doc: NodeDocument) => {
    const v = doc.current_version;
    if (v) {
      setViewing({ title: doc.title, load: async () => ({ blob: await fetchDocumentBlob(doc.node_id, doc.id, v), name: v.filename }) });
    } else if (doc.url) {
      const url = doc.url;
      setViewing({ title: doc.title, sourceUrl: url, load: () => fetchSharePointPdf(url) });
    }
  };

  return (
    <Box sx={{ maxWidth: 1100 }}>
      {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}

      {permissions.write_documents && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {UPLOADS_ENABLED && (
            <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setDialog({ mode: "file" })}>
              {t("objectContent.docs.upload")}
            </Button>
          )}
          <Button variant={UPLOADS_ENABLED ? "outlined" : "contained"} startIcon={<AddLinkIcon />} onClick={() => setDialog({ mode: "link" })}>
            {t("objectContent.docs.addLink")}
          </Button>
        </Stack>
      )}

      {documents.length === 0 ? (
        <Typography sx={{ color: "text.secondary", py: 3 }}>
          {permissions.write_documents ? t("objectContent.docs.empty") : t("objectContent.docs.emptyReadOnly")}
        </Typography>
      ) : (
        <DocumentTable
          docs={documents}
          onFetch={fetchFile}
          onView={view}
          onEdit={(doc) => setDialog({ mode: "edit", doc })}
          onVersions={(doc) => setDialog({ mode: "versions", doc })}
          onDelete={(doc) => setDialog({ mode: "delete", doc })}
        />
      )}

      {(dialog?.mode === "file" || dialog?.mode === "link" || dialog?.mode === "edit") && (
        <DocumentDialog
          nodeId={nodeId}
          mode={dialog.mode}
          doc={dialog.mode === "edit" ? dialog.doc : undefined}
          permissions={permissions}
          onClose={() => setDialog(null)}
        />
      )}
      {viewing && <PdfViewerWindow source={viewing} onClose={() => setViewing(null)} />}
      {dialog?.mode === "versions" && (
        <VersionsDialog nodeId={nodeId} doc={dialog.doc} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === "delete" && (
        <Dialog open onClose={() => setDialog(null)}>
          <DialogTitle>{t("objectContent.docs.delete")}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t("objectContent.docs.confirmDelete", { title: dialog.doc.title })}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
            <Button
              color="error"
              variant="contained"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(dialog.doc.id, {
                  onSuccess: () => setDialog(null),
                  onError: (e) => { setDialog(null); setFailure(errorText(e, t("common.error"))); },
                })
              }
            >
              {t("objectContent.docs.delete")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

// ── Table ───────────────────────────────────────────────────────────────────

interface TableProps {
  docs: NodeDocument[];
  onFetch: (doc: NodeDocument) => void;
  onView: (doc: NodeDocument) => void;
  onEdit: (doc: NodeDocument) => void;
  onVersions: (doc: NodeDocument) => void;
  onDelete: (doc: NodeDocument) => void;
}

const DocumentTable: React.FC<TableProps> = ({ docs, onFetch, onView, onEdit, onVersions, onDelete }) => {
  const { t } = useTranslation();

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 700 }}>{t("objectContent.docs.title")}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{t("objectContent.docs.type")}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{t("objectContent.docs.file")}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{t("objectContent.docs.reviewDate")}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{t("objectContent.docs.updated")}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {docs.map((d) => {
          const v = d.current_version;
          const overdue = d.review_date !== null && d.review_date < today();
          return (
            <TableRow key={d.id} hover>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                  {d.kind === "link"
                    ? <LinkIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    : <InsertDriveFileOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />}
                  <Box>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{d.title}</Typography>
                      {d.classification === "begransad" && (
                        <Chip
                          icon={<LockIcon sx={{ fontSize: 12 }} />}
                          label={t("objectContent.docs.classifications.begransad")}
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      )}
                    </Stack>
                    {d.description && (
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>{d.description}</Typography>
                    )}
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>{t(`objectContent.docs.types.${d.doc_type}`)}</TableCell>
              <TableCell>
                {v ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t("objectContent.docs.versionLabel", { n: v.version_no })} · {formatSize(v.size_bytes)}
                  </Typography>
                ) : (
                  <Typography variant="body2" noWrap title={d.url ?? ""} sx={{ color: "text.secondary", maxWidth: 220 }}>
                    {d.url}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {d.review_date ? (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    {overdue && (
                      <Tooltip title={t("objectContent.docs.reviewOverdue")}>
                        <WarningAmberIcon fontSize="small" color="warning" />
                      </Tooltip>
                    )}
                    <Typography variant="body2" sx={{ color: overdue ? "warning.main" : "text.secondary" }}>{d.review_date}</Typography>
                  </Stack>
                ) : "—"}
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {formatDate(d.updated_at)}{d.updated_by ? ` · ${d.updated_by}` : ""}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {(v?.content_type === "application/pdf" || (d.kind === "link" && canViewSharePoint && isSharePointUrl(d.url))) && (
                  <Tooltip title={t("objectContent.docs.viewPdf")}>
                    <IconButton size="small" onClick={() => onView(d)}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {d.kind === "link" && d.url && (
                  <Tooltip title={t("objectContent.docs.openLink")}>
                    <IconButton size="small" component="a" href={d.url} target="_blank" rel="noopener noreferrer">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {v && (
                  <Tooltip title={t("objectContent.docs.download")}>
                    <IconButton size="small" onClick={() => onFetch(d)}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {v && (
                  <Tooltip title={t("objectContent.docs.versions")}>
                    <IconButton size="small" onClick={() => onVersions(d)}>
                      <HistoryIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {d.can_edit && (
                  <Tooltip title={t("objectContent.docs.edit")}>
                    <IconButton size="small" onClick={() => onEdit(d)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {d.can_edit && (
                  <Tooltip title={t("objectContent.docs.delete")}>
                    <IconButton size="small" onClick={() => onDelete(d)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

// ── Add / edit ──────────────────────────────────────────────────────────────

interface DialogProps {
  nodeId: string;
  mode: "file" | "link" | "edit";
  doc?: NodeDocument;
  permissions: NodePermissions;
  onClose: () => void;
}

const DocumentDialog: React.FC<DialogProps> = ({ nodeId, mode, doc, permissions, onClose }) => {
  const { t } = useTranslation();
  const upload = useUploadDocument(nodeId);
  const createLink = useCreateLink(nodeId);
  const update = useUpdateDocument(nodeId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(doc?.url ?? "");
  const [meta, setMeta] = useState<DocumentMeta>({
    title: doc?.title ?? "",
    doc_type: doc?.doc_type ?? "ovrigt",
    description: doc?.description ?? "",
    classification: doc?.classification ?? "intern",
    review_date: doc?.review_date ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof DocumentMeta>(k: K, v: DocumentMeta[K]) => setMeta((m) => ({ ...m, [k]: v }));

  const isLink = mode === "link" || doc?.kind === "link";
  const pending = upload.isPending || createLink.isPending || update.isPending;
  const canSave =
    !pending &&
    (mode === "file" ? file !== null : meta.title.trim() !== "") &&
    (!isLink || url.trim() !== "");

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(t("objectContent.docs.tooLarge", { mb: MAX_MB }));
      return;
    }
    setError(null);
    setFile(f);
    if (!meta.title.trim()) set("title", f.name.replace(/\.[^.]+$/, ""));
  };

  const save = async () => {
    setError(null);
    if (isLink && !/^https?:\/\//i.test(url.trim())) {
      setError(t("objectContent.docs.urlInvalid"));
      return;
    }
    const clean = { ...meta, title: meta.title.trim(), description: meta.description.trim() };
    try {
      if (mode === "file" && file) await upload.mutateAsync({ file, meta: clean });
      else if (mode === "link") await createLink.mutateAsync({ ...clean, url: url.trim() });
      else if (doc) await update.mutateAsync({ docId: doc.id, patch: isLink ? { ...clean, url: url.trim() } : clean });
      onClose();
    } catch (e) {
      setError(errorText(e, t("common.error")));
    }
  };

  const title = mode === "file"
    ? t("objectContent.docs.dialogUpload")
    : mode === "link" ? t("objectContent.docs.dialogLink") : t("objectContent.docs.dialogEdit");

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {mode === "file" && (
            <Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()}>
                  {t("objectContent.docs.chooseFile")}
                </Button>
                <Typography variant="body2" noWrap sx={{ color: file ? "text.primary" : "text.secondary" }}>
                  {file ? `${file.name} (${formatSize(file.size)})` : t("objectContent.docs.noFile")}
                </Typography>
              </Stack>
              <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("objectContent.docs.maxSize", { mb: MAX_MB })}</Typography>
            </Box>
          )}
          {mode === "link" && <Alert severity="info" variant="outlined">{t("objectContent.docs.linkHint")}</Alert>}
          {isLink && (
            <TextField label={t("objectContent.docs.url")} value={url} onChange={(e) => setUrl(e.target.value)} fullWidth size="small" autoFocus={mode === "link"} />
          )}
          <TextField label={t("objectContent.docs.title")} value={meta.title} onChange={(e) => set("title", e.target.value)} fullWidth size="small" />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label={t("objectContent.docs.type")}
              value={meta.doc_type}
              onChange={(e) => set("doc_type", e.target.value as DocumentMeta["doc_type"])}
              size="small"
              sx={{ flex: 1 }}
            >
              {DOCUMENT_TYPES.map((dt) => <MenuItem key={dt} value={dt}>{t(`objectContent.docs.types.${dt}`)}</MenuItem>)}
            </TextField>
            <TextField
              type="date"
              label={t("objectContent.docs.reviewDate")}
              value={meta.review_date ?? ""}
              onChange={(e) => set("review_date", e.target.value || null)}
              size="small"
              sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <TextField
            label={t("objectContent.docs.description")}
            value={meta.description}
            onChange={(e) => set("description", e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
          />
          {permissions.read_restricted && (
            <TextField
              select
              label={t("objectContent.docs.classification")}
              value={meta.classification}
              onChange={(e) => set("classification", e.target.value as DocumentMeta["classification"])}
              size="small"
              helperText={meta.classification === "begransad" ? t("objectContent.docs.restrictedHint") : undefined}
            >
              <MenuItem value="intern">{t("objectContent.docs.classifications.intern")}</MenuItem>
              <MenuItem value="begransad">{t("objectContent.docs.classifications.begransad")}</MenuItem>
            </TextField>
          )}
          {pending && <LinearProgress />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!canSave} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Versions ────────────────────────────────────────────────────────────────

const VersionsDialog: React.FC<{ nodeId: string; doc: NodeDocument; onClose: () => void }> = ({ nodeId, doc, onClose }) => {
  const { t } = useTranslation();
  const { data: versions = [], isLoading } = useDocumentVersions(nodeId, doc.id);
  const uploadVersion = useUploadVersion(nodeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(t("objectContent.docs.tooLarge", { mb: MAX_MB }));
      return;
    }
    try {
      await uploadVersion.mutateAsync({ docId: doc.id, file: f, comment: comment.trim() });
      setComment("");
    } catch (e) {
      setError(errorText(e, t("common.error")));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("objectContent.docs.dialogVersions", { title: doc.title })}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {UPLOADS_ENABLED && doc.can_edit && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2, pt: 1 }}>
            <TextField
              size="small"
              label={t("objectContent.docs.versionComment")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={<UploadFileIcon />}
              disabled={uploadVersion.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {t("objectContent.docs.newVersion")}
            </Button>
            <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
          </Stack>
        )}
        {uploadVersion.isPending && <LinearProgress sx={{ mb: 2 }} />}
        {isLoading ? <LoadingSpinner height={120} /> : (
          <Table size="small">
            <TableBody>
              {versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell sx={{ width: 50 }}>
                    <Chip label={t("objectContent.docs.versionLabel", { n: v.version_no })} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{v.filename}</Typography>
                    {v.comment && <Typography variant="caption" sx={{ color: "text.secondary" }}>{v.comment}</Typography>}
                  </TableCell>
                  <TableCell>{formatSize(v.size_bytes)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {formatDate(v.uploaded_at)}{v.uploaded_by ? ` · ${v.uploaded_by}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t("objectContent.docs.download")}>
                      <IconButton
                        size="small"
                        onClick={() => fetchDocumentFile(nodeId, doc.id, v).catch((e) => setError(errorText(e, t("common.error"))))}
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ObjectDocuments;
