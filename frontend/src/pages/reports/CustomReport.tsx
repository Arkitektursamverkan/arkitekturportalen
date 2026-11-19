/**
 * One of the installation's own reports (`/reports/egna/:key`).
 *
 * The content is loaded as data by the installation; the page only knows how
 * to show a report KIND. There is one so far:
 *
 * **Kopplingsförslag** – suggested connections. Nothing is connected until an
 * administrator presses **Koppla** on a row (or on a whole group); **Avstå**
 * puts the suggestion aside. Either can be taken back. The list is meant to be
 * worked through, so it filters on everything a row carries and groups on
 * whichever of them is the handiest way in.
 */
import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Paper, Select,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LinkIcon from "@mui/icons-material/Link";
import UndoIcon from "@mui/icons-material/Undo";
import { useSnackbar } from "notistack";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useCustomReport, useDecide, type ProposalRow } from "@/api/customReports";
import { NODE_COLORS } from "@/config/graphConfig";
import { useRoleStore } from "@/store/roleStore";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { NodeType } from "@/types/graph";

type Status = "forslag" | "kopplad" | "avstadd" | "finns" | "saknas";
const STATUSAR: Status[] = ["forslag", "kopplad", "avstadd", "finns", "saknas"];
const STATUS_FÄRG: Record<Status, "default" | "success" | "warning" | "info" | "error"> = {
  forslag: "info",
  kopplad: "success",
  avstadd: "default",
  finns: "success",
  saknas: "error",
};

/** Where a row stands. A decision wins; otherwise what the graph says now. */
function statusFör(r: ProposalRow): Status {
  if (r.beslut?.val === "koppla") return "kopplad";
  if (r.beslut?.val === "avstå") return "avstadd";
  if (!r.source || !r.target) return "saknas";
  return r.finns ? "finns" : "forslag";
}

type Gruppering = "grupp" | "source" | "target" | "edge_type" | "säkerhet" | "ingen";
const GRUPPERINGAR: Gruppering[] = ["grupp", "source", "target", "edge_type", "säkerhet", "ingen"];
/** hög before medel before låg; anything else last, alphabetically. */
const SÄKERHETSORDNING = ["hög", "medel", "låg"];

const TOM = "__alla__";

function Objekt({ o, saknas }: { o: ProposalRow["source"]; saknas: string }) {
  const { t } = useTranslation();
  if (!o) {
    return (
      <Typography variant="body2" sx={{ color: "error.main", fontStyle: "italic" }}>
        {saknas}
      </Typography>
    );
  }
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
        {o.name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: NODE_COLORS[o.type as NodeType] ?? "grey.500" }} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t(`nodeTypes.${o.type}`, { defaultValue: o.type })}
        </Typography>
      </Stack>
    </Box>
  );
}

const CustomReport: React.FC = () => {
  const { key } = useParams<{ key: string }>();
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const { isAdmin } = useRoleStore();
  const { data: report, isLoading, error } = useCustomReport(key);
  const decide = useDecide(key ?? "");

  const [sök, setSök] = useState("");
  const [statusar, setStatusar] = useState<Status[]>(["forslag"]);
  const [grupp, setGrupp] = useState(TOM);
  const [kopplingstyp, setKopplingstyp] = useState(TOM);
  const [säkerhet, setSäkerhet] = useState(TOM);
  const [frånTyp, setFrånTyp] = useState(TOM);
  const [tillTyp, setTillTyp] = useState(TOM);
  const [gruppering, setGruppering] = useState<Gruppering>("grupp");
  const [stängda, setStängda] = useState<Set<string>>(new Set());
  const [bekräfta, setBekräfta] = useState<{ rubrik: string; ids: string[]; val: "koppla" | "avstå" } | null>(null);
  const [arbetar, setArbetar] = useState<string | null>(null);

  const rader = useMemo(() => report?.rows ?? [], [report]);
  const typnamn = (typ: string) => t(`nodeTypes.${typ}`, { defaultValue: typ });
  const kantnamn = (typ: string) => t(`edgeTypes.${typ}`, { defaultValue: typ });

  // What there is to filter on – taken from the rows, so a report with other
  // groups or confidence words needs no change here.
  const val = useMemo(() => {
    const unika = (f: (r: ProposalRow) => string | undefined) =>
      [...new Set(rader.map(f).filter((v): v is string => Boolean(v)))];
    return {
      grupper: unika((r) => r.grupp).sort((a, b) => a.localeCompare(b, "sv")),
      kopplingstyper: unika((r) => r.edge_type),
      säkerheter: unika((r) => r.säkerhet).sort(
        (a, b) => (SÄKERHETSORDNING.indexOf(a) + 9) % 9 - (SÄKERHETSORDNING.indexOf(b) + 9) % 9 || a.localeCompare(b, "sv"),
      ),
      frånTyper: unika((r) => r.source?.type),
      tillTyper: unika((r) => r.target?.type),
    };
  }, [rader]);

  const antalPerStatus = useMemo(() => {
    const n: Record<Status, number> = { forslag: 0, kopplad: 0, avstadd: 0, finns: 0, saknas: 0 };
    for (const r of rader) n[statusFör(r)]++;
    return n;
  }, [rader]);

  const visade = useMemo(() => {
    const q = sök.trim().toLowerCase();
    return rader.filter((r) => {
      if (statusar.length && !statusar.includes(statusFör(r))) return false;
      if (grupp !== TOM && r.grupp !== grupp) return false;
      if (kopplingstyp !== TOM && r.edge_type !== kopplingstyp) return false;
      if (säkerhet !== TOM && r.säkerhet !== säkerhet) return false;
      if (frånTyp !== TOM && r.source?.type !== frånTyp) return false;
      if (tillTyp !== TOM && r.target?.type !== tillTyp) return false;
      if (!q) return true;
      return [r.source?.name, r.target?.name, r.motivering, r.grupp].some((s) => s?.toLowerCase().includes(q));
    });
  }, [rader, sök, statusar, grupp, kopplingstyp, säkerhet, frånTyp, tillTyp]);

  const grupperade = useMemo(() => {
    const nyckel = (r: ProposalRow): string => {
      switch (gruppering) {
        case "grupp": return r.grupp || "–";
        case "source": return r.source?.name ?? "–";
        case "target": return r.target?.name ?? "–";
        case "edge_type": return kantnamn(r.edge_type);
        case "säkerhet": return r.säkerhet || "–";
        default: return "";
      }
    };
    const m = new Map<string, ProposalRow[]>();
    for (const r of visade) m.set(nyckel(r), [...(m.get(nyckel(r)) ?? []), r]);
    const ordning = (a: string, b: string) =>
      gruppering === "säkerhet"
        ? (SÄKERHETSORDNING.indexOf(a) + 9) % 9 - (SÄKERHETSORDNING.indexOf(b) + 9) % 9
        : a.localeCompare(b, "sv");
    return [...m.entries()].sort(([a], [b]) => ordning(a, b));
    // kantnamn follows the language, which t carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visade, gruppering, t]);

  const besluta = async (ids: string[], v: "koppla" | "avstå" | null, märke: string) => {
    setArbetar(märke);
    try {
      const svar = await decide.mutateAsync({ rowIds: ids, val: v });
      if (svar.fel.length) {
        enqueueSnackbar(t("customReports.someFailed", { count: svar.fel.length }), { variant: "warning" });
      } else if (v === "koppla") {
        enqueueSnackbar(t("customReports.connected", { count: svar.skapade }), { variant: "success" });
      }
    } catch {
      enqueueSnackbar(t("customReports.decideError"), { variant: "error" });
    } finally {
      setArbetar(null);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error || !report) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">{t("customReports.missing")}</Alert>
      </Box>
    );
  }

  const väljare = (
    etikett: string, värde: string, sätt: (v: string) => void, alternativ: string[], visa: (v: string) => string = (v) => v,
  ) =>
    alternativ.length > 1 && (
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>{etikett}</InputLabel>
        <Select value={värde} label={etikett} onChange={(e) => sätt(e.target.value)}>
          <MenuItem value={TOM}>{t("customReports.all")}</MenuItem>
          {alternativ.map((a) => (
            <MenuItem key={a} value={a}>{visa(a)}</MenuItem>
          ))}
        </Select>
      </FormControl>
    );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        {report.title}
      </Typography>
      {report.description && (
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2, whiteSpace: "pre-line", maxWidth: 900 }}>
          {report.description}
        </Typography>
      )}

      {/* Status doubles as the summary: the counts are the whole report, the
          pressed ones are what the list shows. */}
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <ToggleButtonGroup size="small" value={statusar} onChange={(_, v: Status[]) => setStatusar(v)}>
          {STATUSAR.filter((s) => antalPerStatus[s] > 0 || s === "forslag").map((s) => (
            <ToggleButton key={s} value={s} sx={{ px: 1.5, textTransform: "none" }}>
              {t(`customReports.status.${s}`)}&nbsp;<strong>{antalPerStatus[s]}</strong>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {report.admin_only && <Chip size="small" variant="outlined" label={t("customReports.adminOnly")} />}
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={t("common.search")}
          value={sök}
          onChange={(e) => setSök(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        {väljare(t("customReports.group"), grupp, setGrupp, val.grupper)}
        {väljare(t("customReports.edgeType"), kopplingstyp, setKopplingstyp, val.kopplingstyper, kantnamn)}
        {väljare(t("customReports.confidence"), säkerhet, setSäkerhet, val.säkerheter)}
        {väljare(t("customReports.fromType"), frånTyp, setFrånTyp, val.frånTyper, typnamn)}
        {väljare(t("customReports.toType"), tillTyp, setTillTyp, val.tillTyper, typnamn)}
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>{t("customReports.groupBy")}</InputLabel>
          <Select
            value={gruppering}
            label={t("customReports.groupBy")}
            onChange={(e) => {
              setGruppering(e.target.value as Gruppering);
              setStängda(new Set());
            }}
          >
            {GRUPPERINGAR.map((g) => (
              <MenuItem key={g} value={g}>{t(`customReports.groupings.${g}`)}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
        {t("customReports.showing", { shown: visade.length, total: rader.length })}
      </Typography>

      {visade.length === 0 && <Alert severity="info">{t("customReports.nothing")}</Alert>}

      <Stack spacing={1.5}>
        {grupperade.map(([namn, grupprader]) => {
          const öppna = grupprader.filter((r) => statusFör(r) === "forslag").map((r) => r.id);
          const stängd = stängda.has(namn);
          return (
            <Paper key={namn || "alla"} variant="outlined">
              {gruppering !== "ingen" && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", px: 1, py: 0.5, bgcolor: "action.hover", cursor: "pointer" }}
                  onClick={() =>
                    setStängda((s) => {
                      const n = new Set(s);
                      if (n.has(namn)) n.delete(namn);
                      else n.add(namn);
                      return n;
                    })
                  }
                >
                  <IconButton size="small">{stängd ? <ChevronRightIcon /> : <ExpandMoreIcon />}</IconButton>
                  <Typography variant="subtitle2" sx={{ flex: 1, overflowWrap: "anywhere" }}>
                    {namn}
                  </Typography>
                  <Chip size="small" label={grupprader.length} />
                  {isAdmin && öppna.length > 1 && (
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        startIcon={<LinkIcon />}
                        onClick={() => setBekräfta({ rubrik: namn, ids: öppna, val: "koppla" })}
                      >
                        {t("customReports.connectAll", { count: öppna.length })}
                      </Button>
                      <Button size="small" color="inherit" onClick={() => setBekräfta({ rubrik: namn, ids: öppna, val: "avstå" })}>
                        {t("customReports.declineAll")}
                      </Button>
                    </Stack>
                  )}
                </Stack>
              )}
              <Collapse in={!stängd} unmountOnExit>
                {grupprader.map((r) => {
                  const status = statusFör(r);
                  const upptagen = arbetar === r.id;
                  return (
                    <Box
                      key={r.id}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.1fr) auto minmax(0,1.1fr) minmax(0,1.6fr) auto" },
                        gap: 1.5,
                        alignItems: "center",
                        px: 2,
                        py: 1,
                        borderTop: 1,
                        borderColor: "divider",
                        opacity: status === "avstadd" ? 0.6 : 1,
                      }}
                    >
                      <Objekt o={r.source} saknas={t("customReports.objectGone")} />
                      <Stack sx={{ alignItems: "center", color: "text.secondary" }}>
                        <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>{kantnamn(r.edge_type)}</Typography>
                        <ArrowForwardIcon fontSize="small" />
                      </Stack>
                      <Objekt o={r.target} saknas={t("customReports.objectGone")} />
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 0.25 }}>
                          {r.säkerhet && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${t("customReports.confidence")}: ${r.säkerhet}`}
                              color={r.säkerhet === "hög" ? "success" : r.säkerhet === "låg" ? "warning" : "default"}
                              sx={{ height: 20 }}
                            />
                          )}
                          {gruppering !== "grupp" && r.grupp && <Chip size="small" variant="outlined" label={r.grupp} sx={{ height: 20 }} />}
                        </Stack>
                        <Typography variant="body2" sx={{ color: "text.secondary", whiteSpace: "pre-line" }}>
                          {r.motivering}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "flex-end", minWidth: 190 }}>
                        {upptagen ? (
                          <CircularProgress size={20} />
                        ) : status === "forslag" ? (
                          isAdmin && (
                            <>
                              <Button
                                size="small"
                                variant="contained"
                                startIcon={<LinkIcon />}
                                disabled={Boolean(arbetar)}
                                onClick={() => besluta([r.id], "koppla", r.id)}
                              >
                                {t("customReports.connect")}
                              </Button>
                              <Button size="small" color="inherit" disabled={Boolean(arbetar)} onClick={() => besluta([r.id], "avstå", r.id)}>
                                {t("customReports.decline")}
                              </Button>
                            </>
                          )
                        ) : (
                          <>
                            <Tooltip
                              title={
                                r.beslut
                                  ? `${r.beslut.av ?? ""} · ${new Date(r.beslut.när).toLocaleString()}`
                                  : t(`customReports.statusHelp.${status}`)
                              }
                            >
                              <Chip size="small" color={STATUS_FÄRG[status]} label={t(`customReports.status.${status}`)} />
                            </Tooltip>
                            {isAdmin && r.beslut && (
                              <Tooltip title={t(r.beslut.val === "koppla" ? "customReports.undoConnected" : "customReports.undo")}>
                                <IconButton size="small" disabled={Boolean(arbetar)} onClick={() => besluta([r.id], null, r.id)}>
                                  <UndoIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Collapse>
            </Paper>
          );
        })}
      </Stack>

      <Dialog open={Boolean(bekräfta)} onClose={() => setBekräfta(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {bekräfta?.val === "koppla"
            ? t("customReports.confirmConnectTitle", { count: bekräfta?.ids.length ?? 0 })
            : t("customReports.confirmDeclineTitle", { count: bekräfta?.ids.length ?? 0 })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t(bekräfta?.val === "koppla" ? "customReports.confirmConnectBody" : "customReports.confirmDeclineBody", {
              group: bekräfta?.rubrik ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBekräfta(null)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const b = bekräfta;
              setBekräfta(null);
              if (b) void besluta(b.ids, b.val, `grupp:${b.rubrik}`);
            }}
          >
            {bekräfta?.val === "koppla" ? t("customReports.connect") : t("customReports.decline")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomReport;
