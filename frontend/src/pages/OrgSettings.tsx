import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Container, FormControlLabel, IconButton, MenuItem,
  Radio, RadioGroup, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import BusinessIcon from "@mui/icons-material/Business";
import ImageIcon from "@mui/icons-material/Image";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import {
  orgLogoUrl, useAppVersion, useDeleteOrgLogo, useOrgSettings, usePublicOrgSettings, useUpdateOrgSettings, useUploadOrgLogo,
  type OrgSettingsAdmin, type OrgSettingsValues,
} from "@/api/orgSettings";
import {
  SHARED_LINKS_MAX, isValidLinkUrl, useSharedLinks, useUpdateSharedLinks, type SharedLink,
} from "@/api/sharedLinks";

const FIELDS: { key: TextKey; label: string; help: string }[] = [
  { key: "app_name", label: "Portalens namn", help: "Visas i stället för standardnamnet: i sidhuvudet, på inloggningssidan, i webbläsarens flik och i texterna. Tomt = standardnamnet." },
  { key: "org_name", label: "Organisationens namn", help: "Visas på inloggningssidan och i PDF-rapporter." },
  { key: "org_short_name", label: "Kortnamn", help: "Används där det fulla namnet inte får plats." },
  {
    key: "allowed_email_domains",
    label: "Tillåtna e-postdomäner",
    help: "Kommaseparerade, t.ex. exempel.se. Bara konton i dessa domäner kan logga in med Entra ID och tas med i katalogsynken. Tomt = alla konton i organisationens Entra ID.",
  },
  {
    key: "change_log_departments",
    label: "Avdelningar som skriver i förändringsloggen",
    help: "Kommaseparerade, som Entra ID namnger dem. Administratörer får alltid skriva.",
  },
];

type TextKey = Exclude<keyof OrgSettingsValues, "anonymous_read" | "modules">;
type Form = Record<TextKey, string> & { anonymous_read: "" | "on" | "off" };

const EMPTY: Form = {
  app_name: "", org_name: "", org_short_name: "", brand_color: "", allowed_email_domains: "", change_log_departments: "",
  anonymous_read: "",
};

function errorText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : "Det gick inte att spara.";
}

const OrgSettings: React.FC = () => {
  const { data, isLoading, error } = useOrgSettings();
  const { data: pub } = usePublicOrgSettings();
  const { data: version } = useAppVersion();
  const update = useUpdateOrgSettings();
  const upload = useUploadOrgLogo();
  const removeLogo = useDeleteOrgLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v = data.values;
    setForm({
      app_name: v.app_name ?? "",
      org_name: v.org_name ?? "",
      org_short_name: v.org_short_name ?? "",
      brand_color: v.brand_color ?? "",
      allowed_email_domains: v.allowed_email_domains ?? "",
      change_log_departments: v.change_log_departments ?? "",
      anonymous_read: v.anonymous_read === null ? "" : v.anonymous_read ? "on" : "off",
    });
  }, [data]);

  if (isLoading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;
  if (error || !data) return <Alert severity="error" sx={{ m: 3 }}>Kunde inte läsa organisationsinställningarna.</Alert>;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = () => {
    const anonymous = form.anonymous_read === "" ? null : form.anonymous_read === "on";
    update.mutate({ ...form, anonymous_read: anonymous }, { onSuccess: () => setSaved(true) });
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload.mutate(file);
  };

  const defaultHint = (key: TextKey) => {
    const d = data.defaults[key];
    return d ? `Standard från installationen: ${d}` : "Ingen standard satt i installationen";
  };

  const logoSrc = orgLogoUrl(pub?.logo_version ?? null);
  const color = /^#[0-9A-Fa-f]{6}$/.test(form.brand_color) ? form.brand_color : "";

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <BusinessIcon color="primary" />
        <Typography variant="h5">Organisation</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        Inställningar för hela installationen. Ett tomt fält använder standardvärdet från installationens
        miljövariabler.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2.5}>
            {FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={data.defaults[f.key] ?? ""}
                helperText={`${f.help} ${defaultHint(f.key)}.`}
                fullWidth
                size="small"
              />
            ))}
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
              <TextField
                label="Profilfärg"
                value={form.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                placeholder="#RRGGBB"
                helperText="Organisationens färg, som #RRGGBB."
                size="small"
                sx={{ width: 220 }}
              />
              <Box
                component="input"
                type="color"
                aria-label="Välj profilfärg"
                value={color || "#1565C0"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("brand_color", e.target.value.toUpperCase())}
                sx={{ width: 48, height: 40, p: 0, border: "none", background: "none", cursor: "pointer" }}
              />
            </Stack>

            <TextField
              select
              label="Läsning utan inloggning"
              value={form.anonymous_read}
              onChange={(e) => set("anonymous_read", e.target.value as Form["anonymous_read"])}
              helperText="Om arkitekturobjekten kan läsas via API:t utan inloggning, till exempel av andra system. Anonyma anrop ser bara det som behörigheten Alla ger. Appen kräver alltid inloggning."
              size="small"
              fullWidth
            >
              <MenuItem value="">Standard från installationen ({data.defaults.anonymous_read ? "tillåten" : "inte tillåten"})</MenuItem>
              <MenuItem value="on">Tillåten</MenuItem>
              <MenuItem value="off">Inte tillåten</MenuItem>
            </TextField>

            {update.isError && <Alert severity="error">{errorText(update.error)}</Alert>}
            {saved && <Alert severity="success">Sparat.</Alert>}
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {data.updated_by ? `Senast ändrad av ${data.updated_by}` : ""}
              </Typography>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={update.isPending}>
                Spara
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <ModulesCard data={data} />

      <SharedLinksCard />

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Logotyp</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            PNG, JPEG, WebP eller SVG, högst 512 kB.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
            <Box
              sx={{
                width: 200, height: 80, border: "1px solid", borderColor: "divider", borderRadius: 1,
                display: "flex", alignItems: "center", justifyContent: "center", p: 1,
              }}
            >
              {logoSrc ? (
                <Box component="img" src={logoSrc} alt="Logotyp" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>Ingen logotyp</Typography>
              )}
            </Box>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogo} />
            <Button variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
              {data.has_logo ? "Byt logotyp" : "Ladda upp logotyp"}
            </Button>
            {data.has_logo && (
              <Button color="error" startIcon={<DeleteIcon />} onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
                Ta bort
              </Button>
            )}
          </Stack>
          {upload.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorText(upload.error)}</Alert>}
        </CardContent>
      </Card>

      {version && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 2 }}>
          Arkitekturportalen version {version}
        </Typography>
      )}
    </Container>
  );
};

/**
 * Which optional modules are on. "Installationens val" follows MODULES in
 * the environment; an own choice is stored here and wins over it. Switching
 * a module off hides it and closes its API, but keeps its data.
 */
const ModulesCard: React.FC<{ data: OrgSettingsAdmin }> = ({ data }) => {
  const update = useUpdateOrgSettings();
  const stored = data.values.modules;
  const [own, setOwn] = useState(stored !== null);
  const [chosen, setChosen] = useState<string[]>(stored ?? data.defaults.modules ?? []);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOwn(data.values.modules !== null);
    setChosen(data.values.modules ?? data.defaults.modules ?? []);
  }, [data]);

  const defaults = new Set(data.defaults.modules ?? []);
  const nameOf = (key: string) => data.module_catalog.find((m) => m.key === key)?.name ?? key;
  const defaultText = defaults.size
    ? data.module_catalog.filter((m) => defaults.has(m.key)).map((m) => m.name).join(", ")
    : "bara kärnan";

  const toggle = (key: string, on: boolean) => {
    setSaved(false);
    setChosen((c) => (on ? [...c, key] : c.filter((k) => k !== key)));
  };
  const handleSave = () => {
    update.mutate({ modules: own ? chosen : null }, { onSuccess: () => setSaved(true) });
  };
  const turnedOff = own ? [...defaults].filter((k) => !chosen.includes(k)) : [];

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Moduler</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Valfria delar av portalen. En avstängd modul syns inte och går inte att nå, men dess innehåll finns kvar
          och kommer tillbaka när modulen slås på igen. Arkitekturobjekten, rapporterna, lösningsskisserna och
          administrationen finns alltid.
        </Typography>
        <RadioGroup
          value={own ? "own" : "default"}
          onChange={(e) => { setSaved(false); setOwn(e.target.value === "own"); }}
        >
          <FormControlLabel value="default" control={<Radio />} label={`Installationens val (${defaultText})`} />
          <FormControlLabel value="own" control={<Radio />} label="Eget val" />
        </RadioGroup>
        <Stack spacing={1} sx={{ pl: 4, mt: 1 }}>
          {data.module_catalog.map((m) => (
            <FormControlLabel
              key={m.key}
              disabled={!own || Boolean(m.unavailable)}
              control={
                <Checkbox
                  checked={!m.unavailable && (own ? chosen.includes(m.key) : defaults.has(m.key))}
                  onChange={(e) => toggle(m.key, e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.name}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>{m.description}</Typography>
                  {m.unavailable && (
                    <Typography variant="caption" sx={{ color: "warning.main", display: "block" }}>{m.unavailable}</Typography>
                  )}
                </Box>
              }
            />
          ))}
        </Stack>
        {turnedOff.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {turnedOff.map(nameOf).join(", ")} stängs av för alla användare. Innehållet finns kvar.
          </Alert>
        )}
        {update.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorText(update.error)}</Alert>}
        {saved && <Alert severity="success" sx={{ mt: 2 }}>Sparat.</Alert>}
        <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={update.isPending}>
            Spara moduler
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

/**
 * Quick links for everyone: shown first under Snabblänkar on the start page,
 * before each person's own shortcuts. An address is a web address or a path on
 * this server (e.g. a service beside the portal).
 */
const SharedLinksCard: React.FC = () => {
  const { data: stored, isLoading } = useSharedLinks();
  const update = useUpdateSharedLinks();
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (stored) setLinks(stored); }, [stored]);

  const change = (i: number, patch: Partial<SharedLink>) => {
    setSaved(false);
    setLinks((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  };
  const move = (i: number, d: -1 | 1) => {
    setSaved(false);
    setLinks((ls) => {
      const next = [...ls];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  };
  const remove = (i: number) => { setSaved(false); setLinks((ls) => ls.filter((_, k) => k !== i)); };
  const add = () => { setSaved(false); setLinks((ls) => [...ls, { title: "", url: "", description: "", new_tab: false }]); };

  const problems = links.map((l) => ({
    title: !l.title.trim() ? "Ange en titel" : "",
    url: !l.url.trim() ? "Ange en adress" : !isValidLinkUrl(l.url) ? "Börja med https://, http:// eller /" : "",
  }));
  const invalid = problems.some((p) => p.title || p.url);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Gemensamma snabblänkar</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Visas för alla inloggade, först under Snabblänkar på startsidan och före var och ens egna genvägar.
          Adressen kan vara en webbadress (https://…) eller en sida på samma server (/…). Högst {SHARED_LINKS_MAX} länkar.
        </Typography>
        {isLoading ? (
          <CircularProgress size={24} />
        ) : (
          <Stack spacing={2}>
            {links.length === 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>Inga gemensamma länkar.</Typography>
            )}
            {links.map((l, i) => (
              <Box key={i} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label="Titel" size="small" value={l.title} slotProps={{ htmlInput: { maxLength: 60 } }} sx={{ flex: 1 }}
                    onChange={(e) => change(i, { title: e.target.value })}
                    error={Boolean(problems[i].title) && l.title !== ""} helperText={l.title !== "" ? problems[i].title : ""}
                  />
                  <TextField
                    label="Adress" size="small" value={l.url} slotProps={{ htmlInput: { maxLength: 500 } }} sx={{ flex: 2 }}
                    placeholder="https://… eller /…"
                    onChange={(e) => change(i, { url: e.target.value })}
                    error={Boolean(problems[i].url) && l.url !== ""} helperText={l.url !== "" ? problems[i].url : ""}
                  />
                </Stack>
                <TextField
                  label="Beskrivning (valfri)" size="small" fullWidth value={l.description ?? ""} slotProps={{ htmlInput: { maxLength: 140 } }}
                  sx={{ mt: 2 }} onChange={(e) => change(i, { description: e.target.value })}
                />
                <Stack direction="row" sx={{ alignItems: "center", mt: 1 }}>
                  <FormControlLabel
                    control={<Checkbox checked={Boolean(l.new_tab)} onChange={(e) => change(i, { new_tab: e.target.checked })} />}
                    label="Öppna i ny flik"
                  />
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title="Flytta upp"><span>
                    <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Flytta ned"><span>
                    <IconButton size="small" disabled={i === links.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Ta bort länken">
                    <IconButton size="small" color="error" onClick={() => remove(i)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            ))}
            <Box>
              <Button startIcon={<AddIcon />} onClick={add} disabled={links.length >= SHARED_LINKS_MAX}>Lägg till länk</Button>
            </Box>
          </Stack>
        )}
        {update.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorText(update.error)}</Alert>}
        {saved && <Alert severity="success" sx={{ mt: 2 }}>Sparat. Länkarna syns nu för alla.</Alert>}
        <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="contained" startIcon={<SaveIcon />} disabled={update.isPending || invalid}
            onClick={() => update.mutate(links.map((l) => ({ ...l, description: l.description?.trim() || null })), { onSuccess: () => setSaved(true) })}
          >
            Spara länkar
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default OrgSettings;
