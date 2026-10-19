import React, { useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, IconButton, InputLabel,
  MenuItem, Select, Stack, TextField,
  Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PendingIcon from "@mui/icons-material/Pending";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import {
  useGapAnalys, useUpdateGapAnalys, useGapAnalysVersions,
  downloadGapAnalysPdf, downloadGapAnalysVersionPdf, makeId,
  type GapAnalysContent, type GapItem, type GapTyp, type Prioritet,
} from "@/api/gapAnalys";
import {
  useGapTasks, useGapTasksSummary, useCreateGapTask, useUpdateGapTask, useDeleteGapTask,
  useGapStatusLog, useCreateGapStatusLog,
  gapItemProgress, TASK_WEIGHT_LABELS,
  type GapTask, type GapTaskStatus, type GapTaskSummary,
} from "@/api/gapTasks";
import { useRoleStore } from "@/store/roleStore";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";
import CommentsThread from "@/components/comments/CommentsThread";

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS = [
  "Arkitekturstyrning",
  "Verksamhetsarkitektur",
  "Informationsarkitektur",
  "Applikationsarkitektur",
  "Teknisk arkitektur",
];

const GAP_TYP_LABELS: Record<GapTyp, string> = {
  saknas_helt: "Saknas helt",
  otillrackligt: "Otillräckligt",
  ska_avvecklas: "Ska avvecklas",
  uppfyller_malbild: "Uppfyller målbilden",
};

interface PrioritetConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
}

const PRIORITET_CONFIG: Record<string, PrioritetConfig> = {
  HOG:    { label: "HÖG",      color: "#b71c1c", bg: "#ffebee", border: "#ef9a9a" },
  MELLAN: { label: "MELLAN",   color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  MINDRE: { label: "MINDRE",   color: "#f57f17", bg: "#fffde7", border: "#fff176" },
  "":     { label: "Uppfyller", color: "#616161", bg: "#f5f5f5", border: "#bdbdbd" },
};

const HORIZON_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "0-3":  { label: "0–3 mån",   color: "#1b5e20", bg: "#e8f5e9" },
  "3-6":  { label: "3–6 mån",   color: "#0d47a1", bg: "#e3f2fd" },
  "6-12": { label: "6–12 mån",  color: "#4a148c", bg: "#f3e5f5" },
  "":     { label: "Ingen",      color: "#616161", bg: "#f5f5f5" },
};

function HorizonChip({ h }: { h: string }) {
  if (!h) return null;
  const cfg = HORIZON_CONFIG[h] ?? HORIZON_CONFIG[""];
  return (
    <Chip label={cfg.label} size="small" sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: "0.70rem" }} />
  );
}

function PrioritetChip({ p }: { p: Prioritet }) {
  const cfg = PRIORITET_CONFIG[p] ?? PRIORITET_CONFIG[""];
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{ bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 700, fontSize: "0.72rem" }}
    />
  );
}

function GapTypChip({ gt }: { gt: GapTyp }) {
  return (
    <Chip label={GAP_TYP_LABELS[gt]} size="small" variant="outlined" sx={{ fontSize: "0.72rem" }} />
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

/** Bar towards the target: solid for what is done, a lighter band for what is under way. */
const GoalBar: React.FC<{ done: number; inProgress: number; height?: number }> = ({ done, inProgress, height = 8 }) => {
  const donePct = Math.round(done * 100);
  const color = donePct === 100 ? "success" : donePct >= 50 ? "primary" : "warning";
  return (
    <Box sx={{ position: "relative", height, borderRadius: height / 2, bgcolor: "action.hover", overflow: "hidden" }}>
      <Box
        sx={{
          position: "absolute", top: 0, bottom: 0, left: `${done * 100}%`, width: `${inProgress * 100}%`,
          bgcolor: `${color}.light`, opacity: 0.45, transition: "left .4s, width .4s",
        }}
      />
      <Box sx={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${done * 100}%`, bgcolor: `${color}.main`, transition: "width .4s" }} />
    </Box>
  );
};

// ── Domain Progress Overview ──────────────────────────────────────────────────

const DomainProgressOverview: React.FC<{ items: GapItem[]; summary?: GapTaskSummary }> = ({ items, summary }) => {
  const allDomains = [...new Set([...DOMAINS, ...items.map((i) => i.domain)])];

  return (
    <Box sx={{ mb: 3, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
      <Typography variant="subtitle2" fontWeight={700}>
        Framsteg mot målarkitektur per domän
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        Varje gap bidrar med sin andel klara uppgifter, viktade efter omfattning. Gap som uppfyller målbilden räknas som helt klara.
        Det ljusare fältet visar pågående arbete.
      </Typography>
      <Stack spacing={1.5}>
        {allDomains.map((domain) => {
          const domainItems = items.filter((i) => i.domain === domain);
          const total = domainItems.length;
          const fulfilled = domainItems.filter((i) => i.gap_typ === "uppfyller_malbild").length;
          const progress = domainItems.map((i) => gapItemProgress(i.gap_typ, summary?.by_item[i.id]));
          const done = total > 0 ? progress.reduce((a, p) => a + p.done, 0) / total : 0;
          const inProgress = total > 0 ? progress.reduce((a, p) => a + p.inProgress, 0) / total : 0;

          return (
            <Box key={domain}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">{domain}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {total > 0 ? `${Math.round(done * 100)}% · ${fulfilled}/${total} uppfyllda` : "Inga gap registrerade"}
                </Typography>
              </Stack>
              <GoalBar done={done} inProgress={inProgress} />
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const GapAnalys: React.FC = () => {
  const { isEditor: isAdmin } = useRoleStore();
  const { data, isLoading, error } = useGapAnalys();
  const update = useUpdateGapAnalys();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } = useGapAnalysVersions();
  const { data: summary } = useGapTasksSummary();

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  }
  if (error || !data) {
    return <Box p={3}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda GAP-analys"}</Alert></Box>;
  }

  const c = data.content;
  const save = (next: GapAnalysContent) => update.mutateAsync(next);

  return (
    <Box sx={{ py: 4, px: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
      <Typography variant="h4" fontWeight={700}>GAP-analys IT-arkitektur</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        Jämförelse mellan nuläge och målarkitektur per domän
        {data.updated_by && ` · Uppdaterad ${new Date(data.updated_at).toLocaleString("sv-SE")} av ${data.updated_by}`}
      </Typography>

      <DomainProgressOverview items={c.items} summary={summary} />

      <DocumentExportPanel
        title="GAP-analys IT-arkitektur"
        documentType="gap_analys"
        versions={versions}
        isLoading={versionsLoading}
        isAdmin={isAdmin}
        onDownload={(opts) => downloadGapAnalysPdf(opts)}
        onDownloadVersion={(id) => downloadGapAnalysVersionPdf(id)}
        onVersionsRefresh={() => { void refetchVersions(); }}
      />

      <GapTableTab
        items={c.items}
        summary={summary}
        isAdmin={isAdmin}
        onSave={(items) => save({ ...c, items })}
      />
    </Box>
  );
};

// ── GAP Table Tab ─────────────────────────────────────────────────────────────

const GapTableTab: React.FC<{
  items: GapItem[];
  summary?: GapTaskSummary;
  isAdmin: boolean;
  onSave: (items: GapItem[]) => Promise<unknown>;
}> = ({ items, summary, isAdmin, onSave }) => {
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [horizonFilter, setHorizonFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<GapItem | null>(null);
  const [adding, setAdding] = useState(false);
  const createStatusLog = useCreateGapStatusLog();

  const filtered = items
    .filter((i) => priorityFilter === "all" || i.prioritet === priorityFilter)
    .filter((i) => domainFilter === "all" || i.domain === domainFilter);

  const grouped = DOMAINS.map((d) => ({ domain: d, items: filtered.filter((i) => i.domain === d) }))
    .filter((g) => g.items.length > 0);

  const priorityCounts: Record<string, number> = { all: items.length };
  for (const p of ["HOG", "MELLAN", "MINDRE", ""]) {
    priorityCounts[p] = items.filter((i) => i.prioritet === p).length;
  }

  return (
    <Box sx={{ pt: 3 }}>
      {/* Priority filter */}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip
          label={`Alla (${priorityCounts.all})`}
          onClick={() => setPriorityFilter("all")}
          variant={priorityFilter === "all" ? "filled" : "outlined"}
          color={priorityFilter === "all" ? "primary" : "default"}
          size="small"
        />
        {(["HOG", "MELLAN", "MINDRE", ""] as Prioritet[]).map((p) => {
          const cfg = PRIORITET_CONFIG[p];
          return (
            <Chip
              key={p || "uppfyller"}
              label={`${cfg.label} (${priorityCounts[p] ?? 0})`}
              onClick={() => setPriorityFilter(priorityFilter === p ? "all" : p)}
              size="small"
              sx={
                priorityFilter === p
                  ? { bgcolor: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.color}`, fontWeight: 700 }
                  : { bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }
              }
            />
          );
        })}
      </Stack>

      {/* Domain filter */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip
          label="Alla domäner"
          onClick={() => setDomainFilter("all")}
          variant={domainFilter === "all" ? "filled" : "outlined"}
          size="small"
          color={domainFilter === "all" ? "primary" : "default"}
        />
        {DOMAINS.map((d) => (
          <Chip
            key={d}
            label={d}
            onClick={() => setDomainFilter(domainFilter === d ? "all" : d)}
            variant={domainFilter === d ? "filled" : "outlined"}
            size="small"
            color={domainFilter === d ? "primary" : "default"}
          />
        ))}
      </Stack>

      {/* Horizon filter */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mb: 2.5 }}>
        <Chip
          label="Alla horisonter"
          onClick={() => setHorizonFilter("all")}
          variant={horizonFilter === "all" ? "filled" : "outlined"}
          size="small"
          color={horizonFilter === "all" ? "primary" : "default"}
        />
        {(["0-3", "3-6", "6-12"] as const).map((h) => {
          const cfg = HORIZON_CONFIG[h];
          return (
            <Chip
              key={h}
              label={cfg.label}
              onClick={() => setHorizonFilter(horizonFilter === h ? "all" : h)}
              size="small"
              sx={
                horizonFilter === h
                  ? { bgcolor: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.color}`, fontWeight: 700 }
                  : { bgcolor: cfg.bg, color: cfg.color }
              }
            />
          );
        })}
      </Stack>

      {filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Inga gap matchar det valda filtret.
        </Typography>
      )}

      {grouped.map(({ domain, items: groupItems }) => (
        <Box key={domain} sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            {domain}
          </Typography>
          {groupItems.map((item) => (
            <GapItemRow
              key={item.id}
              item={item}
              progress={gapItemProgress(item.gap_typ, summary?.by_item[item.id])}
              hasTasks={(summary?.by_item[item.id]?.weight_active ?? 0) > 0}
              isAdmin={isAdmin}
              horizonFilter={horizonFilter}
              onEdit={() => setEditingItem(item)}
              onDelete={() => onSave(items.filter((i) => i.id !== item.id))}
            />
          ))}
        </Box>
      ))}

      {isAdmin && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2, mb: 4 }}>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setAdding(true)}>
            Lägg till gap-rad
          </Button>
        </Box>
      )}

      {editingItem && (
        <GapItemDialog
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (next, statusComment) => {
            await onSave(items.map((i) => (i.id === next.id ? next : i)));
            if (next.gap_typ !== editingItem.gap_typ) {
              await createStatusLog.mutateAsync({
                gap_item_id: next.id, from_status: editingItem.gap_typ, to_status: next.gap_typ, comment: statusComment,
              });
            }
            setEditingItem(null);
          }}
        />
      )}
      {adding && (
        <GapItemDialog
          item={{
            id: makeId("gap"),
            domain: DOMAINS[0],
            objekt: "",
            nulaege: "",
            onskat_laege: "",
            gap_typ: "otillrackligt",
            konsekvens: "",
            atgard: "",
            ansvarig: "",
            deadline: "",
            prioritet: "MELLAN",
          }}
          isNew
          onClose={() => setAdding(false)}
          onSave={async (next) => {
            await onSave([...items, next]);
            setAdding(false);
          }}
        />
      )}
    </Box>
  );
};

const GapItemRow: React.FC<{
  item: GapItem;
  progress: { done: number; inProgress: number };
  hasTasks: boolean;
  isAdmin: boolean;
  horizonFilter: string;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, progress, hasTasks, isAdmin, horizonFilter, onEdit, onDelete }) => {
  const [open, setOpen] = useState(false);
  return (
    <Accordion
      expanded={open}
      onChange={() => setOpen(!open)}
      disableGutters
      elevation={0}
      sx={{ border: "1px solid", borderColor: "divider", mb: 0.75, "&:before": { display: "none" }, borderRadius: "6px !important" }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, "&.Mui-expanded": { minHeight: 48 } }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1, pr: 1 }}>
          <PrioritetChip p={item.prioritet} />
          <GapTypChip gt={item.gap_typ} />
          <Typography fontWeight={600} sx={{ fontSize: "0.9rem" }}>{item.objekt}</Typography>
        </Stack>
        {(hasTasks || item.gap_typ === "uppfyller_malbild") && (
          <Tooltip title={item.gap_typ === "uppfyller_malbild" ? "Uppfyller målbilden" : "Andel klara uppgifter, viktade efter omfattning"}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: "auto", pr: 1, flexShrink: 0 }}>
              <Box sx={{ width: 90 }}><GoalBar done={progress.done} inProgress={progress.inProgress} height={6} /></Box>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, textAlign: "right" }}>
                {Math.round(progress.done * 100)}%
              </Typography>
            </Stack>
          </Tooltip>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 2, px: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Box flex={1}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Nuläge</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{item.nulaege}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />
          <Box flex={1}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Önskat läge</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{item.onskat_laege}</Typography>
          </Box>
        </Stack>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Box flex={1}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Konsekvens</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{item.konsekvens}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />
          <Box flex={1}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Åtgärd</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{item.atgard || "—"}</Typography>
          </Box>
        </Stack>
        {(item.ansvarig || item.deadline) && (
          <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
            {item.ansvarig && (
              <Typography variant="caption" color="text.secondary">Ansvarig: {item.ansvarig}</Typography>
            )}
            {item.deadline && (
              <Typography variant="caption" color="text.secondary">Deadline: {item.deadline}</Typography>
            )}
          </Stack>
        )}
        {isAdmin && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }}>
            <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>Redigera</Button>
            <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={onDelete}>Ta bort</Button>
          </Stack>
        )}
        <Divider sx={{ my: 1.5 }} />
        <TaskList gapItemId={item.id} isAdmin={isAdmin} horizonFilter={horizonFilter} />
        <Divider sx={{ my: 1.5 }} />
        <StatusHistory gapItemId={item.id} />
        <Divider sx={{ my: 1.5 }} />
        <CommentsThread subjectType="gap_analys" subjectId={item.id} contextLabel={item.objekt} />
      </AccordionDetails>
    </Accordion>
  );
};

// ── Gap Item Dialog ───────────────────────────────────────────────────────────

const GapItemDialog: React.FC<{
  item: GapItem;
  isNew?: boolean;
  onClose: () => void;
  onSave: (item: GapItem, statusComment: string) => Promise<void>;
}> = ({ item, isNew, onClose, onSave }) => {
  const [form, setForm] = useState<GapItem>(item);
  const [statusComment, setStatusComment] = useState("");
  const [saving, setSaving] = useState(false);
  const gapTypChanged = !isNew && form.gap_typ !== item.gap_typ;
  const set = (k: keyof GapItem) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{item.objekt ? `Redigera: ${item.objekt}` : "Nytt gap"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Domän</InputLabel>
              <Select label="Domän" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}>
                {DOMAINS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Prioritet</InputLabel>
              <Select label="Prioritet" value={form.prioritet} onChange={(e) => setForm((f) => ({ ...f, prioritet: e.target.value as Prioritet }))}>
                <MenuItem value="HOG">HÖG</MenuItem>
                <MenuItem value="MELLAN">MELLAN</MenuItem>
                <MenuItem value="MINDRE">MINDRE</MenuItem>
                <MenuItem value="">Uppfyller målbilden</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>GAP-typ</InputLabel>
              <Select label="GAP-typ" value={form.gap_typ} onChange={(e) => setForm((f) => ({ ...f, gap_typ: e.target.value as GapTyp }))}>
                <MenuItem value="saknas_helt">Saknas helt</MenuItem>
                <MenuItem value="otillrackligt">Otillräckligt</MenuItem>
                <MenuItem value="ska_avvecklas">Ska avvecklas</MenuItem>
                <MenuItem value="uppfyller_malbild">Uppfyller målbilden</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          {gapTypChanged && (
            <TextField
              label={`Kommentar: ${GAP_TYP_LABELS[item.gap_typ]} → ${GAP_TYP_LABELS[form.gap_typ]}`}
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              size="small"
              autoFocus
              placeholder="T.ex. vad som gjort att målbilden nu är uppnådd"
              helperText="Sparas i gapets statushistorik"
            />
          )}
          <TextField label="Objekt / GAP-titel" value={form.objekt} onChange={set("objekt")} fullWidth size="small" required />
          <TextField label="Nuläge" value={form.nulaege} onChange={set("nulaege")} fullWidth multiline minRows={3} size="small" />
          <TextField label="Önskat läge" value={form.onskat_laege} onChange={set("onskat_laege")} fullWidth multiline minRows={3} size="small" />
          <TextField label="Konsekvens" value={form.konsekvens} onChange={set("konsekvens")} fullWidth multiline minRows={2} size="small" />
          <TextField label="Åtgärd" value={form.atgard} onChange={set("atgard")} fullWidth multiline minRows={2} size="small" />
          <Stack direction="row" spacing={2}>
            <TextField label="Ansvarig" value={form.ansvarig} onChange={set("ansvarig")} sx={{ flex: 1 }} size="small" />
            <TextField label="Deadline" value={form.deadline} onChange={set("deadline")} sx={{ flex: 1 }} size="small" placeholder="t.ex. Q3 2026" />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !form.objekt.trim()}
          onClick={async () => { setSaving(true); try { await onSave(form, statusComment.trim()); } finally { setSaving(false); } }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};


// ── Task list (embedded in gap item) ─────────────────────────────────────────

const TASK_STATUS_CONFIG: Record<GapTaskStatus, { label: string; color: string; icon: React.ReactElement }> = {
  todo:        { label: "Att göra",  color: "#757575", icon: <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} /> },
  in_progress: { label: "Pågår",     color: "#1565c0", icon: <PendingIcon sx={{ fontSize: 16 }} /> },
  done:        { label: "Klar",      color: "#2e7d32", icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  cancelled:   { label: "Avbruten",  color: "#b71c1c", icon: <CheckCircleIcon sx={{ fontSize: 16, opacity: 0.4 }} /> },
};

const NEXT_STATUS: Record<GapTaskStatus, GapTaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  cancelled: "todo",
};

const TaskList: React.FC<{ gapItemId: string; isAdmin: boolean; horizonFilter: string }> = ({ gapItemId, isAdmin, horizonFilter }) => {
  const { data: allTasks = [], isLoading } = useGapTasks(gapItemId);
  const createTask = useCreateGapTask();
  const updateTask = useUpdateGapTask();
  const deleteTask = useDeleteGapTask();
  const [editingTask, setEditingTask] = useState<GapTask | null>(null);
  const [adding, setAdding] = useState(false);

  const tasks = horizonFilter === "all" ? allTasks : allTasks.filter((t) => t.horizon === horizonFilter);
  const activeTasks = allTasks.filter((t) => t.status !== "cancelled");
  const sumWeight = (ts: GapTask[]) => ts.reduce((a, t) => a + t.weight, 0);
  const activeWeight = sumWeight(activeTasks);
  const doneShare = activeWeight > 0 ? sumWeight(activeTasks.filter((t) => t.status === "done")) / activeWeight : 0;
  const inProgressShare = activeWeight > 0 ? sumWeight(activeTasks.filter((t) => t.status === "in_progress")) / activeWeight : 0;

  if (isLoading) return <CircularProgress size={16} sx={{ my: 1 }} />;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: allTasks.length > 0 ? 1 : 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Uppgifter
          </Typography>
          {allTasks.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({allTasks.filter((t) => t.status === "done").length}/{activeTasks.length} klara · {Math.round(doneShare * 100)}% av omfattningen)
            </Typography>
          )}
        </Stack>
        {isAdmin && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ fontSize: "0.75rem" }}>
            Lägg till
          </Button>
        )}
      </Stack>

      {activeTasks.length > 0 && (
        <Box sx={{ mb: 1.5 }}><GoalBar done={doneShare} inProgress={inProgressShare} height={4} /></Box>
      )}

      {tasks.length > 0 && (
        <Stack spacing={0.5}>
          {tasks.map((task) => {
            const cfg = TASK_STATUS_CONFIG[task.status as GapTaskStatus] ?? TASK_STATUS_CONFIG.todo;
            return (
              <Stack key={task.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.25 }}>
                <Box
                  sx={{ cursor: isAdmin ? "pointer" : "default", color: cfg.color, display: "flex", alignItems: "center" }}
                  onClick={isAdmin ? () => updateTask.mutate({ id: task.id, status: NEXT_STATUS[task.status as GapTaskStatus] }) : undefined}
                >
                  {cfg.icon}
                </Box>
                <Typography
                  variant="body2"
                  sx={{ flex: 1, textDecoration: task.status === "done" || task.status === "cancelled" ? "line-through" : "none", color: task.status === "cancelled" ? "text.disabled" : "text.primary" }}
                >
                  {task.title}
                </Typography>
                {task.weight > 1 && (
                  <Tooltip title="Omfattning">
                    <Chip label={TASK_WEIGHT_LABELS[task.weight]} size="small" variant="outlined" sx={{ fontSize: "0.70rem", height: 20 }} />
                  </Tooltip>
                )}
                <HorizonChip h={task.horizon} />
                {task.assigned_to && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.72rem" }}>{task.assigned_to}</Typography>
                )}
                {task.due_date && (
                  <Typography variant="caption" color={new Date(task.due_date) < new Date() && task.status !== "done" ? "error" : "text.secondary"} sx={{ fontSize: "0.72rem" }}>
                    {task.due_date}
                  </Typography>
                )}
                {task.completed_at && (
                  <Typography variant="caption" color="success.main" sx={{ fontSize: "0.72rem" }}>
                    {new Date(task.completed_at).toLocaleDateString("sv-SE")}
                  </Typography>
                )}
                {isAdmin && (
                  <Stack direction="row">
                    <Tooltip title="Redigera"><IconButton size="small" onClick={() => setEditingTask(task)}><EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                    <Tooltip title="Ta bort"><IconButton size="small" onClick={() => deleteTask.mutate({ id: task.id, gap_item_id: gapItemId })}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                  </Stack>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      {tasks.length === 0 && horizonFilter !== "all" && allTasks.length > 0 && (
        <Typography variant="caption" color="text.disabled">Inga uppgifter för vald horisont.</Typography>
      )}

      {allTasks.length === 0 && !isAdmin && (
        <Typography variant="caption" color="text.disabled">Inga uppgifter knutna.</Typography>
      )}

      {adding && (
        <TaskDialog
          onClose={() => setAdding(false)}
          onSave={async (d) => { await createTask.mutateAsync({ ...d, gap_item_id: gapItemId }); setAdding(false); }}
        />
      )}
      {editingTask && (
        <TaskDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (d) => { await updateTask.mutateAsync({ id: editingTask.id, ...d }); setEditingTask(null); }}
        />
      )}
    </Box>
  );
};

// ── Status history (embedded in gap item) ────────────────────────────────────

const HISTORY_PREVIEW = 3;

const StatusHistory: React.FC<{ gapItemId: string }> = ({ gapItemId }) => {
  const { data: entries = [], isLoading } = useGapStatusLog(gapItemId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <CircularProgress size={16} sx={{ my: 1 }} />;

  const label = (e: { task_id: string | null }, st: string) =>
    e.task_id ? TASK_STATUS_CONFIG[st as GapTaskStatus]?.label ?? st : GAP_TYP_LABELS[st as GapTyp] ?? st;
  const shown = showAll ? entries : entries.slice(0, HISTORY_PREVIEW);

  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        Statushistorik
      </Typography>
      {entries.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
          Inga statusändringar ännu.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 0.75 }}>
          {shown.map((e) => (
            <Box key={e.id} sx={{ pl: 1.5, borderLeft: "3px solid", borderColor: e.task_id ? "divider" : "primary.main" }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" sx={{ rowGap: 0.25 }}>
                <Typography variant="caption" color="text.secondary">
                  {new Date(e.created_at).toLocaleDateString("sv-SE")}
                  {e.created_by ? ` · ${e.created_by}` : ""}
                </Typography>
                {e.task_id ? (
                  <Typography variant="caption" fontWeight={600}>Uppgift: {e.task_title}</Typography>
                ) : (
                  <Typography variant="caption" fontWeight={600}>GAP-typ</Typography>
                )}
                <Typography variant="caption">{label(e, e.from_status)}</Typography>
                <ArrowForwardIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                <Typography variant="caption" fontWeight={600}>{label(e, e.to_status)}</Typography>
              </Stack>
              {e.comment && (
                <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{e.comment}</Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}
      {entries.length > HISTORY_PREVIEW && (
        <Button size="small" onClick={() => setShowAll(!showAll)} sx={{ mt: 0.5, fontSize: "0.75rem" }}>
          {showAll ? "Visa färre" : `Visa alla (${entries.length})`}
        </Button>
      )}
    </Box>
  );
};

// ── Task dialog ───────────────────────────────────────────────────────────────

const TaskDialog: React.FC<{
  task?: GapTask;
  onClose: () => void;
  onSave: (d: { title: string; description: string; status?: GapTaskStatus; assigned_to: string; due_date: string | null; horizon: string; weight: number; status_comment?: string }) => Promise<void>;
}> = ({ task, onClose, onSave }) => {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<GapTaskStatus>(task?.status as GapTaskStatus ?? "todo");
  const [assigned_to, setAssignedTo] = useState(task?.assigned_to ?? "");
  const [due_date, setDueDate] = useState(task?.due_date ?? "");
  const [horizon, setHorizon] = useState(task?.horizon ?? "");
  const [weight, setWeight] = useState(task?.weight ?? 1);
  const [statusComment, setStatusComment] = useState("");
  const statusChanged = !!task && status !== task.status;
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{task ? "Redigera uppgift" : "Ny uppgift"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required />
          <TextField label="Beskrivning" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Tidshorisont</InputLabel>
              <Select label="Tidshorisont" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                <MenuItem value="">Ingen</MenuItem>
                <MenuItem value="0-3">0–3 månader</MenuItem>
                <MenuItem value="3-6">3–6 månader</MenuItem>
                <MenuItem value="6-12">6–12 månader</MenuItem>
              </Select>
            </FormControl>
            <Tooltip title="Hur mycket uppgiften flyttar gapet mot målet" placement="top">
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Omfattning</InputLabel>
                <Select label="Omfattning" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
                  {Object.entries(TASK_WEIGHT_LABELS).map(([w, label]) => (
                    <MenuItem key={w} value={Number(w)}>{label} ({w})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Tooltip>
            {task && (
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as GapTaskStatus)}>
                  <MenuItem value="todo">Att göra</MenuItem>
                  <MenuItem value="in_progress">Pågår</MenuItem>
                  <MenuItem value="done">Klar</MenuItem>
                  <MenuItem value="cancelled">Avbruten</MenuItem>
                </Select>
              </FormControl>
            )}
          </Stack>
          {statusChanged && (
            <TextField
              label={`Kommentar: ${TASK_STATUS_CONFIG[task.status].label} → ${TASK_STATUS_CONFIG[status].label}`}
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              size="small"
              helperText="Sparas i gapets statushistorik"
            />
          )}
          <Stack direction="row" spacing={2}>
            <TextField label="Ansvarig" value={assigned_to} onChange={(e) => setAssignedTo(e.target.value)} sx={{ flex: 1 }} size="small" />
            <TextField label="Deadline" value={due_date} onChange={(e) => setDueDate(e.target.value)} sx={{ flex: 1 }} size="small" placeholder="ÅÅÅÅ-MM-DD" />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try { await onSave({ title: title.trim(), description, status, assigned_to, due_date: due_date || null, horizon, weight, status_comment: statusChanged ? statusComment.trim() : undefined }); }
            finally { setSaving(false); }
          }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GapAnalys;
