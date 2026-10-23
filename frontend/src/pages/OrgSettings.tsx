import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Container, FormControlLabel, MenuItem, Radio,
  RadioGroup, Stack, TextField, Typography,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import ImageIcon from "@mui/icons-material/Image";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import {
  orgLogoUrl, useAppVersion, useDeleteOrgLogo, useOrgSettings, usePublicOrgSettings, useUpdateOrgSettings, useUploadOrgLogo,
  type OrgSettingsAdmin, type OrgSettingsValues,
} from "@/api/orgSettings";

const FIELDS: { key: TextKey; label: string; help: string }[] = [
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
  org_name: "", org_short_name: "", brand_color: "", allowed_email_domains: "", change_log_departments: "",
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
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <BusinessIcon color="primary" />
        <Typography variant="h5">Organisation</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3}>
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
            <Stack direction="row" spacing={2} alignItems="flex-start">
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
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
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

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Logotyp</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            PNG, JPEG, WebP eller SVG, högst 512 kB.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Box
              sx={{
                width: 200, height: 80, border: "1px solid", borderColor: "divider", borderRadius: 1,
                display: "flex", alignItems: "center", justifyContent: "center", p: 1,
              }}
            >
              {logoSrc ? (
                <Box component="img" src={logoSrc} alt="Logotyp" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <Typography variant="caption" color="text.secondary">Ingen logotyp</Typography>
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
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
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
        <Typography variant="body2" color="text.secondary" mb={2}>
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
                  <Typography variant="body2" fontWeight={600}>{m.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.description}</Typography>
                  {m.unavailable && (
                    <Typography variant="caption" color="warning.main" display="block">{m.unavailable}</Typography>
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
        <Stack direction="row" justifyContent="flex-end" mt={2}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={update.isPending}>
            Spara moduler
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default OrgSettings;
