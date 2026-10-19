import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import CommentIcon from "@mui/icons-material/Comment";
import FlagIcon from "@mui/icons-material/Flag";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BlockIcon from "@mui/icons-material/Block";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import EditNoteIcon from "@mui/icons-material/EditNote";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LockIcon from "@mui/icons-material/Lock";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminNotifications, adminNotificationsKey,
  useFulfillGlossaryRequest, useDismissGlossaryRequest, useDismissNodeDeletion,
  type HelpRequestEntry, type GlossaryRequestEntry, type NodeDeletionEntry,
} from "@/api/adminNotifications";
import { NODE_COLORS } from "@/config/graphConfig";
import {
  proposalFieldLabel, useResolveChangeProposal, type ChangeProposal,
} from "@/api/changeProposals";
import {
  longRecurrenceLabel, timeLabel, useResolveCalendarEvent, type CalendarEvent,
} from "@/api/calendar";
import { useDeleteComment, useReviewComment, type Comment } from "@/api/comments";
import { useUpdateSketch, useSolutionSketch } from "@/api/solutionSketches";
import { usePrinciples } from "@/api/principles";
import { useModules } from "@/api/orgSettings";
import { fieldLabel } from "@/components/solutionSketch/fieldLabels";

const TA_SECTION_LABEL: Record<string, string> = {
  background: "Bakgrund",
  "overall-vision": "Övergripande målbild",
  "domain-business": "Verksamhetsarkitektur",
  "domain-data": "Informationsarkitektur",
  "domain-application": "Applikationsarkitektur",
  "domain-technology": "Teknisk arkitektur",
};

const Notifications: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useAdminNotifications(true);
  const { enabled: moduleOn } = useModules();
  const { data: principles = [] } = usePrinciples();
  const review = useReviewComment();
  const del = useDeleteComment();

  const [reviewing, setReviewing] = useState<Comment | null>(null);
  const [fulfilling, setFulfilling] = useState<GlossaryRequestEntry | null>(null);
  const fulfillRequest = useFulfillGlossaryRequest();
  const dismissRequest = useDismissGlossaryRequest();

  const principleById = useMemo(() => new Map(principles.map((p) => [p.id, p])), [principles]);

  const subjectLabel = (c: Comment): string => {
    if (c.subject_type === "principle") {
      const p = principleById.get(c.subject_id);
      return p ? `Princip · ${p.identifier} · ${p.name}` : `Princip · ${c.subject_id}`;
    }
    return `Målarkitektur · ${TA_SECTION_LABEL[c.subject_id] ?? c.subject_id}`;
  };

  const refresh = () => qc.invalidateQueries({ queryKey: adminNotificationsKey });

  if (isLoading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  if (error || !data) return <Box p={3}><Alert severity="error">{(error as Error)?.message ?? "Kunde inte ladda notifieringar"}</Alert></Box>;

  const changeProposals = data.change_proposals ?? [];
  const calendarProposals = data.calendar_proposals ?? [];
  // Sections of a switched-off module are left out, and so are their counts.
  // The API leaves out comments whose module is off (principles and documents
  // are Arkitekturstyrning's, glossary terms the Ordlista's).
  const pendingComments = data.pending_comments;
  const glossaryRequests = moduleOn("glossary") ? data.glossary_requests : [];
  const shownCalendarProposals = moduleOn("calendar") ? calendarProposals : [];
  const total = pendingComments.length + data.help_requests.length + glossaryRequests.length + data.node_deletions.length + changeProposals.length + shownCalendarProposals.length;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Meddelanden & notifieringar</Typography>
          <Typography variant="body2" color="text.secondary">
            {total === 0
              ? "Inga öppna ärenden — du är ikapp."
              : `${total} öppna ärende${total > 1 ? "n" : ""} att hantera.`}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <EditNoteIcon color="primary" />
        <Typography variant="h6">Ändringsförslag på objekt ({changeProposals.length})</Typography>
      </Stack>
      {changeProposals.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Inga öppna ändringsförslag.
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          {changeProposals.map((p) => (
            <ChangeProposalCard key={p.id} proposal={p} />
          ))}
        </Stack>
      )}

      {moduleOn("calendar") && (
      <>
      <Divider sx={{ my: 3 }} />

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <CalendarMonthIcon color="primary" />
        <Typography variant="h6">Förslag till verksamhetskalendern ({calendarProposals.length})</Typography>
      </Stack>
      {calendarProposals.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Inga öppna kalenderförslag.
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          {calendarProposals.map((e) => (
            <CalendarProposalCard key={e.id} event={e} />
          ))}
        </Stack>
      )}
      </>
      )}

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <CommentIcon color="primary" />
        <Typography variant="h6">Kommentarer att granska ({data.pending_comments.length})</Typography>
      </Stack>
      {data.pending_comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Inga väntande kommentarer.
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          {data.pending_comments.map((c) => (
            <Card key={c.id} variant="outlined">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <Chip size="small" label={subjectLabel(c)} variant="outlined" />
                  <Box flex={1} />
                  <Typography variant="caption" color="text.secondary">
                    {c.created_by} · {new Date(c.created_at).toLocaleString("sv-SE")}
                  </Typography>
                </Stack>
                <Typography variant="body1" sx={{ whiteSpace: "pre-line", my: 1 }}>{c.body}</Typography>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Tooltip title="Ta bort">
                    <IconButton
                      size="small"
                      onClick={async () => {
                        await del.mutateAsync({ id: c.id, subject_type: c.subject_type, subject_id: c.subject_id });
                        refresh();
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Button size="small" variant="contained" onClick={() => setReviewing(c)}>
                    Granska & svara
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <FlagIcon sx={{ color: "#ED6C02" }} />
        <Typography variant="h6">Hjälp begärd i lösningsskisser ({data.help_requests.length})</Typography>
      </Stack>
      {data.help_requests.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Inga skisser med hjälpflaggor.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {data.help_requests.map((h) => (
            <HelpRequestCard key={h.sketch_id} entry={h} onChanged={refresh} />
          ))}
        </Stack>
      )}

      {moduleOn("glossary") && (
      <>
      <Divider sx={{ my: 3 }} />

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <MenuBookIcon color="primary" />
        <Typography variant="h6">Ordlisteförfrågningar ({data.glossary_requests.length})</Typography>
      </Stack>
      {data.glossary_requests.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Inga väntande ordlisteförfrågningar.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {data.glossary_requests.map((r) => (
            <Card key={r.id} variant="outlined" sx={{ borderLeft: "4px solid #1976d2" }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <Typography variant="subtitle1" fontWeight={700}>{r.term}</Typography>
                  <Box flex={1} />
                  <Typography variant="caption" color="text.secondary">
                    {r.requested_by ?? "Okänd"} · {new Date(r.created_at).toLocaleString("sv-SE")}
                  </Typography>
                </Stack>
                {r.context && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {r.context}
                  </Typography>
                )}
                <Stack direction="row" justifyContent="flex-end" spacing={1}>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<BlockIcon />}
                    disabled={dismissRequest.isPending}
                    onClick={async () => {
                      await dismissRequest.mutateAsync(r.id);
                      refresh();
                    }}
                  >
                    Avvisa
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<CheckCircleOutlineIcon />}
                    onClick={() => setFulfilling(r)}
                  >
                    Lägg till i ordlistan
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      </>
      )}

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <DeleteForeverIcon color="error" />
        <Typography variant="h6">Borttagna objekt ({data.node_deletions.length})</Typography>
      </Stack>
      {data.node_deletions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Inga borttagna objekt.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {data.node_deletions.map((d) => (
            <NodeDeletionCard key={d.id} entry={d} />
          ))}
        </Stack>
      )}

      {fulfilling && (
        <FulfillDialog
          request={fulfilling}
          onClose={() => setFulfilling(null)}
          onSubmit={async (term, definition) => {
            await fulfillRequest.mutateAsync({ id: fulfilling.id, term, definition });
            refresh();
            setFulfilling(null);
          }}
        />
      )}

      {reviewing && (
        <ReviewDialog
          comment={reviewing}
          subjectLabel={subjectLabel(reviewing)}
          onClose={() => setReviewing(null)}
          onSubmit={async (status, reply) => {
            await review.mutateAsync({ id: reviewing.id, status, reply });
            refresh();
            setReviewing(null);
          }}
        />
      )}
    </Container>
  );
};

const HelpRequestCard: React.FC<{ entry: HelpRequestEntry; onChanged: () => void }> = ({ entry, onChanged }) => {
  const navigate = useNavigate();
  const { data: sketch } = useSolutionSketch(entry.sketch_id);
  const update = useUpdateSketch();

  const clearAll = async () => {
    if (!sketch) return;
    const next = { ...sketch.answers, help_requests: [] };
    await update.mutateAsync({ id: sketch.id, answers: next });
    onChanged();
  };

  const clearOne = async (field: string) => {
    if (!sketch) return;
    const next = {
      ...sketch.answers,
      help_requests: (sketch.answers.help_requests ?? []).filter((f) => f !== field),
    };
    await update.mutateAsync({ id: sketch.id, answers: next });
    onChanged();
  };

  return (
    <Card variant="outlined" sx={{ borderLeft: "4px solid #ED6C02" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
          <Typography variant="subtitle1" fontWeight={700}>{entry.sketch_title}</Typography>
          <Chip size="small" label={entry.sketch_status} variant="outlined" />
          <Box flex={1} />
          <Typography variant="caption" color="text.secondary">
            {entry.created_by} · {new Date(entry.updated_at).toLocaleString("sv-SE")}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {entry.fields.length} {entry.fields.length === 1 ? "flaggad fråga" : "flaggade frågor"}
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 1 }}>
          {entry.fields.map((f) => (
            <Stack key={f} direction="row" alignItems="center" spacing={1}>
              <Box sx={{ flex: 1, fontSize: 14 }}>{fieldLabel(f)}</Box>
              <Button size="small" variant="text" onClick={() => clearOne(f)} disabled={update.isPending}>
                Markera hanterad
              </Button>
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button size="small" startIcon={<DoneAllIcon />} onClick={clearAll} disabled={update.isPending}>
            Markera alla som hanterade
          </Button>
          <Button size="small" variant="contained" startIcon={<OpenInNewIcon />} onClick={() => navigate(`/solution-sketches/${entry.sketch_id}`)}>
            Öppna skissen
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

const ReviewDialog: React.FC<{
  comment: Comment;
  subjectLabel: string;
  onClose: () => void;
  onSubmit: (status: "approved" | "rejected", reply?: string) => Promise<void>;
}> = ({ comment, subjectLabel, onClose, onSubmit }) => {
  const [reply, setReply] = useState(comment.reply ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Granska kommentar</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Att godkänna eller avvisa stämplar att du läst kommentaren.
        </Alert>
        <Typography variant="caption" color="text.secondary">{subjectLabel}</Typography>
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, my: 1 }}>
          <Typography variant="caption" fontWeight={600}>{comment.created_by} · {new Date(comment.created_at).toLocaleString("sv-SE")}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.5 }}>{comment.body}</Typography>
        </Box>
        <TextField
          autoFocus fullWidth multiline minRows={3}
          label="Svar (valfritt)"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button color="error" disabled={saving} onClick={async () => { setSaving(true); try { await onSubmit("rejected", reply.trim() || undefined); } finally { setSaving(false); } }}>
          Avvisa
        </Button>
        <Button variant="contained" color="success" disabled={saving} onClick={async () => { setSaving(true); try { await onSubmit("approved", reply.trim() || undefined); } finally { setSaving(false); } }}>
          {saving ? "Sparar…" : "Godkänn"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const FulfillDialog: React.FC<{
  request: GlossaryRequestEntry;
  onClose: () => void;
  onSubmit: (term: string, definition: string) => Promise<void>;
}> = ({ request, onClose, onSubmit }) => {
  const [term, setTerm] = useState(request.term);
  const [definition, setDefinition] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lägg till i ordlistan</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Begrepp"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            fullWidth
            multiline
            rows={4}
            required
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !term.trim() || !definition.trim()}
          onClick={async () => {
            setSaving(true);
            try { await onSubmit(term.trim(), definition.trim()); }
            finally { setSaving(false); }
          }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Ett borttagningsmeddelande – med en KVITTERA-knapp.
 *
 * Kortet var det enda i inkorgen utan någon åtgärd alls: de andra fyra
 * avdelningarna bär en status som går att flytta, men det här är en ren logg.
 * Ärendet kunde alltså aldrig hanteras, och både rubrikens räknare och
 * klockan i toppraden stod kvar tända för gott – ett meddelande som inte
 * försvann och inte gick att hantera.
 *
 * Kvitteringen tar bort NOTISEN, inte spåret: själva borttagningen ligger
 * kvar i revisionsloggen med ögonblicksbild av objektet.
 */
const NodeDeletionCard: React.FC<{ entry: NodeDeletionEntry }> = ({ entry }) => {
  const color = (NODE_COLORS as Record<string, string>)[entry.node_type] ?? "#999";
  const dismiss = useDismissNodeDeletion();
  return (
    <Card variant="outlined" sx={{ borderLeft: "4px solid #d32f2f" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
          <Typography variant="subtitle1" fontWeight={700}>{entry.node_name}</Typography>
          <Chip size="small" label={entry.node_type} variant="outlined" sx={{ fontSize: 11, borderColor: color, color }} />
          <Box flex={1} />
          <Typography variant="caption" color="text.secondary">
            {entry.deleted_by} · {new Date(entry.deleted_at).toLocaleString("sv-SE")}
          </Typography>
          <Tooltip title="Ta bort meddelandet. Borttagningen finns kvar i revisionsloggen.">
            <span>
              <IconButton
                size="small"
                aria-label={`Ta bort meddelandet om ${entry.node_name}`}
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(entry.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
          {entry.reason}
        </Typography>
        {dismiss.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(dismiss.error as Error)?.message ?? "Kunde inte ta bort meddelandet"}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

const NODE_ROUTE: Record<string, string> = {
  Process: "/processes",
  Application: "/systems",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

/**
 * Ett ändringsförslag från vilken roll som helst. Objektet är orört – admin
 * gör ändringen i den bakomliggande listan (SharePoint, 2C8 …) för hand och
 * släcker sedan förslaget; då försvinner överstrykningen i detaljpanelen och
 * objektet visar det synken läser in. Båda stegen hamnar i ändringsloggen.
 */
const ChangeProposalCard: React.FC<{ proposal: ChangeProposal }> = ({ proposal: p }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resolve = useResolveChangeProposal();
  const [note, setNote] = useState("");
  const color = (NODE_COLORS as Record<string, string>)[p.node_type] ?? "#999";
  const alreadyInList = (p.current_value ?? "").trim() === p.new_value.trim();
  const route = NODE_ROUTE[p.node_type];
  const act = (outcome: "done" | "rejected") =>
    resolve.mutate({ id: p.id, nodeId: p.node_id, outcome, note: note.trim() || null });

  return (
    <Card variant="outlined" sx={{ borderLeft: "4px solid #1976d2" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5} flexWrap="wrap">
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
          <Typography variant="subtitle1" fontWeight={700}>{p.node_name}</Typography>
          <Chip size="small" label={t(`nodeTypes.${p.node_type}`)} variant="outlined" sx={{ fontSize: 11, borderColor: color, color }} />
          <Chip size="small" label={`Källa: ${t(`externalSource.${p.node_source}`, { defaultValue: p.node_source })}`} sx={{ fontSize: 11 }} />
          {route && (
            <Tooltip title="Öppna objektet">
              <IconButton size="small" onClick={() => navigate(`${route}?id=${p.node_id}`)}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box flex={1} />
          <Typography variant="caption" color="text.secondary">
            {p.proposed_by ?? "okänd"} · {new Date(p.created_at).toLocaleString("sv-SE")}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" mt={1}>
          {proposalFieldLabel(p.field, p.node_type, t)}
        </Typography>
        <Box sx={{ my: 0.5 }}>
          <Typography sx={{ color: "primary.main", fontWeight: 600, whiteSpace: "pre-wrap" }}>
            {p.new_value || <em>(tomt)</em>}
          </Typography>
          <Typography sx={{ color: "text.secondary", textDecoration: "line-through", whiteSpace: "pre-wrap" }}>
            {p.current_value || "—"}
          </Typography>
        </Box>
        {p.old_value !== p.current_value && !alreadyInList && (
          <Typography variant="caption" color="text.secondary" display="block">
            När förslaget lämnades stod det: {p.old_value || "—"}
          </Typography>
        )}
        {p.comment && (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", my: 1 }}>{p.comment}</Typography>
        )}
        {alreadyInList && (
          <Alert severity="success" sx={{ my: 1 }}>
            Listan visar redan det föreslagna värdet – förslaget kan släckas.
          </Alert>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} mt={1}>
          <TextField
            size="small" fullWidth
            placeholder="Anteckning till loggen (valfritt)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="small" color="inherit" disabled={resolve.isPending} onClick={() => act("rejected")} startIcon={<BlockIcon />}>
            Avslå
          </Button>
          <Tooltip title="Ändringen är gjord i den bakomliggande listan. Överstrykningen försvinner och objektet visar det som läses in från listan.">
            <span>
              <Button
                size="small" variant="contained" disabled={resolve.isPending}
                onClick={() => act("done")} startIcon={<CheckCircleOutlineIcon />}
                sx={{ whiteSpace: "nowrap" }}
              >
                Klart – släck
              </Button>
            </span>
          </Tooltip>
        </Stack>
        {resolve.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(resolve.error as Error)?.message ?? "Kunde inte uppdatera förslaget"}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Ett förslag till verksamhetskalendern från vilken roll som helst. Syns redan
 * i kalendern som förslag; redaktören fastställer eller avslår.
 */
const CalendarProposalCard: React.FC<{ event: CalendarEvent }> = ({ event: e }) => {
  const navigate = useNavigate();
  const resolve = useResolveCalendarEvent();
  const [note, setNote] = useState("");
  const act = (outcome: "approved" | "rejected") =>
    resolve.mutate({ id: e.id, outcome, note: note.trim() || null });
  const dependencies = [...e.nodes.map((n) => n.name), e.other_dependencies].filter(Boolean).join(", ");

  return (
    <Card variant="outlined" sx={{ borderLeft: "4px solid #2E7D32" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5} flexWrap="wrap">
          <Typography variant="subtitle1" fontWeight={700}>{e.title}</Typography>
          {e.change_freeze && <Chip size="small" color="error" icon={<LockIcon />} label="Verksamhetskritiskt" sx={{ fontSize: 11 }} />}
          <Tooltip title="Öppna kalendern">
            <IconButton size="small" onClick={() => navigate("/business-calendar")}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box flex={1} />
          <Typography variant="caption" color="text.secondary">
            {e.proposed_by ?? "okänd"} · {new Date(e.created_at).toLocaleString("sv-SE")}
          </Typography>
        </Stack>
        <Typography sx={{ color: "primary.main", fontWeight: 600 }}>
          {longRecurrenceLabel(e)} · {timeLabel(e)}
        </Typography>
        {e.description && (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", my: 1 }}>{e.description}</Typography>
        )}
        {dependencies && (
          <Typography variant="body2" color="text.secondary">Måste fungera: {dependencies}</Typography>
        )}
        {e.departments.length > 0 && (
          <Typography variant="body2" color="text.secondary">Berörd avdelning: {e.departments.join(", ")}</Typography>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} mt={1}>
          <TextField
            size="small" fullWidth
            placeholder="Anteckning till loggen (valfritt)"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
          />
          <Button size="small" color="inherit" disabled={resolve.isPending} onClick={() => act("rejected")} startIcon={<BlockIcon />}>
            Avslå
          </Button>
          <Button
            size="small" variant="contained" disabled={resolve.isPending}
            onClick={() => act("approved")} startIcon={<CheckCircleOutlineIcon />}
            sx={{ whiteSpace: "nowrap" }}
          >
            Fastställ
          </Button>
        </Stack>
        {resolve.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(resolve.error as Error)?.message ?? "Kunde inte uppdatera förslaget"}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default Notifications;
