import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChecklistIcon from "@mui/icons-material/Checklist";
import ClearIcon from "@mui/icons-material/Clear";
import DeleteIcon from "@mui/icons-material/Delete";
import DescriptionIcon from "@mui/icons-material/Description";
import EditIcon from "@mui/icons-material/Edit";
import FlagIcon from "@mui/icons-material/Flag";
import GavelIcon from "@mui/icons-material/Gavel";
import GroupsIcon from "@mui/icons-material/Groups";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import MemoryIcon from "@mui/icons-material/Memory";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import RouteIcon from "@mui/icons-material/Route";
import StorageIcon from "@mui/icons-material/Storage";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  useApproveDocument,
  useClearApproval,
  useJourney,
  useJourneyStamps,
  useSaveJourney,
  useStepVisible,
  useUpdateStampDates,
  type JourneyContent,
  type JourneyDocument,
  type JourneyIcon,
  type JourneyStep,
} from "@/api/architectureJourney";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import MarkdownView from "@/components/common/MarkdownView";
import { SHORTCUT_REGISTRY } from "@/config/shortcutRegistry";
import { useRoleStore } from "@/store/roleStore";

const ICONS: Record<JourneyIcon, React.ReactElement> = {
  assessment: <AssessmentIcon sx={{ fontSize: 28 }} />,
  flag: <FlagIcon sx={{ fontSize: 28 }} />,
  analytics: <AnalyticsIcon sx={{ fontSize: 28 }} />,
  gavel: <GavelIcon sx={{ fontSize: 28 }} />,
  route: <RouteIcon sx={{ fontSize: 28 }} />,
  account_tree: <AccountTreeIcon sx={{ fontSize: 28 }} />,
  storage: <StorageIcon sx={{ fontSize: 28 }} />,
  description: <DescriptionIcon sx={{ fontSize: 28 }} />,
  memory: <MemoryIcon sx={{ fontSize: 28 }} />,
  groups: <GroupsIcon sx={{ fontSize: 28 }} />,
  menu_book: <MenuBookIcon sx={{ fontSize: 28 }} />,
  calendar: <CalendarMonthIcon sx={{ fontSize: 28 }} />,
  checklist: <ChecklistIcon sx={{ fontSize: 28 }} />,
  lightbulb: <LightbulbIcon sx={{ fontSize: 28 }} />,
};

const DOCUMENTS: { value: JourneyDocument; label: string }[] = [
  { value: "nulaagesanalys", label: "Nulägesanalys" },
  { value: "target_architecture", label: "Målarkitektur" },
  { value: "gap_analys", label: "GAP-analys" },
  { value: "principles", label: "Arkitekturprinciper" },
];


function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

function dateInputToIso(dateStr: string): string {
  // Store as noon UTC so the date is unambiguous across timezones
  return `${dateStr}T12:00:00Z`;
}

interface StampBadgeProps {
  label: string;
  date: string;
  color: string;
  borderColor: string;
  bg: string;
}

function StampBadge({ label, date, color, borderColor, bg }: StampBadgeProps) {
  return (
    <Box
      sx={{
        transform: "rotate(-12deg)",
        border: `2px dashed ${borderColor}`,
        borderRadius: 1,
        bgcolor: bg,
        px: 1,
        py: 0.25,
        textAlign: "center",
        userSelect: "none",
        lineHeight: 1.2,
      }}
    >
      <Typography
        sx={{
          color,
          fontWeight: 800,
          fontSize: "0.6rem",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontFamily: "monospace",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color,
          fontSize: "0.55rem",
          fontFamily: "monospace",
          opacity: 0.9,
        }}
      >
        {date}
      </Typography>
    </Box>
  );
}

interface DocumentStampsProps {
  documentType: string;
}

function DateEditPopover({
  anchor,
  value,
  saving,
  onClose,
  onSave,
  onChange,
}: {
  anchor: HTMLElement | null;
  value: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Justera datum
        </Typography>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: "0.8rem", padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc" }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={onClose} sx={{ textTransform: "none", fontSize: "0.75rem" }}>
            Avbryt
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onSave}
            disabled={saving || !value}
            sx={{ textTransform: "none", fontSize: "0.75rem" }}
          >
            Spara
          </Button>
        </Stack>
      </Box>
    </Popover>
  );
}

function DocumentStamps({ documentType }: DocumentStampsProps) {
  const { data: stampsData, isLoading } = useJourneyStamps();
  const { isEditor, name } = useRoleStore();
  const approve = useApproveDocument();
  const clearApproval = useClearApproval();
  const updateDates = useUpdateStampDates();

  // Popover for setting a new approval with a chosen date
  const [setApproveAnchor, setSetApproveAnchor] = useState<HTMLElement | null>(null);
  const [newApproveDate, setNewApproveDate] = useState("");

  // Popover for editing an existing stamp date
  const [editAnchor, setEditAnchor] = useState<HTMLElement | null>(null);
  const [editingField, setEditingField] = useState<"approved" | "revised" | null>(null);
  const [editDate, setEditDate] = useState("");

  if (isLoading) {
    return (
      <Box sx={{ position: "absolute", top: 12, right: 12 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  const stampStatus = stampsData?.documents[documentType];
  const approvedAt = stampStatus?.approved_at ?? null;
  const revisedAt = stampStatus?.revised_at ?? null;
  const hasApproval = !!approvedAt;
  const hasRevision = !!revisedAt;

  const handleOpenSetApprove = (e: React.MouseEvent<HTMLButtonElement>) => {
    setNewApproveDate(new Date().toISOString().slice(0, 10));
    setSetApproveAnchor(e.currentTarget);
  };

  const handleConfirmApprove = () => {
    approve.mutate({
      docType: documentType,
      approvedBy: name,
      approvedAt: dateInputToIso(newApproveDate),
    });
    setSetApproveAnchor(null);
  };

  const handleOpenEdit = (
    field: "approved" | "revised",
    e: React.MouseEvent<HTMLButtonElement>,
    currentIso: string,
  ) => {
    setEditingField(field);
    setEditAnchor(e.currentTarget);
    setEditDate(isoToDateInput(currentIso));
  };

  const handleSaveEdit = () => {
    const iso = dateInputToIso(editDate);
    if (editingField === "approved") {
      updateDates.mutate({ docType: documentType, approvedAt: iso });
    } else {
      updateDates.mutate({ docType: documentType, revisedAt: iso });
    }
    setEditingField(null);
    setEditAnchor(null);
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 0.75,
      }}
    >
      {/* Fastslaget stamp */}
      {hasApproval ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {isEditor && (
            <>
              <Tooltip title="Justera datum">
                <IconButton
                  size="small"
                  onClick={(e) => handleOpenEdit("approved", e, approvedAt)}
                  sx={{ p: 0.25, color: "text.disabled" }}
                >
                  <EditIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Ta bort Fastslaget-stämpel">
                <IconButton
                  size="small"
                  onClick={() => clearApproval.mutate(documentType)}
                  disabled={clearApproval.isPending}
                  sx={{ p: 0.25, color: "text.disabled" }}
                >
                  <ClearIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
          <StampBadge
            label="Fastslaget"
            date={formatDate(approvedAt)}
            color="#1b5e20"
            borderColor="#2e7d32"
            bg="rgba(46,125,50,0.07)"
          />
        </Box>
      ) : (
        isEditor && (
          <Button
            size="small"
            variant="text"
            onClick={handleOpenSetApprove}
            disabled={approve.isPending}
            sx={{
              fontSize: "0.65rem",
              color: "text.disabled",
              textTransform: "none",
              minWidth: 0,
              p: "2px 6px",
              "&:hover": { color: "#2e7d32" },
            }}
          >
            Sätt fastslaget
          </Button>
        )
      )}

      {/* Reviderat stamp */}
      {hasRevision && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {isEditor && (
            <Tooltip title="Justera datum">
              <IconButton
                size="small"
                onClick={(e) => handleOpenEdit("revised", e, revisedAt)}
                sx={{ p: 0.25, color: "text.disabled" }}
              >
                <EditIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          )}
          <StampBadge
            label="Reviderat"
            date={formatDate(revisedAt)}
            color="#0d47a1"
            borderColor="#1565c0"
            bg="rgba(21,101,192,0.07)"
          />
        </Box>
      )}

      {/* Popover: sätt nytt fastslaget-datum */}
      <DateEditPopover
        anchor={setApproveAnchor}
        value={newApproveDate}
        saving={approve.isPending}
        onClose={() => setSetApproveAnchor(null)}
        onSave={handleConfirmApprove}
        onChange={setNewApproveDate}
      />

      {/* Popover: justera befintligt stämpeldatum */}
      <DateEditPopover
        anchor={editAnchor}
        value={editDate}
        saving={updateDates.isPending}
        onClose={() => { setEditAnchor(null); setEditingField(null); }}
        onSave={handleSaveEdit}
        onChange={setEditDate}
      />
    </Box>
  );
}

function newStepId(steps: JourneyStep[]): string {
  let n = steps.length + 1;
  while (steps.some((s) => s.id === `steg-${n}`)) n += 1;
  return `steg-${n}`;
}

const EMPTY_STEP: Omit<JourneyStep, "id"> = {
  title: "", subtitle: "", body: "", icon: "route", link_path: null, link_label: "", document: null,
};

function StepDialog({
  step,
  onClose,
  onSave,
}: {
  step: JourneyStep | null;
  onClose: () => void;
  onSave: (s: JourneyStep) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<JourneyStep | null>(step);
  React.useEffect(() => setDraft(step), [step]);
  const pages = useMemo(
    () => SHORTCUT_REGISTRY.filter((s) => s.path !== "/")
      .map((s) => ({ path: s.path, label: t(s.labelKey) }))
      .sort((a, b) => a.label.localeCompare(b.label, "sv")),
    [t],
  );
  if (!draft) return null;
  const set = <K extends keyof JourneyStep>(k: K, v: JourneyStep[K]) => setDraft({ ...draft, [k]: v });

  return (
    <Dialog open={!!step} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{draft.title ? `Redigera steg: ${draft.title}` : "Nytt steg"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Rubrik" value={draft.title} onChange={(e) => set("title", e.target.value)} required fullWidth size="small" />
          <TextField label="Fråga eller underrubrik" value={draft.subtitle} onChange={(e) => set("subtitle", e.target.value)} fullWidth size="small" />
          <MarkdownEditor label="Text" value={draft.body} onChange={(v) => set("body", v)} minRows={5} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select label="Länk till sida" value={draft.link_path ?? ""} size="small" sx={{ flex: 1 }}
              onChange={(e) => set("link_path", e.target.value || null)}
              helperText="Steget döljs om sidan hör till en modul som är avstängd."
            >
              <MenuItem value="">Ingen länk</MenuItem>
              {pages.map((p) => <MenuItem key={p.path} value={p.path}>{p.label}</MenuItem>)}
            </TextField>
            <TextField
              label="Knapptext" value={draft.link_label} size="small" sx={{ flex: 1 }}
              onChange={(e) => set("link_label", e.target.value)} disabled={!draft.link_path}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select label="Stämplar för dokument" value={draft.document ?? ""} size="small" sx={{ flex: 1 }}
              onChange={(e) => set("document", (e.target.value || null) as JourneyDocument | null)}
              helperText="Visar Fastslaget och Reviderat för dokumentet."
            >
              <MenuItem value="">Inga stämplar</MenuItem>
              {DOCUMENTS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            <TextField
              select label="Ikon" value={draft.icon} size="small" sx={{ flex: 1 }}
              onChange={(e) => set("icon", e.target.value as JourneyIcon)}
            >
              {(Object.keys(ICONS) as JourneyIcon[]).map((k) => (
                <MenuItem key={k} value={k}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {React.cloneElement(ICONS[k], { sx: { fontSize: 20 } })}
                    <span>{k}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button variant="contained" disabled={!draft.title.trim()} onClick={() => onSave(draft)}>Klar</Button>
      </DialogActions>
    </Dialog>
  );
}

function StepCard({
  step,
  index,
  hidden,
  editing,
  onEdit,
  onMove,
  onDelete,
}: {
  step: JourneyStep;
  index: number;
  hidden: boolean;
  editing: boolean;
  onEdit?: () => void;
  onMove?: (delta: number) => void;
  onDelete?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Paper variant="outlined" sx={{ p: 3, position: "relative", opacity: hidden ? 0.6 : 1 }}>
      {!editing && step.document && <DocumentStamps documentType={step.document} />}
      {editing && (
        <Stack direction="row" spacing={0.5} sx={{ position: "absolute", top: 8, right: 8 }}>
          <Tooltip title="Flytta upp"><span><IconButton size="small" onClick={() => onMove?.(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="Flytta ned"><span><IconButton size="small" onClick={() => onMove?.(1)}><ArrowDownwardIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="Redigera"><IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Ta bort"><IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      )}
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box
          sx={{
            width: 48, height: 48, borderRadius: "50%", bgcolor: "action.hover", color: "text.secondary",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25,
          }}
        >
          {ICONS[step.icon] ?? ICONS.route}
        </Box>
        <Box sx={{ flexGrow: 1, pr: 10 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Steg {index + 1}
            </Typography>
            {hidden && <Chip size="small" label="Visas inte: modulen är avstängd" />}
          </Stack>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 0.25 }}>{step.title}</Typography>
          {step.subtitle && (
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontStyle: "italic" }}>
              {step.subtitle}
            </Typography>
          )}
          {step.body && <MarkdownView text={step.body} />}
          {step.link_path && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Button size="small" variant="outlined" disabled={editing} onClick={() => navigate(step.link_path!)}>
                {step.link_label || "Öppna"}
              </Button>
            </>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

const ArchitectureJourneyPage: React.FC = () => {
  const navigate = useNavigate();
  const { isEditor } = useRoleStore();
  const { data, isLoading, error } = useJourney();
  const save = useSaveJourney();
  const visible = useStepVisible();
  const [draft, setDraft] = useState<JourneyContent | null>(null);
  const [editingStep, setEditingStep] = useState<JourneyStep | null>(null);

  if (isLoading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;
  if (error || !data) return <Alert severity="error" sx={{ m: 3 }}>Kunde inte läsa arkitekturresan.</Alert>;

  const editing = draft !== null;
  const content = draft ?? data.content;
  const steps = editing ? content.steps : content.steps.filter(visible);

  const update = (next: Partial<JourneyContent>) => setDraft({ ...content, ...next });
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= content.steps.length) return;
    const next = [...content.steps];
    [next[i], next[j]] = [next[j], next[i]];
    update({ steps: next });
  };
  const saveStep = (s: JourneyStep) => {
    const exists = content.steps.some((x) => x.id === s.id);
    update({ steps: exists ? content.steps.map((x) => (x.id === s.id ? s : x)) : [...content.steps, s] });
    setEditingStep(null);
  };
  const handleSave = () =>
    save.mutate(content, { onSuccess: () => setDraft(null) });
  const handleReset = () => {
    if (window.confirm("Återställ resan till standardstegen? Era egna steg tas bort.")) {
      save.mutate(null, { onSuccess: () => setDraft(null) });
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 860, mx: "auto" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/")} size="small">
          Tillbaka till startsidan
        </Button>
        {isEditor && !editing && (
          <Button startIcon={<EditIcon />} size="small" onClick={() => setDraft(data.content)}>
            Redigera resan
          </Button>
        )}
      </Stack>

      {editing ? (
        <Stack spacing={2} sx={{ mb: 4 }}>
          <TextField label="Rubrik" value={content.title} onChange={(e) => update({ title: e.target.value })} fullWidth />
          <TextField
            label="Ingress" value={content.intro} onChange={(e) => update({ intro: e.target.value })}
            fullWidth multiline minRows={2}
          />
        </Stack>
      ) : (
        <>
          <Typography variant="h4" fontWeight={700} gutterBottom>{content.title}</Typography>
          {content.intro && (
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 640 }}>
              {content.intro}
            </Typography>
          )}
        </>
      )}

      {!editing && steps.length === 0 && (
        <Alert severity="info">
          Resan har inga steg att visa.{isEditor ? " Välj Redigera resan för att lägga till steg." : ""}
        </Alert>
      )}

      <Stack spacing={3}>
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            index={idx}
            hidden={editing && !visible(step)}
            editing={editing}
            onEdit={() => setEditingStep(step)}
            onMove={(d) => move(idx, d)}
            onDelete={() => update({ steps: content.steps.filter((s) => s.id !== step.id) })}
          />
        ))}
      </Stack>

      {editing && (
        <>
          <Button
            startIcon={<AddIcon />} sx={{ mt: 2 }}
            onClick={() => setEditingStep({ id: newStepId(content.steps), ...EMPTY_STEP })}
          >
            Lägg till steg
          </Button>
          {save.isError && <Alert severity="error" sx={{ mt: 2 }}>Det gick inte att spara resan.</Alert>}
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
            <Button color="warning" onClick={handleReset} disabled={save.isPending || data.is_default}>
              Återställ standard
            </Button>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setDraft(null)} disabled={save.isPending}>Avbryt</Button>
              <Button variant="contained" onClick={handleSave} disabled={save.isPending || !content.title.trim()}>
                Spara
              </Button>
            </Stack>
          </Stack>
        </>
      )}

      <StepDialog step={editingStep} onClose={() => setEditingStep(null)} onSave={saveStep} />
    </Box>
  );
};

export default ArchitectureJourneyPage;
