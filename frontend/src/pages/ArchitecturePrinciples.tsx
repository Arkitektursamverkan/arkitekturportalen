import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import {
  PRINCIPLE_DOMAINS,
  PRINCIPLE_STATUSES,
  type Principle,
  type PrincipleCreate,
  type PrincipleDomain,
  type PrincipleStatus,
  useCreatePrinciple,
  useDeletePrinciple,
  usePrinciples,
  useUpdatePrinciple,
} from "@/api/principles";
import {
  downloadPrincipleDocumentPdf,
  downloadPrincipleDocumentVersionPdf,
  usePrincipleDocumentVersions,
} from "@/api/principleDocument";
import { useRoleStore } from "@/store/roleStore";
import CommentsThread from "@/components/comments/CommentsThread";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";

interface DomainStyle {
  accent: string;
  text: string;
  outline?: string;
}

const DOMAIN_COLORS: Record<PrincipleDomain, DomainStyle> = {
  "Övergripande": { accent: "#FFFFFF", text: "#212121", outline: "#212121" },
  "Verksamhet": { accent: "#4CAF50", text: "#4CAF50" },
  "Applikation": { accent: "#2196F3", text: "#2196F3" },
  "Information": { accent: "#FF9800", text: "#FF9800" },
  "Teknik": { accent: "#9C27B0", text: "#9C27B0" },
};

const STATUS_COLORS: Record<PrincipleStatus, "default" | "primary" | "success" | "warning"> = {
  "Förslag": "default",
  "Beslutad": "warning",
  "Infört": "success",
  "Avvecklad": "default",
};

type StatusFilter = "Alla" | PrincipleStatus;
const STATUS_FILTERS: StatusFilter[] = ["Alla", ...PRINCIPLE_STATUSES];

const EMPTY_FORM: PrincipleCreate = {
  identifier: "",
  domain: "Övergripande",
  name: "",
  purpose: "",
  not: "",
  but: "",
  means: "",
  status: "Förslag",
};

const ArchitecturePrinciples: React.FC = () => {
  // Same rule as the API: edit on the principle type through the grants.
  const isAdmin = useRoleStore((st) => st.typeAccess.ArchitecturePrinciple === "edit");
  // "Alla" är förvalet: sidan ska visa hela principuppsättningen när man
  // kommer in, inte bara ett steg i livscykeln. Med "Infört" som förval såg
  // sidan tom ut så länge principerna låg som Förslag eller Beslutad.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Alla");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PrincipleCreate>(EMPTY_FORM);

  const { data: principles, isLoading } = usePrinciples(
    statusFilter === "Alla" ? undefined : { status: statusFilter },
  );
  const createMutation = useCreatePrinciple();
  const updateMutation = useUpdatePrinciple();
  const deleteMutation = useDeletePrinciple();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } =
    usePrincipleDocumentVersions();

  const grouped = useMemo(() => {
    const map = new Map<PrincipleDomain, Principle[]>();
    for (const d of PRINCIPLE_DOMAINS) map.set(d, []);
    for (const p of principles ?? []) {
      const list = map.get(p.domain);
      if (list) list.push(p);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.identifier.localeCompare(b.identifier, "sv"));
    }
    return map;
  }, [principles]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: Principle) => {
    setEditingId(p.id);
    setForm({
      identifier: p.identifier,
      domain: p.domain,
      name: p.name,
      purpose: p.purpose,
      not: p.not,
      but: p.but,
      means: p.means,
      status: p.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...form });
    } else {
      await createMutation.mutateAsync(form);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (p: Principle) => {
    if (!window.confirm(`Ta bort principen "${p.identifier} – ${p.name}"?`)) return;
    await deleteMutation.mutateAsync(p.id);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Arkitekturprinciper
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Lägg till princip
          </Button>
        )}
      </Stack>

      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Principer som styr arkitekturarbetet. Klicka på en princip för att se detaljer.
      </Typography>

      <DocumentExportPanel
        title="Arkitekturprinciper"
        documentType="principle_document"
        versions={versions}
        isLoading={versionsLoading}
        isAdmin={isAdmin}
        onDownload={(opts) => downloadPrincipleDocumentPdf(opts)}
        onDownloadVersion={(id) => downloadPrincipleDocumentVersionPdf(id)}
        onVersionsRefresh={() => { void refetchVersions(); }}
        availableStatuses={["Förslag", "Beslutad", "Infört"]}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 3, mb: 3, flexWrap: "wrap", gap: 1 }}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={s}
            color={statusFilter === s ? "primary" : "default"}
            variant={statusFilter === s ? "filled" : "outlined"}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (principles?.length ?? 0) === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body1">
            Inga principer med status "{statusFilter}" hittades.
          </Typography>
        </Box>
      ) : (
        PRINCIPLE_DOMAINS.map((domain) => {
          const list = grouped.get(domain) ?? [];
          if (list.length === 0) return null;
          const style = DOMAIN_COLORS[domain];
          const lineColor = style.outline ?? style.accent;
          return (
            <Box key={domain} sx={{ mb: 4 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  mb: 1.5,
                  pb: 1,
                  borderBottom: `2px solid ${lineColor}`,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: style.accent,
                    border: style.outline ? `1px solid ${style.outline}` : "none",
                  }}
                />
                <Typography variant="h6" sx={{ color: style.text, fontWeight: 700 }}>
                  {domain}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  ({list.length})
                </Typography>
              </Box>
              {list.map((p) => (
                <PrincipleAccordion
                  key={p.id}
                  principle={p}
                  style={style}
                  isAdmin={isAdmin}
                  onEdit={() => openEdit(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </Box>
          );
        })
      )}

      <PrincipleDialog
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

interface AccordionProps {
  principle: Principle;
  style: DomainStyle;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const PrincipleAccordion: React.FC<AccordionProps> = ({ principle, style, isAdmin, onEdit, onDelete }) => {
  const lineColor = style.outline ?? style.accent;
  const chipTextColor = style.outline ? style.outline : "white";
  return (
    <Accordion sx={{ "&:before": { display: "none" }, mb: 1, borderLeft: `4px solid ${lineColor}` }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", width: "100%", pr: 1 }}>
          <Chip
            label={principle.identifier}
            size="small"
            sx={{
              bgcolor: style.accent,
              color: chipTextColor,
              fontWeight: 700,
              minWidth: 50,
              border: style.outline ? `1px solid ${style.outline}` : "none",
            }}
          />
          <Typography sx={{ flexGrow: 1, fontWeight: 500 }}>{principle.name}</Typography>
          <Chip
            label={principle.status}
            size="small"
            color={STATUS_COLORS[principle.status]}
            variant={principle.status === "Förslag" ? "outlined" : "filled"}
          />
          {isAdmin && (
            <>
              <Tooltip title="Redigera">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Ta bort">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack spacing={2}>
          {principle.purpose && (
            <DetailSection
              icon={<LightbulbOutlinedIcon fontSize="small" />}
              label="Syfte"
              color="#1976d2"
              text={principle.purpose}
            />
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {principle.not && (
              <DetailSection
                icon={<CancelOutlinedIcon fontSize="small" />}
                label="Inte"
                color="#d32f2f"
                text={principle.not}
              />
            )}
            {principle.but && (
              <DetailSection
                icon={<CheckCircleOutlineIcon fontSize="small" />}
                label="Utan"
                color="#2e7d32"
                text={principle.but}
              />
            )}
          </Box>
          {principle.means && (
            <DetailSection
              icon={<FormatListBulletedIcon fontSize="small" />}
              label="Innebär att"
              color="#7b1fa2"
              text={principle.means}
            />
          )}
          <Box sx={{ mt: 1 }}>
            <CommentsThread subjectType="principle" subjectId={principle.id} contextLabel={principle.name} />
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  text: string;
}

const DetailSection: React.FC<SectionProps> = ({ icon, label, color, text }) => (
  <Box>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color, mb: 0.5 }}>
      {icon}
      <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
        {label}
      </Typography>
    </Stack>
    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", pl: 0.5 }}>
      {text}
    </Typography>
  </Box>
);

interface DialogProps {
  open: boolean;
  editing: boolean;
  form: PrincipleCreate;
  onChange: (f: PrincipleCreate) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}

const PrincipleDialog: React.FC<DialogProps> = ({ open, editing, form, onChange, onClose, onSave, saving }) => {
  const set = <K extends keyof PrincipleCreate>(key: K, value: PrincipleCreate[K]) =>
    onChange({ ...form, [key]: value });

  const valid = form.identifier.trim().length > 0 && form.name.trim().length > 0;

  const makeBulletKeyDownHandler = (field: "purpose" | "means") =>
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const current = form[field] ?? "";
      const needsLeadingBullet = current.trim().length > 0 && !/^\s*•/.test(current);
      const prefix = needsLeadingBullet ? `• ${current.slice(0, start)}` : current.slice(0, start);
      const next = `${prefix}\n• ${current.slice(end)}`;
      set(field, next);
      const cursor = prefix.length + 3;
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = cursor;
      });
    };
  const handlePurposeKeyDown = makeBulletKeyDownHandler("purpose");
  const handleMeansKeyDown = makeBulletKeyDownHandler("means");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{editing ? "Redigera princip" : "Lägg till princip"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Identifierare"
              value={form.identifier}
              onChange={(e) => set("identifier", e.target.value)}
              required
              sx={{ minWidth: 140 }}
              helperText="t.ex. Ö-1, B-3"
            />
            <TextField
              select
              label="Domän"
              value={form.domain}
              onChange={(e) => set("domain", e.target.value as PrincipleDomain)}
              sx={{ minWidth: 200 }}
            >
              {PRINCIPLE_DOMAINS.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Status"
              value={form.status ?? "Förslag"}
              onChange={(e) => set("status", e.target.value as PrincipleStatus)}
              sx={{ minWidth: 160 }}
            >
              {PRINCIPLE_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Princip"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            multiline
            minRows={2}
          />
          <TextField
            label="Syfte"
            value={form.purpose ?? ""}
            onChange={(e) => set("purpose", e.target.value)}
            onKeyDown={handlePurposeKeyDown}
            multiline
            minRows={3}
            helperText="Tryck Enter för ny punkt (Shift+Enter för radbrytning utan •)"
          />
          <TextField
            label="Inte"
            value={form.not ?? ""}
            onChange={(e) => set("not", e.target.value)}
            multiline
            minRows={2}
          />
          <TextField
            label="Utan"
            value={form.but ?? ""}
            onChange={(e) => set("but", e.target.value)}
            multiline
            minRows={2}
          />
          <TextField
            label="Innebär att"
            value={form.means ?? ""}
            onChange={(e) => set("means", e.target.value)}
            onKeyDown={handleMeansKeyDown}
            multiline
            minRows={2}
            helperText="Tryck Enter för ny punkt (Shift+Enter för radbrytning utan •)"
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

export default ArchitecturePrinciples;
