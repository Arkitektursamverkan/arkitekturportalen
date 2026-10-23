import React, { useMemo } from "react";
import {
  Alert, Box, Card, CardContent, Chip, Divider, LinearProgress, Stack,
  Typography,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FlagIcon from "@mui/icons-material/Flag";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { usePrinciples, type PrincipleDomain } from "@/api/principles";
import { useModules } from "@/api/orgSettings";
import type { SketchAnswers } from "@/api/solutionSketches";
import { fieldLabel } from "./fieldLabels";

const DOMAIN_COLORS: Record<string, string> = {
  business: "#4CAF50",
  data: "#FF9800",
  application: "#2196F3",
  technology: "#9C27B0",
};

interface CoverageDomain {
  key: "business" | "data" | "application" | "technology";
  label: string;
  filled: number;
  total: number;
}

function computeCoverage(a: SketchAnswers): CoverageDomain[] {
  const filled = (v: unknown) => Boolean(v && (Array.isArray(v) ? v.length : String(v).trim()));
  const na = new Set(a.not_applicable ?? []);
  const ok = (v: unknown, path: string) => filled(v) || na.has(path);
  const b = a.business ?? {};
  const i = a.information ?? {};
  const ap = a.application ?? {};
  const t = a.technology ?? {};
  return [
    {
      key: "business", label: "Behov & verksamhet", total: 4,
      filled: [
        ok(b.need_summary, "business.need_summary"),
        ok(b.process_ids, "business.processes"),
        ok(b.users_affected, "business.users_affected"),
        ok(b.strategic_alignment, "business.strategic_alignment"),
      ].filter(Boolean).length,
    },
    {
      key: "data", label: "Information & data", total: 4,
      filled: [
        ok(i.data_inputs || i.data_outputs, "information.data_inputs"),
        ok(i.classification, "information.classification"),
        ok(i.owner, "information.owner"),
        ok(i.info_object_ids, "information.info_objects"),
      ].filter(Boolean).length,
    },
    {
      key: "application", label: "Applikation & integrationer", total: 3,
      filled: [
        ok(ap.integrates_with_ids, "application.integrates_with"),
        ok(ap.lifecycle_expected, "application.lifecycle_expected"),
        ok(ap.vendor_strategy, "application.vendor_strategy"),
      ].filter(Boolean).length,
    },
    {
      key: "technology", label: "Teknik & infrastruktur", total: 4,
      filled: [
        ok(t.hosting, "technology.hosting"),
        ok(t.auth_method, "technology.auth_method"),
        ok(t.security_classification, "technology.security_classification"),
        ok(t.tech_component_ids, "technology.tech_components"),
      ].filter(Boolean).length,
    },
  ];
}

function computeRiskScore(a: SketchAnswers): { score: number; level: "Låg" | "Medel" | "Hög" | "Kritisk"; color: string; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const integrations = a.application?.integrates_with_ids?.length ?? 0;
  if (integrations > 0) { score += integrations; reasons.push(`+${integrations} (${integrations} integration${integrations > 1 ? "er" : ""})`); }
  if (a.information?.personal_data) { score += 3; reasons.push("+3 (personuppgifter)"); }
  if (a.information?.classification === "Secret") { score += 5; reasons.push("+5 (klassificering: Hemlig)"); }
  else if (a.information?.classification === "Confidential") { score += 3; reasons.push("+3 (klassificering: Konfidentiell)"); }
  if (a.technology?.mfa_required === false) { score += 2; reasons.push("+2 (MFA ej krävd)"); }
  if (a.technology?.hosting === "OnPrem") { score += 1; reasons.push("+1 (on-prem-drift)"); }
  if (!(a.business?.process_ids?.length)) { score += 2; reasons.push("+2 (ingen process kopplad)"); }

  let level: "Låg" | "Medel" | "Hög" | "Kritisk" = "Låg";
  let color = "#43A047";
  if (score >= 13) { level = "Kritisk"; color = "#D32F2F"; }
  else if (score >= 8) { level = "Hög"; color = "#F57C00"; }
  else if (score >= 4) { level = "Medel"; color = "#FBC02D"; }
  return { score, level, color, reasons };
}

function buildChecklist(a: SketchAnswers): string[] {
  const out: string[] = [
    "Vilken livscykel/roadmap garanteras under avtalstiden?",
    "Vilken support- och SLA-nivå erbjuds (svarstider, åtgärdstider)?",
    "Vilka exit- och dataportabilitetsvillkor gäller om avtalet sägs upp?",
  ];
  if ((a.application?.integrates_with_ids?.length ?? 0) > 0) {
    out.push("Stödjer applikationen REST API och/eller event-baserade integrationer? Vilka standarder?");
  }
  if (a.information?.personal_data) {
    out.push("Var lagras personuppgifterna (EU/EES eller utanför)?");
    out.push("Är personuppgiftsbiträdesavtal (DPA) inkluderat?");
    out.push("Hur uppfyller ni den registrerades rättigheter (utdrag, radering)?");
  }
  if (a.technology?.mfa_required) {
    out.push("Stödjer applikationen SAML 2.0 eller OIDC med MFA via vår identitetsplattform (Entra ID)?");
  }
  if (a.technology?.hosting === "Cloud") {
    out.push("Vilken molnleverantör/region? Är det multi-tenant eller dedikerad miljö?");
  }
  if (a.information?.classification === "Confidential" || a.information?.classification === "Secret") {
    out.push("Vilka säkerhetscertifieringar har leverantören (t.ex. ISO 27001, SOC 2)?");
    out.push("Hur hanteras kryptering i vila och vid överföring?");
  }
  if ((a.technology?.tech_component_ids?.length ?? 0) > 0) {
    out.push("Är applikationen kompatibel med våra valda teknikkomponenter (databas, OS, plattform)?");
  }
  out.push("Vilka kostnadskomponenter finns (licens, drift, integrationer, support)?");
  return out;
}

interface Props {
  answers: SketchAnswers;
}

export const AnalysisPanel: React.FC<Props> = ({ answers }) => {
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  // The principles are Arkitekturstyrning's; without it the panel leaves them out.
  const governance = useModules().enabled("governance");
  const { data: principles = [] } = usePrinciples(undefined, governance);

  const coverage = useMemo(() => computeCoverage(answers), [answers]);
  const totalFilled = coverage.reduce((s, c) => s + c.filled, 0);
  const totalFields = coverage.reduce((s, c) => s + c.total, 0);
  const completion = totalFields ? Math.round((totalFilled / totalFields) * 100) : 0;

  const overlaps = useMemo(() => {
    const procIds = answers.business?.process_ids ?? [];
    if (procIds.length === 0) return [];
    const procById = new Map(nodes.map((n) => [n.id, n]));
    return procIds.map((pid) => {
      const proc = procById.get(pid);
      const supportingApps = edges
        .filter((e) => e.type === "SUPPORTS" && e.target_id === pid)
        .map((e) => procById.get(e.source_id))
        .filter(Boolean) as typeof nodes;
      return { processId: pid, processName: proc?.name ?? pid, apps: supportingApps };
    }).filter((o) => o.apps.length > 0);
  }, [answers.business?.process_ids, nodes, edges]);

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

  const matchedPrinciples = useMemo(() => {
    return principles
      .filter((p) => p.status !== "Avvecklad")
      .filter((p) => relevantDomains.includes(p.domain))
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
  }, [principles, relevantDomains]);

  const risk = useMemo(() => computeRiskScore(answers), [answers]);
  const checklist = useMemo(() => buildChecklist(answers), [answers]);

  const proposals = useMemo(() => {
    const out: Array<{ section: string; type: string; name: string }> = [];
    for (const p of answers.business?.process_proposals ?? []) out.push({ section: "Behov", type: "Process", name: p });
    for (const p of answers.information?.info_object_proposals ?? []) out.push({ section: "Information", type: "Informationsobjekt", name: p });
    for (const p of answers.information?.info_source_proposals ?? []) out.push({ section: "Information", type: "Informationskälla", name: p });
    for (const p of answers.application?.integrates_with_proposals ?? []) out.push({ section: "Applikation", type: "Applikation", name: p });
    for (const p of answers.technology?.tech_component_proposals ?? []) out.push({ section: "Teknik", type: "Teknikkomponent", name: p });
    return out;
  }, [answers]);

  const helpRequests = answers.help_requests ?? [];
  const notApplicable = answers.not_applicable ?? [];

  return (
    <Stack spacing={2}>
      {/* Coverage */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Kompletteringsgrad</Typography>
          <LinearProgress variant="determinate" value={completion} sx={{ my: 1, height: 8, borderRadius: 1 }} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{completion}% ifyllt ({totalFilled}/{totalFields} fält)</Typography>
          <Stack spacing={0.5} sx={{ mt: 1.5 }}>
            {coverage.map((c) => (
              <Stack key={c.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: DOMAIN_COLORS[c.key] }} />
                <Typography variant="caption" sx={{ flex: 1 }}>{c.label}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>{c.filled}/{c.total}</Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Risk score */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Riskpoäng</Typography>
            <Chip label={`${risk.score} · ${risk.level}`} size="small" sx={{ bgcolor: risk.color, color: "#fff" }} />
          </Stack>
          {risk.reasons.length === 0 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Fyll i sektionerna så beräknas en riskprofil.</Typography>
          ) : (
            <Stack spacing={0.25}>
              {risk.reasons.map((r, i) => (
                <Typography key={i} variant="caption" sx={{ color: "text.secondary" }}>{r}</Typography>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Help requests */}
      {helpRequests.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <FlagIcon fontSize="small" sx={{ color: "#ED6C02" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Hjälp begärd ({helpRequests.length})</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Frågor markerade för granskning eller stöd. Visas för arkitekt vid review.
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {helpRequests.map((f) => (
                <Typography key={f} variant="body2">• {fieldLabel(f)}</Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Not applicable */}
      {notApplicable.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ej relevant ({notApplicable.length})</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Frågor som inte är relevanta för denna lösning och därför inte behöver besvaras.
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {notApplicable.map((f) => (
                <Typography key={f} variant="body2" sx={{ color: "text.secondary" }}>• {fieldLabel(f)}</Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Proposals (new entries the user wants to add) */}
      {proposals.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <AutoAwesomeIcon fontSize="small" color="info" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Nya förslag ({proposals.length})</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Objekt som inte finns i EA-modellen ännu. Skapas som riktiga noder vid godkännande.
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {proposals.map((p, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                  <Chip label={p.type} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                  <Typography variant="body2">{p.name}</Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Overlaps */}
      {overlaps.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <WarningAmberIcon fontSize="small" color="warning" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Överlapp upptäckt</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Följande processer stöds redan av befintliga applikationer. Är det här initiativet ett komplement, ersättare eller något helt nytt?
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {overlaps.map((o) => (
                <Box key={o.processId}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.processName}</Typography>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {o.apps.map((a) => <Chip key={a.id} label={a.name} size="small" sx={{ bgcolor: "#2196F3", color: "#fff" }} />)}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Principles */}
      {governance && (
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Relevanta arkitekturprinciper</Typography>
          {matchedPrinciples.length === 0 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Inga aktiva principer hittades för relevanta domäner. Lägg till i Arkitekturprinciper.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {matchedPrinciples.map((p) => (
                <Box key={p.id} sx={{ p: 1, borderLeft: "3px solid", borderColor: p.status === "Förslag" ? "warning.main" : "primary.main", bgcolor: "action.hover", borderRadius: "2px" }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{p.identifier} · {p.domain}</Typography>
                    {p.status === "Förslag" && (
                      <Chip label="Förslag" size="small" variant="outlined" color="warning" sx={{ height: 16, fontSize: 10 }} />
                    )}
                  </Stack>
                  <Typography variant="body2">{p.name}</Typography>
                  {p.purpose && <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>{p.purpose}</Typography>}
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
      )}

      {/* Procurement checklist */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <CheckCircleIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Frågor inför upphandling</Typography>
          </Stack>
          <Box component="ol" sx={{ pl: 3, my: 0 }}>
            {checklist.map((q, i) => (
              <Box component="li" key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2">{q}</Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
            Listan utökas dynamiskt allteftersom du fyller i skissen.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
};

export default AnalysisPanel;
