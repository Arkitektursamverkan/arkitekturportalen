import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Container,
  FormControl, FormControlLabel, Grid, IconButton, InputLabel, Link as MuiLink,
  MenuItem, Select, Snackbar, Stack, Switch, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import {
  useSolutionSketch, useUpdateSketch,
  type SketchAnswers, type SketchStatus,
} from "@/api/solutionSketches";
import { useRoleStore } from "@/store/roleStore";
import NodeMultiSelect from "@/components/solutionSketch/NodeMultiSelect";
import HelpToggle from "@/components/solutionSketch/HelpToggle";
import NotApplicableToggle from "@/components/solutionSketch/NotApplicableToggle";
import AnalysisPanel from "@/components/solutionSketch/AnalysisPanel";

const STATUS_LABEL: Record<SketchStatus, string> = {
  draft: "Utkast",
  in_review: "Under granskning",
  approved: "Godkänd",
  archived: "Arkiverad",
};
const STATUS_COLOR: Record<SketchStatus, "default" | "warning" | "success" | "secondary"> = {
  draft: "default",
  in_review: "warning",
  approved: "success",
  archived: "secondary",
};

const Section: React.FC<{ title: string; accent: string; defaultExpanded?: boolean; children: React.ReactNode }> = ({ title, accent, defaultExpanded, children }) => (
  <Accordion defaultExpanded={defaultExpanded} sx={{ borderLeft: `4px solid ${accent}`, mb: 1 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
    </AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </Accordion>
);

const Field: React.FC<{
  field: string;
  helpRequests: string[];
  onToggleHelp: (next: string[]) => void;
  notApplicable: string[];
  onToggleNotApplicable: (next: string[]) => void;
  children: React.ReactNode;
}> = React.memo(({ field, helpRequests, onToggleHelp, notApplicable, onToggleNotApplicable, children }) => {
  const flagged = helpRequests.includes(field);
  const notApp = notApplicable.includes(field);
  return (
    <Box
      sx={{
        p: flagged ? 1.5 : 0,
        mx: flagged ? -1.5 : 0,
        borderRadius: 1,
        bgcolor: flagged ? "rgba(237,168,0,0.08)" : "transparent",
        borderLeft: flagged ? "3px solid #ED6C02" : "3px solid transparent",
        transition: "background-color 0.15s",
      }}
    >
      <Box
        sx={{
          opacity: notApp ? 0.45 : 1,
          pointerEvents: notApp ? "none" : "auto",
          filter: notApp ? "grayscale(60%)" : "none",
          transition: "opacity 0.15s",
        }}
        aria-hidden={notApp}
      >
        {children}
      </Box>
      <Box sx={{ mt: 0.75, display: "flex", justifyContent: "flex-end", gap: 0.75 }}>
        <NotApplicableToggle field={field} notApplicable={notApplicable} onToggle={onToggleNotApplicable} />
        <HelpToggle field={field} helpRequests={helpRequests} onToggle={onToggleHelp} />
      </Box>
    </Box>
  );
});

const SolutionSketchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const { isEditor: isAdmin } = useRoleStore();
  const { data: sketch, isLoading, error } = useSolutionSketch(id);
  const update = useUpdateSketch();

  // Local editable state, debounced save back to server
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<SketchAnswers>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (!sketch || initialised.current) return;
    setTitle(sketch.title);
    setDescription(sketch.description);
    setAnswers(sketch.answers ?? {});
    setSavedAt(sketch.updated_at);
    initialised.current = true;
  }, [sketch]);

  // Debounced auto-save
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!sketch || !initialised.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const next = await update.mutateAsync({ id: sketch.id, title, description, answers });
      setSavedAt(next.updated_at);
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, answers]);

  const setHelpRequests = useCallback(
    (next: string[]) => setAnswers((a) => ({ ...a, help_requests: next })),
    [],
  );
  const setNotApplicable = useCallback(
    (next: string[]) => setAnswers((a) => ({ ...a, not_applicable: next })),
    [],
  );

  if (isLoading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  if (error || !sketch) return <Box p={3}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda skiss"}</Alert></Box>;

  const setBusiness = (patch: Partial<NonNullable<SketchAnswers["business"]>>) =>
    setAnswers((a) => ({ ...a, business: { ...a.business, ...patch } }));
  const setInformation = (patch: Partial<NonNullable<SketchAnswers["information"]>>) =>
    setAnswers((a) => ({ ...a, information: { ...a.information, ...patch } }));
  const setApplication = (patch: Partial<NonNullable<SketchAnswers["application"]>>) =>
    setAnswers((a) => ({ ...a, application: { ...a.application, ...patch } }));
  const setTechnology = (patch: Partial<NonNullable<SketchAnswers["technology"]>>) =>
    setAnswers((a) => ({ ...a, technology: { ...a.technology, ...patch } }));

  const helpRequests = answers.help_requests ?? [];
  const notApplicable = answers.not_applicable ?? [];

  const changeStatus = async (next: SketchStatus) => {
    const updated = await update.mutateAsync({ id: sketch.id, status: next });
    setSavedAt(updated.updated_at);
  };

  const canEditMeta = sketch.status === "draft" || sketch.status === "in_review" || isAdmin;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink component={RouterLink} to="/solution-sketches" underline="hover" color="text.secondary">
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <ArrowBackIcon fontSize="small" /> <span>Lösningsskisser</span>
          </Stack>
        </MuiLink>
        <Typography color="text.primary">{title || "(utan titel)"}</Typography>
      </Breadcrumbs>

      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <TextField
          variant="standard"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEditMeta}
          placeholder="Titel"
          inputProps={{ style: { fontSize: 28, fontWeight: 700 } }}
          sx={{ flex: 1, maxWidth: 800 }}
        />
        <Chip size="small" label={STATUS_LABEL[sketch.status]} color={STATUS_COLOR[sketch.status]} />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={sketch.status}
            label="Status"
            onChange={(e) => changeStatus(e.target.value as SketchStatus)}
          >
            <MenuItem value="draft">Utkast</MenuItem>
            <MenuItem value="in_review">Under granskning</MenuItem>
            <MenuItem value="approved" disabled={!isAdmin}>Godkänd (admin)</MenuItem>
            <MenuItem value="archived" disabled={!isAdmin}>Arkiverad (admin)</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <TextField
            fullWidth size="small" label="Kort beskrivning"
            value={description} onChange={(e) => setDescription(e.target.value)}
            disabled={!canEditMeta}
            multiline minRows={2}
            sx={{ mb: 3 }}
          />

          <Section title="1. Behov & verksamhet" accent="#4CAF50" defaultExpanded>
            <Stack spacing={2}>
              <Field field="business.need_summary" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Vad är behovet? Vilket problem ska lösas?" multiline minRows={3} fullWidth
                  value={answers.business?.need_summary ?? ""}
                  onChange={(e) => setBusiness({ need_summary: e.target.value })}
                />
              </Field>
              <Field field="business.processes" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <NodeMultiSelect
                  type="Process" label="Vilka processer ska stödjas?"
                  ids={answers.business?.process_ids ?? []}
                  proposals={answers.business?.process_proposals ?? []}
                  onChange={({ ids, proposals }) => setBusiness({ process_ids: ids, process_proposals: proposals })}
                  helperText="Välj från befintliga processer eller lägg till ett förslag om processen saknas."
                />
              </Field>
              <Field field="business.complement_or_replace" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Komplement, ersättare eller helt nytt?</InputLabel>
                  <Select
                    value={answers.business?.complement_or_replace ?? ""}
                    label="Komplement, ersättare eller helt nytt?"
                    onChange={(e) => setBusiness({ complement_or_replace: e.target.value as "complement" | "replace" | "new" | "" })}
                  >
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="new">Helt nytt behov</MenuItem>
                    <MenuItem value="complement">Komplement till befintliga applikationer</MenuItem>
                    <MenuItem value="replace">Ersätter befintliga applikationer</MenuItem>
                  </Select>
                </FormControl>
              </Field>
              <Field field="business.users_affected" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Vilka roller/användare berörs?" fullWidth
                  value={answers.business?.users_affected ?? ""}
                  onChange={(e) => setBusiness({ users_affected: e.target.value })}
                />
              </Field>
              <Field field="business.strategic_alignment" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Strategisk koppling — vilket målområde stödjer det?" fullWidth
                  value={answers.business?.strategic_alignment ?? ""}
                  onChange={(e) => setBusiness({ strategic_alignment: e.target.value })}
                />
              </Field>
            </Stack>
          </Section>

          <Section title="2. Information & data" accent="#FF9800">
            <Stack spacing={2}>
              <Field field="information.data_outputs" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Vilken information producerar applikationen?" multiline minRows={2} fullWidth
                  value={answers.information?.data_outputs ?? ""}
                  onChange={(e) => setInformation({ data_outputs: e.target.value })}
                />
              </Field>
              <Field field="information.data_inputs" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Vilken information konsumeras / läses in?" multiline minRows={2} fullWidth
                  value={answers.information?.data_inputs ?? ""}
                  onChange={(e) => setInformation({ data_inputs: e.target.value })}
                />
              </Field>
              <Field field="information.owner" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Informationsägare (verksamhetsroll)" fullWidth
                  value={answers.information?.owner ?? ""}
                  onChange={(e) => setInformation({ owner: e.target.value })}
                />
              </Field>
              <Field field="information.info_objects" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <NodeMultiSelect
                  type="InformationObject" label="Informationsobjekt som hanteras"
                  ids={answers.information?.info_object_ids ?? []}
                  proposals={answers.information?.info_object_proposals ?? []}
                  onChange={({ ids, proposals }) => setInformation({ info_object_ids: ids, info_object_proposals: proposals })}
                />
              </Field>
              <Field field="information.info_sources" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <NodeMultiSelect
                  type="InformationSource" label="Informationskällor som realiserar dessa"
                  ids={answers.information?.info_source_ids ?? []}
                  proposals={answers.information?.info_source_proposals ?? []}
                  onChange={({ ids, proposals }) => setInformation({ info_source_ids: ids, info_source_proposals: proposals })}
                />
              </Field>
              <Field field="information.personal_data" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(answers.information?.personal_data)}
                      onChange={(e) => setInformation({ personal_data: e.target.checked })}
                    />
                  }
                  label="Hanterar personuppgifter (GDPR)"
                />
              </Field>
              <Field field="information.classification" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Klassificering</InputLabel>
                  <Select
                    value={answers.information?.classification ?? ""}
                    label="Klassificering"
                    onChange={(e) => setInformation({ classification: e.target.value as "" | "Open" | "Internal" | "Confidential" | "Secret" })}
                  >
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="Open">Öppen</MenuItem>
                    <MenuItem value="Internal">Intern</MenuItem>
                    <MenuItem value="Confidential">Konfidentiell</MenuItem>
                    <MenuItem value="Secret">Hemlig</MenuItem>
                  </Select>
                </FormControl>
              </Field>
            </Stack>
          </Section>

          <Section title="3. Applikation & integrationer" accent="#2196F3">
            <Stack spacing={2}>
              <Field field="application.integrates_with" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <NodeMultiSelect
                  type="Application" label="Vilka applikationer ska det integreras med?"
                  ids={answers.application?.integrates_with_ids ?? []}
                  proposals={answers.application?.integrates_with_proposals ?? []}
                  onChange={({ ids, proposals }) => setApplication({ integrates_with_ids: ids, integrates_with_proposals: proposals })}
                />
              </Field>
              <Field field="application.ux_notes" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Krav på användarupplevelse"
                  multiline minRows={2} fullWidth
                  value={answers.application?.ux_notes ?? ""}
                  onChange={(e) => setApplication({ ux_notes: e.target.value })}
                  helperText="Hur ska applikationen kännas att använda? T.ex. mobilanpassat, tillgänglighet (WCAG), språk, antal klick för vanliga uppgifter, behov av offline-läge."
                />
              </Field>
              <Field field="application.lifecycle_expected" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Förväntad livscykel (år, ersättningsstrategi)" fullWidth
                  value={answers.application?.lifecycle_expected ?? ""}
                  onChange={(e) => setApplication({ lifecycle_expected: e.target.value })}
                />
              </Field>
              <Field field="application.vendor_strategy" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Hur ska lösningen anskaffas?"
                  fullWidth
                  value={answers.application?.vendor_strategy ?? ""}
                  onChange={(e) => setApplication({ vendor_strategy: e.target.value })}
                  helperText='Köp av standardsystem, utbyggnad av befintlig plattform (t.ex. Microsoft 365), egenutveckling eller öppen källkod? "Best of breed" = bästa applikationen per område; "plattform" = samla flera funktioner i ett verktyg.'
                />
              </Field>
            </Stack>
          </Section>

          <Section title="4. Teknik & infrastruktur" accent="#9C27B0">
            <Stack spacing={2}>
              <Field field="technology.hosting" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Driftform</InputLabel>
                  <Select
                    value={answers.technology?.hosting ?? ""}
                    label="Driftform"
                    onChange={(e) => setTechnology({ hosting: e.target.value as "" | "Cloud" | "OnPrem" | "Hybrid" })}
                  >
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="Cloud">Moln (SaaS / IaaS)</MenuItem>
                    <MenuItem value="OnPrem">On-prem</MenuItem>
                    <MenuItem value="Hybrid">Hybrid</MenuItem>
                  </Select>
                </FormControl>
              </Field>
              <Field field="technology.auth_method" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Autentiseringsmetod</InputLabel>
                  <Select
                    value={answers.technology?.auth_method ?? ""}
                    label="Autentiseringsmetod"
                    onChange={(e) => setTechnology({ auth_method: e.target.value as "" | "SSO" | "SAML" | "Local" | "OIDC" })}
                  >
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="SSO">SSO via Entra ID</MenuItem>
                    <MenuItem value="SAML">SAML 2.0</MenuItem>
                    <MenuItem value="OIDC">OIDC</MenuItem>
                    <MenuItem value="Local">Lokala konton</MenuItem>
                  </Select>
                </FormControl>
              </Field>
              <Field field="technology.mfa_required" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(answers.technology?.mfa_required)}
                      onChange={(e) => setTechnology({ mfa_required: e.target.checked })}
                    />
                  }
                  label="MFA krävs"
                />
              </Field>
              <Field field="technology.security_classification" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <TextField
                  label="Säkerhetsklassificering / krav (t.ex. ISO 27001, NIS2)"
                  fullWidth
                  value={answers.technology?.security_classification ?? ""}
                  onChange={(e) => setTechnology({ security_classification: e.target.value })}
                />
              </Field>
              <Field field="technology.tech_components" helpRequests={helpRequests} onToggleHelp={setHelpRequests} notApplicable={notApplicable} onToggleNotApplicable={setNotApplicable}>
                <NodeMultiSelect
                  type="TechnologyComponent" label="Beroende teknikkomponenter"
                  ids={answers.technology?.tech_component_ids ?? []}
                  proposals={answers.technology?.tech_component_proposals ?? []}
                  onChange={({ ids, proposals }) => setTechnology({ tech_component_ids: ids, tech_component_proposals: proposals })}
                />
              </Field>
            </Stack>
          </Section>

          <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: "divider" }}>
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
              {sketch.status === "draft" && (
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={update.isPending}
                  onClick={() => changeStatus("in_review")}
                >
                  Skicka för granskning
                </Button>
              )}
              {sketch.status === "in_review" && (
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={update.isPending}
                  onClick={() => changeStatus("draft")}
                >
                  Återta till utkast
                </Button>
              )}
              <Button
                variant="outlined"
                size="large"
                onClick={() => window.open(`/solution-sketches/${sketch.id}/sammanstallning`, "_blank")}
              >
                Sammanställ
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
                {sketch.status === "draft" && "Skissen sparas löpande. När du är klar, skicka den för granskning av arkitekt."}
                {sketch.status === "in_review" && "Skissen är inskickad för granskning. Återta för att fortsätta redigera."}
                {(sketch.status === "approved" || sketch.status === "archived") && `Skissen är ${STATUS_LABEL[sketch.status].toLowerCase()} och kan inte längre ändras.`}
              </Typography>
            </Stack>
          </Box>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Box sx={{ position: wide ? "sticky" : "static", top: 80 }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <Typography variant="overline" color="text.secondary">Analys</Typography>
              {update.isPending ? (
                <Typography variant="caption" color="text.secondary">Sparar…</Typography>
              ) : savedAt ? (
                <Tooltip title={`Senast sparat ${new Date(savedAt).toLocaleString("sv-SE")}`}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CloudDoneIcon fontSize="small" color="success" />
                    <Typography variant="caption" color="text.secondary">Sparat</Typography>
                  </Stack>
                </Tooltip>
              ) : null}
            </Stack>
            <AnalysisPanel answers={answers} />
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default SolutionSketchDetail;
