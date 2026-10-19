import React, { useMemo } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Divider,
  LinearProgress, Stack, Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useParams, useNavigate } from "react-router-dom";
import { useSolutionSketch, type SketchAnswers, type SketchStatus } from "@/api/solutionSketches";
import { useNodes } from "@/api/nodes";
import { usePrinciples, type PrincipleDomain } from "@/api/principles";
import { useModules } from "@/api/orgSettings";

const STATUS_LABEL: Record<SketchStatus, string> = {
  draft: "Utkast",
  in_review: "Under granskning",
  approved: "Godkänd",
  archived: "Arkiverad",
};

const HOSTING_LABEL: Record<string, string> = {
  Cloud: "Moln (SaaS / IaaS)",
  OnPrem: "On-prem",
  Hybrid: "Hybrid",
};
const AUTH_LABEL: Record<string, string> = {
  SSO: "SSO via Entra ID",
  SAML: "SAML 2.0",
  OIDC: "OIDC",
  Local: "Lokala konton",
};
const CLASSIFICATION_LABEL: Record<string, string> = {
  Open: "Öppen",
  Internal: "Intern",
  Confidential: "Konfidentiell",
  Secret: "Hemlig",
};
const COMPLEMENT_LABEL: Record<string, string> = {
  new: "Helt nytt behov",
  complement: "Komplement till befintliga applikationer",
  replace: "Ersätter befintliga applikationer",
};

interface QAProps {
  q: string;
  a?: React.ReactNode;
  empty?: boolean;
  notApplicable?: boolean;
}
const QA: React.FC<QAProps> = ({ q, a, empty, notApplicable }) => (
  <Box sx={{ mb: 1.5, breakInside: "avoid" }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
      {q}
    </Typography>
    {notApplicable ? (
      <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.disabled" }}>(ej relevant)</Typography>
    ) : empty ? (
      <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.disabled" }}>(ej besvarat)</Typography>
    ) : (
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }} component="div">{a}</Typography>
    )}
  </Box>
);

const isFilled = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && (Array.isArray(v) ? v.length > 0 : true);

const SolutionSketchPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: sketch, isLoading, error } = useSolutionSketch(id);
  const { data: nodes = [] } = useNodes();
  const { data: principles = [] } = usePrinciples(undefined, useModules().enabled("governance"));

  const nodeName = (nid: string): string => nodes.find((n) => n.id === nid)?.name ?? nid;

  const answers: SketchAnswers = sketch?.answers ?? {};

  const { coverage, totalFilled, totalFields, completion } = useMemo(() => {
    const na = new Set(answers.not_applicable ?? []);
    const ok = (v: unknown, path: string) => isFilled(v) || na.has(path);
    const b = answers.business ?? {};
    const i = answers.information ?? {};
    const ap = answers.application ?? {};
    const t = answers.technology ?? {};
    const cov = [
      { key: "business", label: "Behov & verksamhet", total: 4, filled: [
        ok(b.need_summary, "business.need_summary"),
        ok(b.process_ids, "business.processes"),
        ok(b.users_affected, "business.users_affected"),
        ok(b.strategic_alignment, "business.strategic_alignment"),
      ].filter(Boolean).length },
      { key: "data", label: "Information & data", total: 4, filled: [
        ok(i.data_inputs || i.data_outputs, "information.data_inputs"),
        ok(i.classification, "information.classification"),
        ok(i.owner, "information.owner"),
        ok(i.info_object_ids, "information.info_objects"),
      ].filter(Boolean).length },
      { key: "application", label: "Applikation & integrationer", total: 3, filled: [
        ok(ap.integrates_with_ids, "application.integrates_with"),
        ok(ap.lifecycle_expected, "application.lifecycle_expected"),
        ok(ap.vendor_strategy, "application.vendor_strategy"),
      ].filter(Boolean).length },
      { key: "technology", label: "Teknik & infrastruktur", total: 4, filled: [
        ok(t.hosting, "technology.hosting"),
        ok(t.auth_method, "technology.auth_method"),
        ok(t.security_classification, "technology.security_classification"),
        ok(t.tech_component_ids, "technology.tech_components"),
      ].filter(Boolean).length },
    ];
    const tf = cov.reduce((s, c) => s + c.filled, 0);
    const tt = cov.reduce((s, c) => s + c.total, 0);
    return { coverage: cov, totalFilled: tf, totalFields: tt, completion: tt ? Math.round((tf / tt) * 100) : 0 };
  }, [answers]);

  const risk = useMemo(() => {
    let score = 0;
    const reasons: string[] = [];
    const integrations = answers.application?.integrates_with_ids?.length ?? 0;
    if (integrations > 0) { score += integrations; reasons.push(`+${integrations} (${integrations} integration${integrations > 1 ? "er" : ""})`); }
    if (answers.information?.personal_data) { score += 3; reasons.push("+3 (personuppgifter)"); }
    if (answers.information?.classification === "Secret") { score += 5; reasons.push("+5 (klassificering: Hemlig)"); }
    else if (answers.information?.classification === "Confidential") { score += 3; reasons.push("+3 (klassificering: Konfidentiell)"); }
    if (answers.technology?.mfa_required === false) { score += 2; reasons.push("+2 (MFA ej krävd)"); }
    if (answers.technology?.hosting === "OnPrem") { score += 1; reasons.push("+1 (on-prem-drift)"); }
    if (!(answers.business?.process_ids?.length)) { score += 2; reasons.push("+2 (ingen process kopplad)"); }
    let level: "Låg" | "Medel" | "Hög" | "Kritisk" = "Låg";
    let color = "#43A047";
    if (score >= 13) { level = "Kritisk"; color = "#D32F2F"; }
    else if (score >= 8) { level = "Hög"; color = "#F57C00"; }
    else if (score >= 4) { level = "Medel"; color = "#FBC02D"; }
    return { score, level, color, reasons };
  }, [answers]);

  const relevantDomains = useMemo<PrincipleDomain[]>(() => {
    const na = new Set(answers.not_applicable ?? []);
    const has = (v: unknown, path: string) => Boolean(v && !na.has(path) && (Array.isArray(v) ? v.length : true));
    const out: PrincipleDomain[] = ["Övergripande"];
    const b = answers.business ?? {};
    if (has(b.process_ids, "business.processes") || has(b.need_summary, "business.need_summary")) out.push("Verksamhet");
    const i = answers.information ?? {};
    if (
      has(i.data_inputs, "information.data_inputs") ||
      has(i.data_outputs, "information.data_outputs") ||
      has(i.personal_data, "information.personal_data") ||
      has(i.classification, "information.classification") ||
      has(i.info_object_ids, "information.info_objects")
    ) out.push("Information");
    const a = answers.application ?? {};
    if (
      has(a.integrates_with_ids, "application.integrates_with") ||
      has(a.lifecycle_expected, "application.lifecycle_expected") ||
      has(a.vendor_strategy, "application.vendor_strategy") ||
      has(a.ux_notes, "application.ux_notes")
    ) out.push("Applikation");
    const t = answers.technology ?? {};
    if (
      has(t.hosting, "technology.hosting") ||
      has(t.auth_method, "technology.auth_method") ||
      has(t.security_classification, "technology.security_classification") ||
      has(t.tech_component_ids, "technology.tech_components")
    ) out.push("Teknik");
    return out;
  }, [answers]);

  const matchedPrinciples = useMemo(
    () => principles
      .filter((p) => p.status !== "Avvecklad")
      .filter((p) => relevantDomains.includes(p.domain))
      .sort((a, b) => a.identifier.localeCompare(b.identifier)),
    [principles, relevantDomains],
  );

  const proposals = useMemo(() => {
    const out: Array<{ section: string; type: string; name: string }> = [];
    for (const p of answers.business?.process_proposals ?? []) out.push({ section: "Behov", type: "Process", name: p });
    for (const p of answers.information?.info_object_proposals ?? []) out.push({ section: "Information", type: "Informationsobjekt", name: p });
    for (const p of answers.information?.info_source_proposals ?? []) out.push({ section: "Information", type: "Informationskälla", name: p });
    for (const p of answers.application?.integrates_with_proposals ?? []) out.push({ section: "Applikation", type: "Applikation", name: p });
    for (const p of answers.technology?.tech_component_proposals ?? []) out.push({ section: "Teknik", type: "Teknikkomponent", name: p });
    return out;
  }, [answers]);

  const checklist = useMemo(() => {
    const out: string[] = [
      "Vilken livscykel/roadmap garanteras under avtalstiden?",
      "Vilken support- och SLA-nivå erbjuds (svarstider, åtgärdstider)?",
      "Vilka exit- och dataportabilitetsvillkor gäller om avtalet sägs upp?",
    ];
    if ((answers.application?.integrates_with_ids?.length ?? 0) > 0) out.push("Stödjer applikationen REST API och/eller event-baserade integrationer? Vilka standarder?");
    if (answers.information?.personal_data) {
      out.push("Var lagras personuppgifterna (EU/EES eller utanför)?");
      out.push("Är personuppgiftsbiträdesavtal (DPA) inkluderat?");
      out.push("Hur uppfyller ni den registrerades rättigheter (utdrag, radering)?");
    }
    if (answers.technology?.mfa_required) out.push("Stödjer applikationen SAML 2.0 eller OIDC med MFA via vår identitetsplattform (Entra ID)?");
    if (answers.technology?.hosting === "Cloud") out.push("Vilken molnleverantör/region? Är det multi-tenant eller dedikerad miljö?");
    if (answers.information?.classification === "Confidential" || answers.information?.classification === "Secret") {
      out.push("Vilka säkerhetscertifieringar har leverantören (t.ex. ISO 27001, SOC 2)?");
      out.push("Hur hanteras kryptering i vila och vid överföring?");
    }
    if ((answers.technology?.tech_component_ids?.length ?? 0) > 0) out.push("Är applikationen kompatibel med våra valda teknikkomponenter (databas, OS, plattform)?");
    out.push("Vilka kostnadskomponenter finns (licens, drift, integrationer, support)?");
    return out;
  }, [answers]);

  if (isLoading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  if (error || !sketch) return <Box p={3}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda skiss"}</Alert></Box>;

  const renderNodeList = (ids: string[] | undefined, proposals: string[] | undefined): React.ReactNode => {
    const items = [
      ...(ids ?? []).map((nid) => nodeName(nid)),
      ...(proposals ?? []).map((p) => `${p} (förslag)`),
    ];
    if (items.length === 0) return null;
    return (
      <Stack direction="row" flexWrap="wrap" gap={0.5}>
        {items.map((name, i) => <Chip key={i} label={name} size="small" variant="outlined" />)}
      </Stack>
    );
  };

  const b = answers.business ?? {};
  const inf = answers.information ?? {};
  const ap = answers.application ?? {};
  const t = answers.technology ?? {};
  const naSet = new Set(answers.not_applicable ?? []);
  const isNA = (path: string) => naSet.has(path);

  return (
    <>
      <style>{`
        @media print {
          .ea-app-shell-chrome,
          .MuiDrawer-root,
          .MuiAppBar-root,
          .ea-print-toolbar { display: none !important; }
          main { margin-left: 0 !important; }
          body { background: white; }
          .ea-print-page { padding: 0 !important; max-width: none !important; }
        }
      `}</style>
      <Container maxWidth="md" className="ea-print-page" sx={{ py: 3 }}>
        <Stack className="ea-print-toolbar" direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/solution-sketches/${sketch.id}`)} variant="text">
            Tillbaka till skissen
          </Button>
          <Button startIcon={<PrintIcon />} onClick={() => window.print()} variant="contained">
            Skriv ut / spara som PDF
          </Button>
        </Stack>

        <Typography variant="overline" color="text.secondary">Lösningsskiss · sammanställning</Typography>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>{sketch.title || "(utan titel)"}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Chip size="small" label={STATUS_LABEL[sketch.status]} />
          <Typography variant="caption" color="text.secondary">
            Senast uppdaterad {new Date(sketch.updated_at).toLocaleString("sv-SE")}
          </Typography>
        </Stack>
        {sketch.description && <Typography variant="body1" sx={{ mb: 3 }}>{sketch.description}</Typography>}

        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 3, breakInside: "avoid" }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Sammanfattning</Typography>
          <Stack direction="row" spacing={4} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary">Kompletteringsgrad</Typography>
              <Typography variant="h6">{completion}% <Typography component="span" variant="caption" color="text.secondary">({totalFilled}/{totalFields} fält)</Typography></Typography>
              <LinearProgress variant="determinate" value={completion} sx={{ width: 200, height: 6, borderRadius: 1, mt: 0.5 }} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Riskpoäng</Typography>
              <Typography variant="h6">
                {risk.score}{" "}
                <Chip size="small" label={risk.level} sx={{ bgcolor: risk.color, color: "#fff" }} />
              </Typography>
              {risk.reasons.length > 0 && (
                <Typography variant="caption" color="text.secondary">{risk.reasons.join(" · ")}</Typography>
              )}
            </Box>
          </Stack>
          <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mt: 1.5 }}>
            {coverage.map((c) => (
              <Typography key={c.key} variant="caption" color="text.secondary">
                {c.label}: {c.filled}/{c.total}
              </Typography>
            ))}
          </Stack>
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, color: "#4CAF50" }}>1. Behov & verksamhet</Typography>
        <QA q="Vad är behovet? Vilket problem ska lösas?" a={b.need_summary} empty={!isFilled(b.need_summary)} notApplicable={isNA("business.need_summary")} />
        <QA q="Vilka processer ska stödjas?" a={renderNodeList(b.process_ids, b.process_proposals)} empty={!isFilled(b.process_ids) && !isFilled(b.process_proposals)} notApplicable={isNA("business.processes")} />
        <QA q="Komplement, ersättare eller helt nytt?" a={b.complement_or_replace ? COMPLEMENT_LABEL[b.complement_or_replace] : ""} empty={!isFilled(b.complement_or_replace)} notApplicable={isNA("business.complement_or_replace")} />
        <QA q="Vilka roller/användare berörs?" a={b.users_affected} empty={!isFilled(b.users_affected)} notApplicable={isNA("business.users_affected")} />
        <QA q="Strategisk koppling — vilket målområde stödjer det?" a={b.strategic_alignment} empty={!isFilled(b.strategic_alignment)} notApplicable={isNA("business.strategic_alignment")} />

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, color: "#FF9800" }}>2. Information & data</Typography>
        <QA q="Vilken information producerar applikationen?" a={inf.data_outputs} empty={!isFilled(inf.data_outputs)} notApplicable={isNA("information.data_outputs")} />
        <QA q="Vilken information konsumeras / läses in?" a={inf.data_inputs} empty={!isFilled(inf.data_inputs)} notApplicable={isNA("information.data_inputs")} />
        <QA q="Informationsägare (verksamhetsroll)" a={inf.owner} empty={!isFilled(inf.owner)} notApplicable={isNA("information.owner")} />
        <QA q="Informationsobjekt som hanteras" a={renderNodeList(inf.info_object_ids, inf.info_object_proposals)} empty={!isFilled(inf.info_object_ids) && !isFilled(inf.info_object_proposals)} notApplicable={isNA("information.info_objects")} />
        <QA q="Informationskällor som realiserar dessa" a={renderNodeList(inf.info_source_ids, inf.info_source_proposals)} empty={!isFilled(inf.info_source_ids) && !isFilled(inf.info_source_proposals)} notApplicable={isNA("information.info_sources")} />
        <QA q="Hanterar personuppgifter (GDPR)" a={inf.personal_data ? "Ja" : "Nej"} notApplicable={isNA("information.personal_data")} />
        <QA q="Klassificering" a={inf.classification ? CLASSIFICATION_LABEL[inf.classification] : ""} empty={!isFilled(inf.classification)} notApplicable={isNA("information.classification")} />

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, color: "#2196F3" }}>3. Applikation & integrationer</Typography>
        <QA q="Vilka applikationer ska det integreras med?" a={renderNodeList(ap.integrates_with_ids, ap.integrates_with_proposals)} empty={!isFilled(ap.integrates_with_ids) && !isFilled(ap.integrates_with_proposals)} notApplicable={isNA("application.integrates_with")} />
        <QA q="Krav på användarupplevelse" a={ap.ux_notes} empty={!isFilled(ap.ux_notes)} notApplicable={isNA("application.ux_notes")} />
        <QA q="Förväntad livscykel (år, ersättningsstrategi)" a={ap.lifecycle_expected} empty={!isFilled(ap.lifecycle_expected)} notApplicable={isNA("application.lifecycle_expected")} />
        <QA q="Hur ska lösningen anskaffas?" a={ap.vendor_strategy} empty={!isFilled(ap.vendor_strategy)} notApplicable={isNA("application.vendor_strategy")} />

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, color: "#9C27B0" }}>4. Teknik & infrastruktur</Typography>
        <QA q="Driftform" a={t.hosting ? HOSTING_LABEL[t.hosting] : ""} empty={!isFilled(t.hosting)} notApplicable={isNA("technology.hosting")} />
        <QA q="Autentiseringsmetod" a={t.auth_method ? AUTH_LABEL[t.auth_method] : ""} empty={!isFilled(t.auth_method)} notApplicable={isNA("technology.auth_method")} />
        <QA q="MFA krävs" a={t.mfa_required ? "Ja" : "Nej"} notApplicable={isNA("technology.mfa_required")} />
        <QA q="Säkerhetsklassificering / krav" a={t.security_classification} empty={!isFilled(t.security_classification)} notApplicable={isNA("technology.security_classification")} />
        <QA q="Beroende teknikkomponenter" a={renderNodeList(t.tech_component_ids, t.tech_component_proposals)} empty={!isFilled(t.tech_component_ids) && !isFilled(t.tech_component_proposals)} notApplicable={isNA("technology.tech_components")} />

        {proposals.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ breakInside: "avoid" }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Nya förslag ({proposals.length})</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Objekt som inte finns i EA-modellen ännu. Skapas som riktiga noder vid godkännande.
              </Typography>
              <Stack spacing={0.5}>
                {proposals.map((p, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="baseline">
                    <Chip label={p.type} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    <Typography variant="body2"><strong>{p.section}:</strong> {p.name}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </>
        )}

        {matchedPrinciples.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ breakInside: "avoid" }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Relevanta arkitekturprinciper</Typography>
              <Stack spacing={1}>
                {matchedPrinciples.map((p) => (
                  <Box key={p.id} sx={{ p: 1, borderLeft: "3px solid", borderColor: p.status === "Förslag" ? "warning.main" : "primary.main", bgcolor: "action.hover", borderRadius: "2px" }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption" fontWeight={700}>{p.identifier} · {p.domain}</Typography>
                      {p.status === "Förslag" && (
                        <Chip label="Förslag" size="small" variant="outlined" color="warning" sx={{ height: 16, fontSize: 10 }} />
                      )}
                    </Stack>
                    <Typography variant="body2">{p.name}</Typography>
                    {p.purpose && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>{p.purpose}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <Box sx={{ breakInside: "avoid" }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Frågor inför upphandling</Typography>
          <Box component="ol" sx={{ pl: 3, my: 0 }}>
            {checklist.map((q, i) => (
              <Box component="li" key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2">{q}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </>
  );
};

export default SolutionSketchPrint;
