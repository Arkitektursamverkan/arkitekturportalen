import React, { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import DownloadIcon from "@mui/icons-material/Download";
import LinkIcon from "@mui/icons-material/Link";
import ImageIcon from "@mui/icons-material/Image";
import PaletteIcon from "@mui/icons-material/Palette";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import LanguageIcon from "@mui/icons-material/Language";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";
import SeedingIcon from "@mui/icons-material/Yard";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import BarChartIcon from "@mui/icons-material/BarChart";
import { useTranslation } from "react-i18next";
import UsageStatistics from "@/components/UsageStatistics";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "@/store/themeStore";
import { useRoleStore } from "@/store/roleStore";
import { extractThemeFromUrl } from "@/api/theme";

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat",
  "Poppins", "Nunito", "Raleway", "Source Sans Pro", "Playfair Display",
];

// ── Component ─────────────────────────────────────────────────────────────────

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const store = useThemeStore();
  const { isAdmin, isEditor } = useRoleStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General settings state
  const [inspireUrl, setInspireUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [extractedFonts, setExtractedFonts] = useState<string[]>([]);
  const [extractError, setExtractError] = useState("");

  // ── General handlers ──────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!inspireUrl) return;
    setExtracting(true);
    setExtractError("");
    setExtractedColors([]);
    setExtractedFonts([]);
    try {
      const result = await extractThemeFromUrl(inspireUrl);
      setExtractedColors(result.colors);
      setExtractedFonts(result.fonts);
      if (result.colors.length === 0 && result.fonts.length === 0)
        setExtractError(t("settings.inspire.noResults"));
    } catch {
      setExtractError(t("settings.inspire.error"));
    } finally {
      setExtracting(false);
    }
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => store.setTheme({ logoBase64: reader.result as string, logoUrl: "" });
    reader.readAsDataURL(file);
  };

  const logoSrc = store.logoBase64 || store.logoUrl || "";

  return (
    <Box sx={{ p: 3, maxWidth: 760, mx: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5">{t("settings.title")}</Typography>
        <Button variant="outlined" startIcon={<RestoreIcon />} onClick={() => store.resetTheme()} size="small">
          {t("settings.resetDefaults")}
        </Button>
      </Stack>

      {(
        <>
          {/* Logo — editor */}
          {isEditor && <Section icon={<ImageIcon />} title={t("settings.logo.title")}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "flex-start" }}>
              {logoSrc && (
                <Box component="img" src={logoSrc} alt="Logo"
                  sx={{ height: 64, maxWidth: 200, objectFit: "contain", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 0.5 }} />
              )}
              <Stack spacing={1.5} sx={{ flexGrow: 1 }}>
                <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()} startIcon={<ImageIcon />}>
                  {t("settings.logo.upload")}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleLogoFile} />
                <TextField
                  label={t("settings.logo.urlLabel")} size="small" value={store.logoUrl}
                  onChange={(e) => store.setTheme({ logoUrl: e.target.value, logoBase64: "" })}
                  placeholder="https://example.com/logo.png" fullWidth
                />
                {logoSrc && (
                  <Button variant="text" size="small" color="error" onClick={() => store.setTheme({ logoBase64: "", logoUrl: "" })}>
                    {t("settings.logo.remove")}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Section>}

          {/* Colors — editor */}
          {isEditor &&
          <Section icon={<PaletteIcon />} title={t("settings.colors.title")}>
            <Stack spacing={2}>
              <ColorRow label={t("settings.colors.primary")}    value={store.primaryColor}   onChange={(v) => store.setTheme({ primaryColor: v })} />
              <ColorRow label={t("settings.colors.secondary")}  value={store.secondaryColor} onChange={(v) => store.setTheme({ secondaryColor: v })} />
              <ColorRow label={t("settings.colors.background")} value={store.bgColor}        onChange={(v) => store.setTheme({ bgColor: v })} />
            </Stack>
          </Section>}

          {/* Typography — editor */}
          {isEditor && <Section icon={<TextFieldsIcon />} title={t("settings.font.title")}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>{t("settings.font.family")}</InputLabel>
              <Select label={t("settings.font.family")} value={store.fontFamily} onChange={(e) => store.setTheme({ fontFamily: e.target.value })}>
                {FONT_OPTIONS.map((f) => (
                  <MenuItem key={f} value={f} sx={{ fontFamily: `"${f}", sans-serif` }}>{f}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, fontFamily: `"${store.fontFamily}", sans-serif` }}>
              {t("settings.font.preview")}: Aa Bb Cc 123
            </Typography>
          </Section>}

          {/* Website Inspiration — editor */}
          {isEditor &&
          <Section icon={<LinkIcon />} title={t("settings.inspire.title")}>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>{t("settings.inspire.description")}</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField size="small" label={t("settings.inspire.urlLabel")} value={inspireUrl}
                onChange={(e) => setInspireUrl(e.target.value)} placeholder="https://example.com"
                sx={{ flexGrow: 1 }} onKeyDown={(e) => e.key === "Enter" && handleExtract()} />
              <Button variant="contained" onClick={handleExtract} disabled={!inspireUrl || extracting} sx={{ minWidth: 120 }}>
                {extracting ? <CircularProgress size={20} color="inherit" /> : t("settings.inspire.extract")}
              </Button>
            </Stack>
            {extractError && <Alert severity="warning" sx={{ mb: 1.5 }}>{extractError}</Alert>}
            {extractedColors.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5 }}>
                  {t("settings.inspire.foundColors")}
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {extractedColors.map((color) => (
                    <Tooltip key={color} placement="top" arrow title={
                      <Stack spacing={0.5}>
                        <Typography variant="caption">{color}</Typography>
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" sx={{ color: "#fff", py: 0, fontSize: 10 }} onClick={() => store.setTheme({ primaryColor: color })}>{t("settings.colors.primary")}</Button>
                          <Button size="small" sx={{ color: "#fff", py: 0, fontSize: 10 }} onClick={() => store.setTheme({ secondaryColor: color })}>{t("settings.colors.secondary")}</Button>
                          <Button size="small" sx={{ color: "#fff", py: 0, fontSize: 10 }} onClick={() => store.setTheme({ bgColor: color })}>{t("settings.colors.background")}</Button>
                        </Stack>
                      </Stack>
                    }>
                      <Box sx={{ width: 40, height: 40, bgcolor: color, borderRadius: 1, cursor: "pointer", border: "2px solid", borderColor: "divider", "&:hover": { transform: "scale(1.15)", transition: "transform 0.15s" } }} />
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            )}
            {extractedFonts.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5 }}>
                  {t("settings.inspire.foundFonts")}
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {extractedFonts.map((font) => (
                    <Button key={font} variant="outlined" size="small"
                      onClick={() => store.setTheme({ fontFamily: font })}
                      sx={{ fontFamily: `"${font}", sans-serif`, textTransform: "none" }}>
                      {font}
                    </Button>
                  ))}
                </Stack>
              </Box>
            )}
          </Section>}

          {/* Demo data — editor. The endpoint imports fictional mock nodes
              that would mix with real data, so the backend refuses to run it
              as long as any node exists. */}
          {isEditor && <Section icon={<SeedingIcon />} title={t("home.seed.button")}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Inaktiverad — databasen innehåller redan skarp data. Att ladda demodata skulle blanda in
              fiktiva testobjekt bland riktiga applikationer och processer.
            </Alert>
            <Button variant="outlined" startIcon={<DownloadIcon />} disabled>
              {t("home.seed.button")}
            </Button>
          </Section>}

          {/* Users — admin only */}
          {isAdmin && <Section icon={<GroupIcon />} title={t("nav.users", { defaultValue: "Användare" })}>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              Hantera användarkonton, roller och lösenord.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={() => navigate("/users")}
            >
              Hantera användare
            </Button>
          </Section>}

          {/* Usage statistics — admin only */}
          {isAdmin && (
            <Section icon={<BarChartIcon />} title="Appanvändning">
              <UsageStatistics />
            </Section>
          )}

          {/* Language — all users */}
          <Section icon={<LanguageIcon />} title={t("settings.language.title")}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>{t("common.language")}</InputLabel>
              <Select label={t("common.language")} value={i18n.language.slice(0, 2)} onChange={(e) => i18n.changeLanguage(e.target.value)}>
                <MenuItem value="sv">Svenska</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </Select>
            </FormControl>
          </Section>

        </>
      )}
    </Box>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({
  icon, title, headerColor = "primary.main", children,
}: {
  icon: React.ReactNode; title: string; headerColor?: string; children: React.ReactNode;
}) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
          <Box sx={{ color: headerColor, display: "flex" }}>{icon}</Box>
          <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600 }}>{title}</Typography>
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {children}
      </CardContent>
    </Card>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => { setText(value); }, [value]);
  const commit = (raw: string) => { if (/^#[0-9a-fA-F]{6}$/.test(raw)) onChange(raw); };
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
      <Box component="input" type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setText(e.target.value); onChange(e.target.value); }}
        sx={{ width: 44, height: 44, border: "1px solid", borderColor: "divider", borderRadius: 1, cursor: "pointer", p: 0.25, bgcolor: "transparent", flexShrink: 0 }}
      />
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{value.toUpperCase()}</Typography>
      </Box>
      <TextField size="small" value={text}
        onChange={(e) => { const v = e.target.value; if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) setText(v); }}
        onBlur={() => commit(text)} onKeyDown={(e) => { if (e.key === "Enter") commit(text); }}
        sx={{ width: 110 }} slotProps={{ htmlInput: { maxLength: 7, style: { fontFamily: "monospace", fontSize: 13 } } }}
      />
    </Stack>
  );
}

export default Settings;
