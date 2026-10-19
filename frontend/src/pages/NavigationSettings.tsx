import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, IconButton, MenuItem, Stack, TextField,
  Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import LockIcon from "@mui/icons-material/Lock";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import SaveIcon from "@mui/icons-material/Save";
import { useTranslation } from "react-i18next";
import { useModules, usePublicOrgSettings, useSaveNavigation } from "@/api/orgSettings";
import {
  GROUP_ICONS, NAV_BLOCKS, PAGE_CATALOG, normalizeNav, type NavEntry, type NavGroupIcon,
} from "@/config/navigation";

/**
 * Administration → Meny: the order of the left menu, its groups and which
 * pages sit where. Blocks (Domän, Rapporter …) can be moved but not taken
 * apart; groups and single pages are free. Saved for everyone.
 */
const NavigationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading } = usePublicOrgSettings();
  const { pathEnabled } = useModules();
  const save = useSaveNavigation();
  const [draft, setDraft] = useState<NavEntry[] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(normalizeNav(data.navigation));
  }, [data]);

  const used = useMemo(() => {
    const s = new Set<string>();
    for (const e of draft ?? []) {
      if (e.type === "item") s.add(e.path);
      if (e.type === "group") e.items.forEach((p) => s.add(p));
    }
    return s;
  }, [draft]);

  if (isLoading || !draft) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;

  const free = Object.keys(PAGE_CATALOG).filter((p) => !used.has(p));
  const pageLabel = (p: string) => t(PAGE_CATALOG[p]?.labelKey ?? p);
  const blockLabel = (key: string) => {
    const b = NAV_BLOCKS.find((x) => x.key === key);
    return b ? t(b.labelKey, { defaultValue: b.fallback }) : key;
  };

  const change = (next: NavEntry[]) => { setSaved(false); setDraft(next); };
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const replace = (i: number, entry: NavEntry) => change(draft.map((e, k) => (k === i ? entry : e)));
  const remove = (i: number) => change(draft.filter((_, k) => k !== i));
  const addGroup = () => {
    let n = 1;
    while (draft.some((e) => e.type === "group" && e.id === `grupp-${n}`)) n += 1;
    change([...draft, { type: "group", id: `grupp-${n}`, label: "Ny grupp", icon: "folder", items: [] }]);
  };
  const handleSave = () => save.mutate({ entries: draft }, { onSuccess: () => setSaved(true) });
  const handleReset = () => {
    if (window.confirm("Återställ menyn till standard för alla användare?")) {
      save.mutate(null, { onSuccess: () => setSaved(true) });
    }
  };
  const emptyGroupLabel = draft.some((e) => e.type === "group" && !e.label.trim());

  const moduleChip = (p: string) =>
    pathEnabled(p) ? null : <Chip size="small" label="Modulen är avstängd" sx={{ ml: 1 }} />;

  const controls = (i: number, removable: boolean) => (
    <Stack direction="row" spacing={0.5}>
      <Tooltip title="Flytta upp"><span><IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Flytta ned"><span><IconButton size="small" disabled={i === draft.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton></span></Tooltip>
      {removable ? (
        <Tooltip title="Ta bort ur menyn"><IconButton size="small" onClick={() => remove(i)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      ) : (
        <Tooltip title="Ett block går att flytta men inte ta bort"><Box sx={{ p: 0.75, display: "flex" }}><LockIcon fontSize="small" color="disabled" /></Box></Tooltip>
      )}
    </Stack>
  );

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <MenuOpenIcon color="primary" />
        <Typography variant="h5">Meny</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Ordningen i vänstermenyn för alla användare. Blocken byggs av innehållet (t.ex. IT-landskapet och
        Rapporter) och kan flyttas men inte delas upp. Grupper och sidor ordnar du fritt. Sidor i en avstängd modul
        och sidor som användaren inte har behörighet till visas inte.
      </Typography>

      <Stack spacing={1.5}>
        {draft.map((e, i) => (
          <Card key={e.type === "block" ? `b-${e.key}` : e.type === "group" ? `g-${e.id}` : `i-${e.path}`} variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              {e.type === "block" && (
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2"><strong>{blockLabel(e.key)}</strong> <Typography component="span" variant="caption" color="text.secondary">block</Typography></Typography>
                  {controls(i, false)}
                </Stack>
              )}
              {e.type === "item" && (
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {PAGE_CATALOG[e.path]?.icon}
                    <Typography variant="body2">{pageLabel(e.path)}</Typography>
                    {moduleChip(e.path)}
                  </Stack>
                  {controls(i, true)}
                </Stack>
              )}
              {e.type === "group" && (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
                      <TextField
                        label="Grupp" size="small" value={e.label} sx={{ flex: 1 }}
                        error={!e.label.trim()} inputProps={{ maxLength: 60 }}
                        onChange={(ev) => replace(i, { ...e, label: ev.target.value })}
                      />
                      <TextField
                        select label="Ikon" size="small" value={e.icon} sx={{ width: 110 }}
                        onChange={(ev) => replace(i, { ...e, icon: ev.target.value as NavGroupIcon })}
                      >
                        {(Object.keys(GROUP_ICONS) as NavGroupIcon[]).map((k) => (
                          <MenuItem key={k} value={k}>{GROUP_ICONS[k]}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    {controls(i, true)}
                  </Stack>
                  <Stack spacing={0.5} sx={{ pl: 2 }}>
                    {e.items.length === 0 && (
                      <Typography variant="caption" color="text.secondary">Inga sidor – gruppen visas inte.</Typography>
                    )}
                    {e.items.map((p, k) => (
                      <Stack key={p} direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {PAGE_CATALOG[p]?.icon}
                          <Typography variant="body2">{pageLabel(p)}</Typography>
                          {moduleChip(p)}
                        </Stack>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" disabled={k === 0} onClick={() => {
                            const items = [...e.items]; [items[k - 1], items[k]] = [items[k], items[k - 1]];
                            replace(i, { ...e, items });
                          }}><ArrowUpwardIcon fontSize="small" /></IconButton>
                          <IconButton size="small" disabled={k === e.items.length - 1} onClick={() => {
                            const items = [...e.items]; [items[k + 1], items[k]] = [items[k], items[k + 1]];
                            replace(i, { ...e, items });
                          }}><ArrowDownwardIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => replace(i, { ...e, items: e.items.filter((x) => x !== p) })}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    ))}
                    {free.length > 0 && (
                      <TextField
                        select size="small" label="Lägg till sida i gruppen" value="" sx={{ maxWidth: 320 }}
                        onChange={(ev) => replace(i, { ...e, items: [...e.items, ev.target.value] })}
                      >
                        {free.map((p) => <MenuItem key={p} value={p}>{pageLabel(p)}</MenuItem>)}
                      </TextField>
                    )}
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
        <Button startIcon={<AddIcon />} onClick={addGroup}>Lägg till grupp</Button>
        {free.length > 0 && (
          <TextField
            select size="small" label="Lägg till sida i menyn" value="" sx={{ minWidth: 260 }}
            onChange={(ev) => change([...draft, { type: "item", path: ev.target.value }])}
          >
            {free.map((p) => <MenuItem key={p} value={p}>{pageLabel(p)}</MenuItem>)}
          </TextField>
        )}
      </Stack>
      {free.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Inte i menyn: {free.map(pageLabel).join(", ")}.
        </Typography>
      )}

      {save.isError && <Alert severity="error" sx={{ mt: 2 }}>Det gick inte att spara menyn.</Alert>}
      {saved && <Alert severity="success" sx={{ mt: 2 }}>Sparat. Menyn gäller för alla användare.</Alert>}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
        <Button color="warning" onClick={handleReset} disabled={save.isPending || !data?.navigation}>
          Återställ standard
        </Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={save.isPending || emptyGroupLabel}>
          Spara menyn
        </Button>
      </Stack>
    </Container>
  );
};

export default NavigationSettings;
