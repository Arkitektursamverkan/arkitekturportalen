import React, { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import {
  usePreviewCsv,
  useImportCsv,
  usePreviewUnifiedCsv,
  useImportUnifiedCsv,
  downloadCsvExport,
  type CsvPreviewRow,
  type UnifiedPreviewResult,
  type UnifiedImportResult,
} from "@/api/import";
import { NODE_COLORS } from "@/config/graphConfig";
import type { NodeType } from "@/types/graph";

// ── Entity configuration ──────────────────────────────────────────────────────

interface EntityConfig {
  slug: string;
  labelKey: string;
  columns: string[];   // all columns, in order
  filename: string;
  /** Re-import updates the object with the same name (servers, server services). */
  keyedByName?: boolean;
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    slug: "processes",
    labelKey: "csvImport.entities.processes",
    columns: ["name", "description", "owner", "category", "frequency", "parent_id"],
    filename: "processer_mall.csv",
  },
  {
    slug: "applications",
    labelKey: "csvImport.entities.applications",
    columns: ["name", "description", "vendor", "category", "application_owner", "business_owner", "lifecycle_stage", "hosting"],
    filename: "applikationer_mall.csv",
  },
  {
    slug: "information-objects",
    labelKey: "csvImport.entities.informationObjects",
    columns: ["name", "description", "definition", "data_owner", "classification", "domain"],
    filename: "informationsobjekt_mall.csv",
  },
  {
    slug: "information-sources",
    labelKey: "csvImport.entities.informationSources",
    columns: ["name", "description", "system", "type", "classification"],
    filename: "informationskallor_mall.csv",
  },
  {
    slug: "tech-components",
    labelKey: "csvImport.entities.techComponents",
    columns: ["name", "description", "vendor", "component_type", "hosting", "platform", "version", "capacity", "technical_owner", "support_team", "maintenance_schedule", "security_classification"],
    filename: "teknikkomponenter_mall.csv",
  },
  {
    slug: "servers",
    labelKey: "csvImport.entities.servers",
    columns: ["name", "description", "hostname", "server_type", "operating_system", "environment", "location", "responsible"],
    filename: "servrar_mall.csv",
    keyedByName: true,
  },
  {
    slug: "server-services",
    labelKey: "csvImport.entities.serverServices",
    columns: ["name", "description", "vendor", "component_type", "hosting_type", "environment", "lifecycle_status", "responsible", "servers"],
    filename: "servertjanster_mall.csv",
    keyedByName: true,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const ImportCSV: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<0 | 1>(0); // 0 = per type, 1 = unified
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    created: number; updated: number; connections?: number; errors: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const preview = usePreviewCsv();
  const doImport = useImportCsv();

  const entityConfig = ENTITY_CONFIGS[tabIndex];

  const resetFileState = () => {
    setSelectedFile(null);
    setPreviewRows(null);
    setParseErrors([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTabChange = (_: React.SyntheticEvent, newIndex: number) => {
    setTabIndex(newIndex);
    resetFileState();
  };

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
    setPreviewRows(null);
    setParseErrors([]);
    try {
      const result = await preview.mutateAsync({ entity: entityConfig.slug, file });
      setPreviewRows(result.rows);
      setParseErrors(result.errors);
    } catch {
      enqueueSnackbar(t("csvImport.previewError"), { variant: "error" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    try {
      const result = await doImport.mutateAsync({ entity: entityConfig.slug, file: selectedFile });
      setImportResult(result);
      enqueueSnackbar(
        t("csvImport.success", { created: result.created, updated: result.updated }),
        { variant: "success" },
      );
    } catch {
      enqueueSnackbar(t("csvImport.importError"), { variant: "error" });
    }
  };

  const entityLabel = t(entityConfig.labelKey);
  const extraColumns = entityConfig.columns.filter((c) => !["name", "description"].includes(c));

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="h5">{t("csvImport.title")}</Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={() => {
            downloadCsvExport().catch(() => enqueueSnackbar(t("csvImport.export.error", { defaultValue: "Exporten misslyckades" }), { variant: "error" }));
          }}
        >
          {t("csvImport.export.button")}
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("csvImport.subtitle")}
      </Typography>

      {/* ── Mode tabs: Complete / Per type ── */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs value={mode} onChange={(_, v) => { setMode(v); resetFileState(); }}>
          <Tab label={t("csvImport.modes.unified")} />
          <Tab label={t("csvImport.modes.perType")} />
        </Tabs>
      </Box>

      {mode === 0 && <UnifiedImportPanel />}

      {mode === 1 && <>
      {/* ── Entity type tabs ── */}
      <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={tabIndex}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1 }}
        >
          {ENTITY_CONFIGS.map((cfg) => (
            <Tab key={cfg.slug} label={t(cfg.labelKey)} />
          ))}
        </Tabs>
      </Paper>

      {/* ── Step 1: Template ── */}
      <StepCard step="1" title={t("csvImport.step1.title")}>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {t("csvImport.step1.description")}
        </Typography>
        {entityConfig.keyedByName && (
          <Alert severity="info" sx={{ mb: 2 }}>{t("csvImport.step1.keyedByName")}</Alert>
        )}
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          href={`/api/v1/import/csv/template/${entityConfig.slug}`}
          download={entityConfig.filename}
        >
          {t("csvImport.step1.download", { entity: entityLabel })}
        </Button>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5 }}>
            {t("csvImport.step1.columns")}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
            {entityConfig.columns.map((col) => (
              <Chip
                key={col}
                label={col === "name" ? `${t(`csvImport.columns.${col}`)} *` : t(`csvImport.columns.${col}`, { defaultValue: col })}
                size="small"
                variant={col === "name" ? "filled" : "outlined"}
                color={col === "name" ? "primary" : "default"}
              />
            ))}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
            * {t("csvImport.step1.required")}
          </Typography>
        </Box>
      </StepCard>

      {/* ── Step 2: Upload ── */}
      <StepCard step="2" title={t("csvImport.step2.title")}>
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
            cursor: "pointer",
            bgcolor: dragOver ? "primary.50" : "background.default",
            transition: "all 0.15s",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          <UploadFileIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {t("csvImport.step2.dropzone")}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("csvImport.step2.or")}
          </Typography>
          {preview.isPending && (
            <CircularProgress size={24} sx={{ mt: 1 }} />
          )}
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {selectedFile && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
            <Chip
              label={selectedFile.name}
              onDelete={resetFileState}
              color="primary"
              variant="outlined"
              size="small"
            />
          </Stack>
        )}
      </StepCard>

      {/* ── Parse errors ── */}
      {parseErrors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t("csvImport.parseWarnings")}</Typography>
          {parseErrors.map((e, i) => <Typography key={i} variant="body2">• {e}</Typography>)}
        </Alert>
      )}

      {/* ── Step 3: Preview ── */}
      {previewRows !== null && (
        <StepCard step="3" title={t("csvImport.step3.title", { count: previewRows.length })}>
          {previewRows.length === 0 ? (
            <Typography sx={{ color: "text.secondary" }}>{t("csvImport.step3.noRows")}</Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("csvImport.columns.name")}</TableCell>
                      <TableCell>{t("csvImport.columns.description")}</TableCell>
                      {extraColumns.map((col) => (
                        <TableCell key={col}>
                          {t(`csvImport.columns.${col}`, { defaultValue: col })}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.description}
                        </TableCell>
                        {extraColumns.map((col) => (
                          <TableCell key={col}>{row[col]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  startIcon={doImport.isPending ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
                  onClick={handleImport}
                  disabled={doImport.isPending || previewRows.length === 0}
                >
                  {doImport.isPending
                    ? t("csvImport.step3.importing")
                    : t("csvImport.step3.import", { count: previewRows.length, entity: entityLabel })}
                </Button>
                <Button variant="outlined" onClick={resetFileState}>
                  {t("common.cancel")}
                </Button>
              </Stack>
            </>
          )}
        </StepCard>
      )}

      {/* ── Result ── */}
      {importResult && (
        <Alert
          severity={importResult.errors.length > 0 ? "warning" : "success"}
          icon={importResult.errors.length > 0 ? <ErrorIcon /> : <CheckCircleIcon />}
          sx={{ mt: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {t("csvImport.result.title")}
          </Typography>
          <Typography variant="body2">
            {t("csvImport.result.summary", {
              created: importResult.created,
              updated: importResult.updated,
              entity: entityLabel,
            })}
            {importResult.connections ? ` ${t("csvImport.result.connections", { count: importResult.connections })}` : ""}
          </Typography>
          {importResult.errors.map((e, i) => (
            <Typography key={i} variant="body2" sx={{ color: "warning.dark" }}>• {e}</Typography>
          ))}
          <Button size="small" sx={{ mt: 1 }} onClick={resetFileState}>
            {t("csvImport.result.importMore")}
          </Button>
        </Alert>
      )}
      </>}
    </Box>
  );
};

// ── StepCard helper ───────────────────────────────────────────────────────────

function StepCard({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ mb: 2, p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: "50%",
            bgcolor: "primary.main", color: "primary.contrastText",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}
        >
          {step}
        </Box>
        <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
      </Stack>
      <Divider sx={{ mb: 2 }} />
      {children}
    </Paper>
  );
}

// ── Unified import panel ─────────────────────────────────────────────────────

const UnifiedImportPanel: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UnifiedPreviewResult | null>(null);
  const [result, setResult] = useState<UnifiedImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const previewMut = usePreviewUnifiedCsv();
  const importMut = useImportUnifiedCsv();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    try {
      const res = await previewMut.mutateAsync(f);
      setPreview(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("csvImport.previewError");
      enqueueSnackbar(msg, { variant: "error" });
    }
  };

  const handleImport = async () => {
    if (!file) return;
    try {
      const res = await importMut.mutateAsync(file);
      setResult(res);
      enqueueSnackbar(
        t("csvImport.unified.success", { nodes: res.nodes_created + res.nodes_updated, edges: res.edges_created }),
        { variant: "success" },
      );
    } catch {
      enqueueSnackbar(t("csvImport.importError"), { variant: "error" });
    }
  };

  return (
    <>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("csvImport.unified.description")}
      </Typography>

      {/* Template download */}
      <StepCard step="1" title={t("csvImport.step1.title")}>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {t("csvImport.unified.templateDesc")}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          href="/api/v1/import/csv/template/unified"
          download="ea_komplett_mall.csv"
        >
          {t("csvImport.unified.downloadTemplate")}
        </Button>
      </StepCard>

      {/* Upload */}
      <StepCard step="2" title={t("csvImport.step2.title")}>
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          sx={{
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            borderRadius: 2, p: 4, textAlign: "center", cursor: "pointer",
            bgcolor: dragOver ? "primary.50" : "background.default",
            transition: "all 0.15s",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          <UploadFileIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 500 }}>{t("csvImport.step2.dropzone")}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("csvImport.step2.or")}</Typography>
          {previewMut.isPending && <CircularProgress size={24} sx={{ mt: 1 }} />}
        </Box>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {file && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
            <Chip label={file.name} onDelete={reset} color="primary" variant="outlined" size="small" />
          </Stack>
        )}
      </StepCard>

      {/* Parse errors */}
      {preview && preview.errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t("csvImport.parseWarnings")}</Typography>
          {preview.errors.map((e, i) => <Typography key={i} variant="body2">• {e}</Typography>)}
        </Alert>
      )}

      {/* Preview */}
      {preview && (
        <StepCard step="3" title={t("csvImport.unified.previewTitle", { nodes: preview.total_nodes, edges: preview.total_edges })}>
          {/* Node preview */}
          {preview.nodes.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("csvImport.unified.nodes")} ({preview.total_nodes})</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 260 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("common.type")}</TableCell>
                      <TableCell>{t("common.name")}</TableCell>
                      <TableCell>{t("common.description")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.nodes.map((n, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip
                            label={n.type}
                            size="small"
                            sx={{ bgcolor: NODE_COLORS[n.type as NodeType] ?? "#888", color: "#fff", fontSize: 11 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>{n.name}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {/* Edge preview */}
          {preview.edges.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("csvImport.unified.connections")} ({preview.total_edges})</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 200 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("connections.listSection.source")}</TableCell>
                      <TableCell>{t("connections.listSection.type")}</TableCell>
                      <TableCell>{t("connections.listSection.target")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.edges.map((e, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontSize: 12 }}>{e.source}</TableCell>
                        <TableCell><Chip label={e.type} size="small" variant="outlined" sx={{ fontSize: 11 }} /></TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{e.target}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={importMut.isPending ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
              onClick={handleImport}
              disabled={importMut.isPending || (preview.total_nodes === 0 && preview.total_edges === 0)}
            >
              {importMut.isPending ? t("csvImport.step3.importing") : t("csvImport.unified.importButton", { nodes: preview.total_nodes, edges: preview.total_edges })}
            </Button>
            <Button variant="outlined" onClick={reset}>{t("common.cancel")}</Button>
          </Stack>
        </StepCard>
      )}

      {/* Result */}
      {result && (
        <Alert
          severity={result.errors.length > 0 ? "warning" : "success"}
          icon={result.errors.length > 0 ? <ErrorIcon /> : <CheckCircleIcon />}
          sx={{ mt: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t("csvImport.result.title")}</Typography>
          <Typography variant="body2">
            {t("csvImport.unified.resultSummary", {
              nodesCreated: result.nodes_created,
              nodesUpdated: result.nodes_updated,
              edgesCreated: result.edges_created,
            })}
          </Typography>
          {result.errors.map((e, i) => (
            <Typography key={i} variant="body2" sx={{ color: "warning.dark" }}>• {e}</Typography>
          ))}
          <Button size="small" sx={{ mt: 1 }} onClick={reset}>{t("csvImport.result.importMore")}</Button>
        </Alert>
      )}
    </>
  );
};

export default ImportCSV;
