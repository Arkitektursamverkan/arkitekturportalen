import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, Grid, IconButton, InputLabel,
  List, ListItemButton, ListItemText, MenuItem, Radio, RadioGroup,
  Select, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useTranslation } from "react-i18next";
import {
  useTargetArchitecture, useUpdateTargetArchitecture, newSection,
  useTargetArchitectureVersions, downloadTargetArchitecturePdf,
  downloadTargetArchitectureVersionPdf,
  type TargetArchitectureContent, type Section, type SectionKind,
  type TextSection, type VisionSection, type DomainSection,
  type FactBox as FactBoxData, type DomainKey,
} from "@/api/targetArchitecture";
import { useRoleStore } from "@/store/roleStore";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";
import { DomainPyramid } from "@/components/targetArchitecture/DomainPyramid";
import { FactBox } from "@/components/targetArchitecture/FactBox";
import { DescribesBox, AnswersBox } from "@/components/targetArchitecture/Callouts";
import CommentsThread from "@/components/comments/CommentsThread";

const DOMAIN_ACCENTS: Record<DomainKey, string> = {
  business: "#4CAF50",
  data: "#FF9800",
  application: "#2196F3",
  technology: "#9C27B0",
};

const DOMAIN_LABELS: Record<DomainKey, string> = {
  business: "Business / Verksamhet",
  data: "Data / Information",
  application: "Application / Tillämpningar",
  technology: "Technology / Infrastruktur",
};

const anchorId = (id: string) => `section-${id}`;

const TargetArchitecture: React.FC = () => {
  const { t } = useTranslation();
  const { isEditor: isAdmin } = useRoleStore();
  const { data, isLoading, error } = useTargetArchitecture();
  const update = useUpdateTargetArchitecture();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } =
    useTargetArchitectureVersions();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const location = useLocation();

  // Scroll to the requested anchor once content has loaded.
  useEffect(() => {
    if (!data || !location.hash) return;
    const id = location.hash.slice(1);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [data, location.hash]);

  const theme = useTheme();
  const showToc = useMediaQuery(theme.breakpoints.up("lg"));

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  }
  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda målarkitektur"}</Alert></Box>
    );
  }
  const c = data.content;
  const sections = c.sections;

  const save = (next: TargetArchitectureContent) => update.mutateAsync(next);

  const updateSection = (index: number, next: Section) =>
    save({ ...c, sections: sections.map((s, i) => (i === index ? next : s)) });

  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    return save({ ...c, sections: next });
  };

  const deleteSection = (index: number) =>
    save({ ...c, sections: sections.filter((_, i) => i !== index) });

  const addSection = (sec: Section) =>
    save({ ...c, sections: [...sections, sec] });

  const tocItems: TocItem[] = sections.map((sec, i) => ({
    id: anchorId(sec.id),
    label: `${i + 1}. ${sec.title}`,
    indent: sec.kind === "domain",
  }));

  const content = (
    <Box sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {t("targetArchitecture.title", { defaultValue: "Målarkitektur" })}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("targetArchitecture.subtitle", { defaultValue: "Önskat läge för IT-arkitekturen" })}
            {data.updated_by && ` · ${t("common.updated", { defaultValue: "Uppdaterad" })} ${new Date(data.updated_at).toLocaleString("sv-SE")} av ${data.updated_by}`}
          </Typography>
        </Box>
      </Stack>

      <DocumentExportPanel
        title="Målarkitektur"
        documentType="target_architecture"
        versions={versions}
        isLoading={versionsLoading}
        isAdmin={isAdmin}
        onDownload={(opts) => downloadTargetArchitecturePdf(opts)}
        onDownloadVersion={(id) => downloadTargetArchitectureVersionPdf(id)}
        onVersionsRefresh={() => { void refetchVersions(); }}
      />

      <Divider sx={{ my: 3 }} />

      {sections.map((sec, i) => (
        <SectionView
          key={sec.id}
          section={sec}
          number={i + 1}
          isAdmin={isAdmin}
          canMoveUp={i > 0}
          canMoveDown={i < sections.length - 1}
          onEdit={() => setEditingIndex(i)}
          onMoveUp={() => moveSection(i, -1)}
          onMoveDown={() => moveSection(i, +1)}
          onDelete={() => deleteSection(i)}
        />
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
          onSave={async (next) => {
            await updateSection(editingIndex, next);
            setEditingIndex(null);
          }}
        />
      )}

      {adding && (
        <AddSectionDialog
          onClose={() => setAdding(false)}
          onAdd={async (sec) => {
            await addSection(sec);
            setAdding(false);
          }}
        />
      )}
    </Box>
  );
};

// ── TOC ──────────────────────────────────────────────────────────────────────

interface TocItem {
  id: string;
  label: string;
  indent?: boolean;
}

const TocSidebar: React.FC<{ items: TocItem[]; currentHash: string }> = ({ items, currentHash }) => {
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
      sx={{
        width: 240, flexShrink: 0, position: "sticky", top: 80,
        alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto",
      }}
    >
      <Typography variant="overline" sx={{ color: "text.secondary", pl: 2 }}>
        Innehåll
      </Typography>
      <List dense>
        {items.map((item) => (
          <ListItemButton
            key={item.id}
            component="a"
            href={`#${item.id}`}
            onClick={click(item.id)}
            selected={active === item.id}
            sx={{
              pl: item.indent ? 4 : 2,
              borderLeft: "2px solid",
              borderColor: active === item.id ? "primary.main" : "transparent",
              borderRadius: 0,
            }}
          >
            <ListItemText
              primary={item.label}
              slotProps={{
                primary: { sx: {
                  fontSize: item.indent ? 12 : 13,
                  fontWeight: active === item.id ? 600 : 400,
                } }
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
};

// ── Section view ─────────────────────────────────────────────────────────────

interface SectionViewProps {
  section: Section;
  number: number;
  isAdmin: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

const SectionView: React.FC<SectionViewProps> = (props) => {
  switch (props.section.kind) {
    case "text":
      return <TextSectionView {...props} section={props.section} />;
    case "vision":
      return <VisionSectionView {...props} section={props.section} />;
    case "domain":
      return <DomainSectionView {...props} section={props.section} />;
  }
};

const AdminControls: React.FC<{
  isAdmin: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}> = ({ isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete }) => {
  if (!isAdmin) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Tooltip title="Flytta upp">
        <span>
          <IconButton size="small" disabled={!canMoveUp} onClick={onMoveUp}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Flytta ner">
        <span>
          <IconButton size="small" disabled={!canMoveDown} onClick={onMoveDown}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redigera">
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Ta bort stycke">
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );
};

const SectionHeader: React.FC<{
  number: number;
  title: string;
  variant?: "h5" | "h6";
  admin: React.ReactNode;
}> = ({ number, title, variant = "h5", admin }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
    <Typography variant={variant} sx={{ fontWeight: variant === "h5" ? 600 : 700 }}>
      {number}. {title}
    </Typography>
    {admin}
  </Stack>
);

const TextSectionView: React.FC<SectionViewProps & { section: TextSection }> = ({
  section, number, isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete,
}) => (
  <Box id={anchorId(section.id)} sx={{ scrollMarginTop: 80, mb: 4 }}>
    <SectionHeader
      number={number}
      title={section.title}
      admin={<AdminControls {...{ isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete }} />}
    />
    {section.body && (
      <Typography variant="body1" sx={{ whiteSpace: "pre-line", mb: 1 }}>{section.body}</Typography>
    )}
    <CommentsThread subjectType="target_architecture" subjectId={section.id} contextLabel={section.title} />
  </Box>
);

const VisionSectionView: React.FC<SectionViewProps & { section: VisionSection }> = ({
  section, number, isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete,
}) => (
  <Box id={anchorId(section.id)} sx={{ scrollMarginTop: 80, mb: 4 }}>
    <SectionHeader
      number={number}
      title={section.title}
      admin={<AdminControls {...{ isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete }} />}
    />
    <DomainPyramid showSideLabels />
    {section.body && (
      <Typography variant="body1" sx={{ whiteSpace: "pre-line", mt: 2, mb: 1 }}>{section.body}</Typography>
    )}
    <CommentsThread subjectType="target_architecture" subjectId={section.id} contextLabel={section.title} />
  </Box>
);

const DomainSectionView: React.FC<SectionViewProps & { section: DomainSection }> = ({
  section, number, isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete,
}) => {
  const accent = DOMAIN_ACCENTS[section.domain_key];
  return (
    <Box id={anchorId(section.id)} sx={{ mb: 5, scrollMarginTop: 80 }}>
      <SectionHeader
        number={number}
        title={section.title}
        variant="h6"
        admin={<AdminControls {...{ isAdmin, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, onDelete }} />}
      />
      <Grid container spacing={3} sx={{ alignItems: "center", mb: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <DomainPyramid highlight={section.domain_key} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2}>
            {section.answers && <AnswersBox text={section.answers} accent={accent} />}
            {section.describes && <DescribesBox text={section.describes} accent={accent} />}
          </Stack>
        </Grid>
      </Grid>

      {section.desired_state.length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Önskat läge</Typography>
            <Box component="ul" sx={{ pl: 3, my: 0 }}>
              {section.desired_state.map((item, i) => (
                <Box component="li" key={i} sx={{ mb: 0.5 }}>
                  <Typography variant="body2">{item}</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {section.fact_boxes.map((fb, i) => (
        <Box key={i} sx={{ mb: 2 }}>
          <FactBox data={fb} accent={accent} />
        </Box>
      ))}

      <CommentsThread subjectType="target_architecture" subjectId={section.id} contextLabel={section.title} />
    </Box>
  );
};

// ── Edit dialog (per kind) ───────────────────────────────────────────────────

const SectionEditDialog: React.FC<{
  section: Section;
  onClose: () => void;
  onSave: (next: Section) => Promise<void>;
}> = ({ section, onClose, onSave }) => {
  switch (section.kind) {
    case "text":
      return <TextSectionEditDialog section={section} onClose={onClose} onSave={onSave} />;
    case "vision":
      return <VisionSectionEditDialog section={section} onClose={onClose} onSave={onSave} />;
    case "domain":
      return <DomainSectionEditDialog section={section} onClose={onClose} onSave={onSave} />;
  }
};

const TitleAndBodyDialog: React.FC<{
  heading: string;
  initial: TextSection | VisionSection;
  onClose: () => void;
  onSave: (next: TextSection | VisionSection) => Promise<void>;
}> = ({ heading, initial, onClose, onSave }) => {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{heading}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Rubrik" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Brödtext" value={body} onChange={(e) => setBody(e.target.value)}
            fullWidth multiline minRows={6} maxRows={20} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button variant="contained" disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try { await onSave({ ...initial, title: title.trim(), body }); } finally { setSaving(false); }
          }}>
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TextSectionEditDialog: React.FC<{
  section: TextSection;
  onClose: () => void;
  onSave: (next: Section) => Promise<void>;
}> = ({ section, onClose, onSave }) => (
  <TitleAndBodyDialog
    heading={`Redigera ${section.title}`}
    initial={section}
    onClose={onClose}
    onSave={(next) => onSave(next as TextSection)}
  />
);

const VisionSectionEditDialog: React.FC<{
  section: VisionSection;
  onClose: () => void;
  onSave: (next: Section) => Promise<void>;
}> = ({ section, onClose, onSave }) => (
  <TitleAndBodyDialog
    heading={`Redigera ${section.title}`}
    initial={section}
    onClose={onClose}
    onSave={(next) => onSave(next as VisionSection)}
  />
);

const DomainSectionEditDialog: React.FC<{
  section: DomainSection;
  onClose: () => void;
  onSave: (next: Section) => Promise<void>;
}> = ({ section, onClose, onSave }) => {
  const [d, setD] = useState<DomainSection>(section);
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof DomainSection>(k: K, v: DomainSection[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const desiredStateText = d.desired_state.join("\n");

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Redigera {section.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Rubrik" value={d.title} onChange={(e) => setField("title", e.target.value)} fullWidth />
          <FormControl fullWidth>
            <InputLabel id="domain-key-label">Domän</InputLabel>
            <Select
              labelId="domain-key-label"
              label="Domän"
              value={d.domain_key}
              onChange={(e) => setField("domain_key", e.target.value as DomainKey)}
            >
              {(Object.keys(DOMAIN_LABELS) as DomainKey[]).map((k) => (
                <MenuItem key={k} value={k}>{DOMAIN_LABELS[k]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Beskriver" value={d.describes} onChange={(e) => setField("describes", e.target.value)} fullWidth multiline minRows={2} />
          <TextField label="Svarar på" value={d.answers} onChange={(e) => setField("answers", e.target.value)} fullWidth multiline minRows={2} />
          <TextField
            label="Önskat läge (en punkt per rad)"
            value={desiredStateText}
            onChange={(e) => setField(
              "desired_state",
              e.target.value.split("\n").filter((s, i, arr) => i < arr.length - 1 || s.length > 0),
            )}
            fullWidth multiline minRows={6}
            helperText="En punkt per rad. Tomma rader filtreras bort vid spar."
          />

          <Divider sx={{ my: 1 }}>Faktarutor</Divider>
          {d.fact_boxes.map((fb, i) => (
            <FactBoxEditor
              key={i}
              data={fb}
              onChange={(next) => setField("fact_boxes", d.fact_boxes.map((x, idx) => idx === i ? next : x))}
              onRemove={() => setField("fact_boxes", d.fact_boxes.filter((_, idx) => idx !== i))}
            />
          ))}
          <Button startIcon={<AddIcon />} onClick={() => setField("fact_boxes", [...d.fact_boxes, {
            subject: "", bullets: [], instead_of: "", we_say: "", implications: [],
          }])}>
            Lägg till faktaruta
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !d.title.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              const cleaned: DomainSection = {
                ...d,
                title: d.title.trim(),
                desired_state: d.desired_state.map((s) => s.trim()).filter(Boolean),
                fact_boxes: d.fact_boxes.map((fb) => ({
                  ...fb,
                  bullets: fb.bullets.map((s) => s.trim()).filter(Boolean),
                  implications: fb.implications.map((s) => s.trim()).filter(Boolean),
                })),
              };
              await onSave(cleaned);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const FactBoxEditor: React.FC<{
  data: FactBoxData;
  onChange: (next: FactBoxData) => void;
  onRemove: () => void;
}> = ({ data, onChange, onRemove }) => {
  const set = <K extends keyof FactBoxData>(k: K, v: FactBoxData[K]) => onChange({ ...data, [k]: v });
  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Faktaruta</Typography>
        <IconButton size="small" onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack spacing={1.5}>
        <TextField size="small" label="Ämne (t.ex. ”Arkitekturprinciper”)" value={data.subject} onChange={(e) => set("subject", e.target.value)} />
        <TextField size="small" label='Bullets efter "är något som:" (en per rad)' value={data.bullets.join("\n")} onChange={(e) => set("bullets", e.target.value.split("\n"))} multiline minRows={3} />
        <TextField size="small" label="Inte-citat" value={data.instead_of} onChange={(e) => set("instead_of", e.target.value)} multiline />
        <TextField size="small" label="Utan-citat" value={data.we_say} onChange={(e) => set("we_say", e.target.value)} multiline />
        <TextField size="small" label='"Innebär att" (en per rad)' value={data.implications.join("\n")} onChange={(e) => set("implications", e.target.value.split("\n"))} multiline minRows={3} />
      </Stack>
    </Box>
  );
};

// ── Add section dialog ───────────────────────────────────────────────────────

const AddSectionDialog: React.FC<{
  onClose: () => void;
  onAdd: (section: Section) => Promise<void>;
}> = ({ onClose, onAdd }) => {
  const [kind, setKind] = useState<SectionKind>("text");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lägg till nytt stycke</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Typ av stycke</Typography>
            <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as SectionKind)}>
              <FormControlLabel value="text" control={<Radio />} label="Fri text (rubrik + brödtext)" />
              <FormControlLabel value="vision" control={<Radio />} label="Visionsavsnitt (med arkitekturpyramid)" />
              <FormControlLabel value="domain" control={<Radio />} label="Domänavsnitt (med pyramid, beskriver/svarar på, önskat läge, faktarutor)" />
            </RadioGroup>
          </FormControl>
          <TextField autoFocus label="Rubrik" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Numreringen sätts automatiskt baserat på ordning. Du kan flytta stycket efter att det skapats.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await onAdd(newSection(kind, title.trim()));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Skapar…" : "Skapa"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TargetArchitecture;
