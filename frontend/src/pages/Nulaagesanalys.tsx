import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert, Box, Button, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, List, ListItemButton, ListItemText,
  Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import {
  useNulaagesanalys, useUpdateNulaagesanalys, useNulaagesanalysVersions,
  downloadNulaagesanalysPdf, downloadNulaagesanalysVersionPdf, makeSectionId,
  type NulaagesanalysContent, type TextSection,
} from "@/api/nulaagesanalys";
import { useRoleStore } from "@/store/roleStore";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";
import CommentsThread from "@/components/comments/CommentsThread";

const anchorId = (id: string) => `section-${id}`;

const Nulaagesanalys: React.FC = () => {
  const { isEditor: isAdmin } = useRoleStore();
  const { data, isLoading, error } = useNulaagesanalys();
  const update = useUpdateNulaagesanalys();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } =
    useNulaagesanalysVersions();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const location = useLocation();
  const theme = useTheme();
  const showToc = useMediaQuery(theme.breakpoints.up("lg"));

  useEffect(() => {
    if (!data || !location.hash) return;
    const id = location.hash.slice(1);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [data, location.hash]);

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  }
  if (error || !data) {
    return <Box p={3}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda nulägesanalys"}</Alert></Box>;
  }

  const c = data.content;
  const sections = c.sections;

  const save = (next: NulaagesanalysContent) => update.mutateAsync(next);
  const updateSection = (i: number, next: TextSection) =>
    save({ ...c, sections: sections.map((s, idx) => (idx === i ? next : s)) });
  const moveSection = (i: number, delta: -1 | 1) => {
    const t = i + delta;
    if (t < 0 || t >= sections.length) return;
    const next = [...sections];
    [next[i], next[t]] = [next[t], next[i]];
    return save({ ...c, sections: next });
  };
  const deleteSection = (i: number) =>
    save({ ...c, sections: sections.filter((_, idx) => idx !== i) });
  const addSection = (sec: TextSection) =>
    save({ ...c, sections: [...sections, sec] });

  const tocItems = sections.map((s, i) => ({ id: anchorId(s.id), label: `${i + 1}. ${s.title}` }));

  const content = (
    <Box sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
      <Stack direction="row" alignItems="center" mb={1}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Nulägesanalys IT-arkitektur</Typography>
          <Typography variant="caption" color="text.secondary">
            Kartläggning av befintligt IT-landskap
            {data.updated_by && ` · Uppdaterad ${new Date(data.updated_at).toLocaleString("sv-SE")} av ${data.updated_by}`}
          </Typography>
        </Box>
      </Stack>

      <DocumentExportPanel
        title="Nulägesanalys IT-arkitektur"
        documentType="nulaagesanalys"
        versions={versions}
        isLoading={versionsLoading}
        isAdmin={isAdmin}
        onDownload={(opts) => downloadNulaagesanalysPdf(opts)}
        onDownloadVersion={(id) => downloadNulaagesanalysVersionPdf(id)}
        onVersionsRefresh={() => { void refetchVersions(); }}
      />

      <Divider sx={{ my: 3 }} />

      {sections.map((sec, i) => (
        <Box key={sec.id} id={anchorId(sec.id)} sx={{ scrollMarginTop: 80, mb: 4 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="h5" fontWeight={600}>{i + 1}. {sec.title}</Typography>
            {isAdmin && (
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Flytta upp">
                  <span>
                    <IconButton size="small" disabled={i === 0} onClick={() => moveSection(i, -1)}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Flytta ner">
                  <span>
                    <IconButton size="small" disabled={i === sections.length - 1} onClick={() => moveSection(i, +1)}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Redigera">
                  <IconButton size="small" onClick={() => setEditingIndex(i)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Ta bort stycke">
                  <IconButton size="small" onClick={() => deleteSection(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Stack>
          {sec.body && (
            <Typography variant="body1" sx={{ whiteSpace: "pre-line", mb: 1 }}>{sec.body}</Typography>
          )}
          <CommentsThread subjectType="nulaagesanalys" subjectId={sec.id} contextLabel={sec.title} />
        </Box>
      ))}

      {isAdmin && (
        <Box sx={{ mt: 2, mb: 6, display: "flex", justifyContent: "center" }}>
          <Button startIcon={<AddIcon />} onClick={() => setAdding(true)} variant="outlined">
            Lägg till stycke
          </Button>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", py: 4, px: { xs: 2, md: 3 }, gap: 3 }}>
      {showToc && <TocSidebar items={tocItems} currentHash={location.hash} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>{content}</Box>

      {editingIndex !== null && sections[editingIndex] && (
        <SectionEditDialog
          section={sections[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onSave={async (next) => { await updateSection(editingIndex, next); setEditingIndex(null); }}
        />
      )}

      {adding && (
        <AddSectionDialog
          onClose={() => setAdding(false)}
          onAdd={async (sec) => { await addSection(sec); setAdding(false); }}
        />
      )}
    </Box>
  );
};

// ── TOC ──────────────────────────────────────────────────────────────────────

const TocSidebar: React.FC<{ items: { id: string; label: string }[]; currentHash: string }> = ({ items, currentHash }) => {
  const active = currentHash.slice(1);
  const click = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    }
  };
  return (
    <Box
      component="nav"
      aria-label="Innehållsförteckning"
      sx={{ width: 240, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ pl: 2 }}>Innehåll</Typography>
      <List dense>
        {items.map((item) => (
          <ListItemButton
            key={item.id}
            component="a"
            href={`#${item.id}`}
            onClick={click(item.id)}
            selected={active === item.id}
            sx={{ pl: 2, borderLeft: "2px solid", borderColor: active === item.id ? "primary.main" : "transparent", borderRadius: 0 }}
          >
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13, fontWeight: active === item.id ? 600 : 400 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
};

// ── Edit dialog ───────────────────────────────────────────────────────────────

const SectionEditDialog: React.FC<{
  section: TextSection;
  onClose: () => void;
  onSave: (next: TextSection) => Promise<void>;
}> = ({ section, onClose, onSave }) => {
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Redigera {section.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Rubrik" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Brödtext" value={body} onChange={(e) => setBody(e.target.value)} fullWidth multiline minRows={8} maxRows={30} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button variant="contained" disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try { await onSave({ ...section, title: title.trim(), body }); } finally { setSaving(false); }
          }}>
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Add section dialog ────────────────────────────────────────────────────────

const AddSectionDialog: React.FC<{
  onClose: () => void;
  onAdd: (section: TextSection) => Promise<void>;
}> = ({ onClose, onAdd }) => {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lägg till nytt stycke</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Rubrik"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try { await onAdd({ id: makeSectionId(title.trim()), title: title.trim(), body: "" }); } finally { setSaving(false); }
          }}
        >
          {saving ? "Skapar…" : "Skapa"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default Nulaagesanalys;
