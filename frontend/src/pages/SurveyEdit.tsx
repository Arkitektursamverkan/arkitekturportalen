import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RateReviewIcon from "@mui/icons-material/RateReview";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useNavigate, useParams } from "react-router-dom";
import {
  REPORT_SLOTS,
  useAddManualRecipient, useAssignResponseUser, useCloseSurvey, useDeleteResponse, useLaunchSurvey,
  useResolveRecipients, useSurvey, useSurveyResponses, useUpdateSurvey,
  type BranchRule, type MatchStatus, type Question, type QuestionType,
  type ReportCondition, type ReportDefinition, type ReportJoin, type ReportOp,
  type SurveyResponseSummary,
} from "@/api/surveys";
import { useUsers, type AppUser } from "@/api/users";
import { isValidLinkUrl } from "@/api/sharedLinks";
import { useNodes } from "@/api/nodes";
import type { NodeRead } from "@/types/graph";
import { useRoleStore } from "@/store/roleStore";
import TargetTypePicker, { NODE_TYPES, NODE_TYPE_LABEL } from "@/components/surveys/TargetTypePicker";
import SurveyPreviewDialog from "@/components/surveys/SurveyPreviewDialog";
import VariableTextField from "@/components/surveys/VariableTextField";
import { END_SURVEY } from "@/utils/surveyFlow";

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: "Fritext",
  yes_no: "Ja/Nej",
  multiple_choice: "Flerval",
  system_picker: "Applikationsval",
  rating: "Skala (betyg)",
  rating_matrix: "Graderingsmatris",
};

// Question types whose answer we can branch on. For multi-select
// multiple_choice a rule matches when the chosen answers CONTAIN the rule's
// option (first matching rule wins) — the flow walkers already treat list
// answers that way.
function isBranchable(q: Question): boolean {
  return q.type === "yes_no" || q.type === "rating" || q.type === "multiple_choice";
}

const MATCH_LABEL: Record<MatchStatus, string> = {
  matched: "Matchad",
  ambiguous: "Tvetydig",
  unmatched: "Omatchad",
  manual: "Manuellt vald",
  random: "Slumpvald",
};
const MATCH_COLOR: Record<MatchStatus, "success" | "warning" | "default" | "info"> = {
  matched: "success",
  ambiguous: "warning",
  unmatched: "default",
  manual: "info",
  random: "info",
};

/**
 * Recipient addresses for an Outlook paste, deduped case-insensitively: one
 * person often owns several applications and then has a row per application.
 * Rows with no confirmed person (unmatched) have no address to give.
 */
function uniqueRecipientEmails(rows: SurveyResponseSummary[]): string[] {
  const byLower = new Map<string, string>();
  for (const r of rows) {
    const email = r.assigned_user_email?.trim();
    if (email) byLower.set(email.toLowerCase(), email);
  }
  return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b, "sv"));
}

function newQuestionId(label: string): string {
  const slug = label.toLowerCase().trim().replace(/[^a-z0-9åäö]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `q_${slug || "fraga"}_${suffix}`;
}

const SurveyEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useRoleStore();
  const { data: survey, isLoading } = useSurvey(id);
  const { data: responses } = useSurveyResponses(id);
  const { data: users } = useUsers();
  const { data: targetTypeNodes } = useNodes();
  const updateSurvey = useUpdateSurvey();
  const resolveRecipients = useResolveRecipients(id ?? "");
  const assignUser = useAssignResponseUser(id ?? "");
  const addManualRecipient = useAddManualRecipient(id ?? "");
  const deleteResponse = useDeleteResponse(id ?? "");
  const launchSurvey = useLaunchSurvey();
  const closeSurvey = useCloseSurvey();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [targetNodeType, setTargetNodeType] = useState("Application");
  const [targetAttributeKey, setTargetAttributeKey] = useState("systemförvaltare");
  const [allowMultipleResponses, setAllowMultipleResponses] = useState(false);
  const [dueDate, setDueDate] = useState(""); // "" = inget bäst före-datum
  const [includeDecommissioned, setIncludeDecommissioned] = useState(false);
  const [answerUrl, setAnswerUrl] = useState(""); // "" = portalens formulär
  const [launchResult, setLaunchResult] = useState<{ launched: number; skipped_unassigned: number } | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [manualUser, setManualUser] = useState<AppUser | null>(null);
  const [manualNode, setManualNode] = useState<NodeRead | null>(null);
  const [confirmDeleteResponse, setConfirmDeleteResponse] = useState<{ id: string; label: string } | null>(null);
  const [emailListOpen, setEmailListOpen] = useState(false);
  const [emailCopyState, setEmailCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // Nothing pre-checked: after resolving recipients, the admin explicitly
  // picks who to launch to (one, a few, or "Välj alla" for everyone) rather
  // than having to uncheck a large pre-selected group.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Tracks which survey's data has already been loaded into the editable
  // local state above. Guarding on the id (not the `survey` object itself)
  // means a background refetch/invalidation for the SAME survey — e.g. the
  // one triggered right after a save — can't clobber in-progress edits the
  // user made in the meantime; only navigating to a different survey re-seeds.
  const [loadedSurveyId, setLoadedSurveyId] = useState<string | null>(null);

  useEffect(() => {
    if (survey && survey.id !== loadedSurveyId) {
      setTitle(survey.title);
      setDescription(survey.description);
      setQuestions(survey.questions);
      setReports(survey.reports ?? []);
      setTargetNodeType(survey.target_node_type);
      setTargetAttributeKey(survey.target_attribute_key);
      setAllowMultipleResponses(survey.allow_multiple_responses);
      setDueDate(survey.due_date ?? "");
      setIncludeDecommissioned(survey.include_decommissioned);
      setAnswerUrl(survey.answer_url ?? "");
      setLoadedSurveyId(survey.id);
    }
  }, [survey, loadedSurveyId]);

  const manualNodeOptions = useMemo(
    () =>
      (targetTypeNodes ?? [])
        .filter((n) => n.type === targetNodeType && !n.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [targetTypeNodes, targetNodeType],
  );

  // Address list for the "Kopiera e-postlista" dialog: the people who have
  // actually been sent the survey, i.e. any row past draft. Someone who was
  // resolved but deliberately left out when launching must not end up in a
  // mail-out about a survey they never got — nor must ambiguous/unmatched
  // rows, which have no person and therefore no address at all.
  // Stays above the loading guard below — every hook has to run on every render.
  const emailList = useMemo(
    () => uniqueRecipientEmails((responses ?? []).filter((r) => r.status !== "draft")),
    [responses],
  );
  // Resolved people with no launched row at all — reported in the dialog so
  // the omission is visible rather than silent.
  const notLaunchedCount = useMemo(
    () => uniqueRecipientEmails(responses ?? []).length - emailList.length,
    [responses, emailList],
  );
  // Semicolon-separated: what Outlook's To field expects.
  const emailListText = emailList.join("; ");

  const copyEmailList = async () => {
    try {
      await navigator.clipboard.writeText(emailListText);
      setEmailCopyState("copied");
    } catch {
      // Clipboard API is unavailable outside secure contexts — the text field
      // in the dialog is still there to copy from by hand.
      setEmailCopyState("failed");
    }
  };

  if (isLoading || !survey || !id) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  const isDraft = survey.status === "draft";
  // Random-system surveys have no recipient resolution or launch step —
  // response slots are created automatically when logged-in users are
  // offered a randomly picked system.
  const isRandom = survey.kind === "random_system";
  // Recipients can be added (manually, or via re-resolving) at any point
  // while the survey is open, not just before the first launch — so the
  // select/launch UI stays keyed on "is there anything to launch", not on
  // the survey still being in draft. Paused surveys don't distribute.
  const canLaunch = (survey.status === "draft" || survey.status === "open") && !isRandom;
  // Questions stay editable after a (partial) launch — they only lock once
  // someone has actually answered, so test-launching a recipient while still
  // refining the questions doesn't freeze them.
  const hasSubmittedResponses = (responses ?? []).some((r) => r.status === "submitted" || r.status === "reviewed");
  const canEditQuestions = !hasSubmittedResponses;
  const questionsChanged = JSON.stringify(questions) !== JSON.stringify(survey.questions);
  const metaChanged =
    title !== survey.title ||
    description !== survey.description ||
    targetNodeType !== survey.target_node_type ||
    targetAttributeKey !== survey.target_attribute_key ||
    allowMultipleResponses !== survey.allow_multiple_responses ||
    dueDate !== (survey.due_date ?? "") ||
    answerUrl.trim() !== (survey.answer_url ?? "") ||
    includeDecommissioned !== survey.include_decommissioned;
  const answerUrlInvalid = answerUrl.trim() !== "" && !isValidLinkUrl(answerUrl);

  const saveMeta = async () => {
    setSaveError(null);
    try {
      await updateSurvey.mutateAsync({
        id,
        title,
        description,
        allow_multiple_responses: allowMultipleResponses,
        due_date: dueDate || null,
        answer_url: answerUrl.trim() || null,
        include_decommissioned: includeDecommissioned,
        ...(isDraft ? { target_node_type: targetNodeType, target_attribute_key: targetAttributeKey } : {}),
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Kunde inte spara ändringarna");
    }
  };
  const saveQuestions = async () => {
    setSaveError(null);
    // Blank option/parameter rows are an editing convenience — never persist them.
    const cleaned = questions.map((q) => {
      if (q.type === "multiple_choice") {
        return {
          ...q,
          options: (q.options ?? []).map((o) => o.trim()).filter(Boolean),
          branches: q.branches?.map((r) =>
            typeof r.value === "string" ? { ...r, value: r.value.trim() } : r,
          ),
        };
      }
      if (q.type === "rating_matrix") {
        return { ...q, rows: (q.rows ?? []).map((r) => r.trim()).filter(Boolean) };
      }
      return q;
    });
    setQuestions(cleaned);
    try {
      await updateSurvey.mutateAsync({ id, questions: cleaned });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Kunde inte spara frågorna");
    }
  };

  // Report tags live on the questions and the definitions on the survey, so
  // saving report settings sends both. The backend allows this even after
  // answers have come in, as long as nothing but the tags changed.
  const reportsChanged =
    JSON.stringify(reports) !== JSON.stringify(survey.reports ?? []) ||
    JSON.stringify(questions.map((q) => q.reports ?? null)) !==
      JSON.stringify(survey.questions.map((q) => q.reports ?? null));

  const saveReports = async () => {
    setSaveError(null);
    // A slot with no name, no conditions and no tagged questions is one the
    // admin backed out of — don't persist it.
    const used = reports.filter(
      (r) =>
        r.name.trim() ||
        r.conditions.length > 0 ||
        questions.some((q) => (q.reports ?? []).includes(r.number)),
    ).map((r) => ({ ...r, name: r.name.trim() }));
    try {
      await updateSurvey.mutateAsync({ id, questions, reports: used });
      setReports(used);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Kunde inte spara rapportinställningarna");
    }
  };

  const updateReport = (number: number, patch: Partial<ReportDefinition>) => {
    setReports((rs) => {
      const existing = rs.find((r) => r.number === number);
      if (!existing) return [...rs, { number, name: "", conditions: [], anonymous: true, ...patch }];
      return rs.map((r) => (r.number === number ? { ...r, ...patch } : r));
    });
  };

  const toggleQuestionReport = (idx: number, slot: number) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== idx) return q;
        const current = q.reports ?? [];
        const next = current.includes(slot)
          ? current.filter((n) => n !== slot)
          : [...current, slot].sort((a, b) => a - b);
        return { ...q, reports: next };
      }),
    );
  };

  const addQuestion = () => {
    setQuestions((qs) => [
      ...qs,
      { id: newQuestionId("ny_fraga"), type: "text", label: "", required: false },
    ]);
  };
  const updateQuestion = (idx: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };
  const removeQuestion = (idx: number) => setQuestions((qs) => qs.filter((_, i) => i !== idx));
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((qs) => {
      const next = [...qs];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return qs;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const matched = (responses ?? []).filter((r) => r.match_status === "matched" || r.match_status === "manual").length;
  const ambiguous = (responses ?? []).filter((r) => r.match_status === "ambiguous").length;
  const unmatched = (responses ?? []).filter((r) => r.match_status === "unmatched").length;

  const isLaunchable = (r: { status: string; assigned_user_id: string | null }) =>
    r.status === "draft" && Boolean(r.assigned_user_id);
  const launchableRows = (responses ?? []).filter(isLaunchable);
  const selectedCount = launchableRows.filter((r) => selectedIds.has(r.id)).length;

  const toggleSelected = (responseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(responseId)) next.delete(responseId);
      else next.add(responseId);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(launchableRows.map((r) => r.id)));
  const selectNone = () => setSelectedIds(new Set());

  // Group launchable rows by recipient so the admin can pick a person and get
  // every system linked to them in one click — the reverse of picking systems
  // one by one.
  const recipientGroups = Object.values(
    launchableRows.reduce<Record<string, { userId: string; name: string; ids: string[] }>>((acc, r) => {
      const userId = r.assigned_user_id as string;
      if (!acc[userId]) {
        acc[userId] = { userId, name: r.assigned_user_name ?? "Okänd", ids: [] };
      }
      acc[userId].ids.push(r.id);
      return acc;
    }, {}),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const toggleRecipientGroup = (ids: string[]) => {
    const allSelected = ids.every((rid) => selectedIds.has(rid));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((rid) => (allSelected ? next.delete(rid) : next.add(rid)));
      return next;
    });
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{survey.title}</Typography>
            <Chip
              size="small"
              label={
                survey.status === "draft" ? "Utkast"
                : survey.status === "open" ? "Öppen"
                : survey.status === "paused" ? "Pausad"
                : "Stängd"
              }
              color={
                survey.status === "open" ? "success"
                : survey.status === "paused" ? "warning"
                : survey.status === "closed" ? "secondary"
                : "default"
              }
            />
            {survey.kind === "random_system" && (
              <Chip size="small" label="Slumpenkät" variant="outlined" color="info" />
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<VisibilityIcon />} onClick={() => setPreviewOpen(true)}>
            Förhandsgranska
          </Button>
          <Button startIcon={<RateReviewIcon />} onClick={() => navigate(`/surveys/${id}/review`)}>
            Granska svar
          </Button>
          {survey.status === "open" && (
            <Button
              color="warning"
              variant="outlined"
              disabled={updateSurvey.isPending}
              onClick={() => updateSurvey.mutateAsync({ id, status: "paused" })}
            >
              Pausa enkät
            </Button>
          )}
          {survey.status === "paused" && (
            <Button
              color="success"
              variant="outlined"
              disabled={updateSurvey.isPending}
              onClick={() => updateSurvey.mutateAsync({ id, status: "open" })}
            >
              Återuppta enkät
            </Button>
          )}
          {survey.status !== "closed" && (
            <Button color="warning" variant="outlined" onClick={() => closeSurvey.mutateAsync(id)}>
              Stäng enkät
            </Button>
          )}
        </Stack>
      </Stack>

      {saveError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Grunduppgifter</Typography>
        <Stack spacing={2}>
          <TextField label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Beskrivning" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          <TextField
            label="Besvaras senast"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            helperText="Valfritt bäst före-datum — visas för mottagarna. Enkäten stängs inte automatiskt."
            sx={{ maxWidth: 300 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Besvaras i en annan app (valfritt)"
            value={answerUrl}
            onChange={(e) => setAnswerUrl(e.target.value)}
            placeholder="https://… eller /…"
            error={answerUrlInvalid}
            helperText={answerUrlInvalid
              ? "Börja med https://, http:// eller / (en sida på samma server)"
              : "Adressen till en app som visar enkäten och skickar in svaren via portalens API. Mina enkäter öppnar den i stället för formuläret, som finns kvar som reserv. Tomt = formuläret."}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          {isRandom ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Slumpenkät: när enkäten är öppen erbjuds inloggade användare (i snitt var 3:e inloggning) att svara
              på frågorna om en slumpmässigt vald aktiv applikation. Samma användare får aldrig samma applikation två gånger.
            </Typography>
          ) : isDraft ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Enkäten skapar en svarsrad per objekt av vald typ — mottagaren besvarar enkäten en gång per objekt.
              </Typography>
              <TargetTypePicker
                nodeType={targetNodeType}
                attributeKey={targetAttributeKey}
                onChange={({ nodeType, attributeKey }) => { setTargetNodeType(nodeType); setTargetAttributeKey(attributeKey); }}
              />
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Riktar sig till attributet <strong>{survey.target_attribute_key}</strong> på noder av typen <strong>{survey.target_node_type}</strong>.
            </Typography>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={includeDecommissioned}
                onChange={(e) => setIncludeDecommissioned(e.target.checked)}
              />
            }
            label={
              isRandom
                ? "Ta med applikationer med status Avvecklat i slumpurvalet (annars kan de inte slumpas fram)"
                : "Ta med applikationer med status Avvecklat i urvalet (annars hoppas de över när mottagare hämtas)"
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={allowMultipleResponses}
                onChange={(e) => setAllowMultipleResponses(e.target.checked)}
              />
            }
            label="Tillåt flera svar per mottagare (kan svara om så länge enkäten är öppen, även efter granskning)"
          />
          {metaChanged && (
            <Box><Button variant="contained" onClick={saveMeta} disabled={!title.trim() || !targetAttributeKey.trim() || answerUrlInvalid}>Spara ändringar</Button></Box>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="h6">Frågor</Typography>
          {canEditQuestions && <Button startIcon={<AddIcon />} onClick={addQuestion}>Lägg till fråga</Button>}
        </Stack>
        {!canEditQuestions && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Frågor kan inte längre ändras eftersom svar redan har skickats in.
          </Alert>
        )}
        <Stack spacing={2}>
          {questions.map((q, idx) => (
            <QuestionRow
              key={q.id}
              question={q}
              allQuestions={questions}
              targetNodeType={targetNodeType}
              disabled={!canEditQuestions}
              onChange={(patch) => updateQuestion(idx, patch)}
              onToggleReport={(slot) => toggleQuestionReport(idx, slot)}
              onRemove={() => removeQuestion(idx)}
              onMoveUp={idx > 0 ? () => moveQuestion(idx, -1) : undefined}
              onMoveDown={idx < questions.length - 1 ? () => moveQuestion(idx, 1) : undefined}
            />
          ))}
          {questions.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Inga frågor ännu.</Typography>
          )}
        </Stack>
        {canEditQuestions && questionsChanged && (
          <Box sx={{ mt: 2 }}><Button variant="contained" onClick={saveQuestions}>Spara frågor</Button></Box>
        )}
      </Paper>

      <ReportSettings
        surveyId={id}
        questions={questions}
        reports={reports}
        changed={reportsChanged}
        onUpdateReport={updateReport}
        onSave={saveReports}
        onOpen={(slot) => navigate(`/surveys/${id}/reports/${slot}`)}
      />

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="h6">{isRandom ? "Slumpade svar" : "Mottagare"}</Typography>
          <Stack direction="row" spacing={1}>
            {!isRandom && (
              <>
                <Button onClick={() => resolveRecipients.mutateAsync()} disabled={resolveRecipients.isPending}>
                  {resolveRecipients.isPending ? "Resolverar…" : "Resolvera mottagare"}
                </Button>
                <Button onClick={() => { setManualUser(null); setManualNode(null); setManualDialogOpen(true); }}>
                  Lägg till mottagare manuellt
                </Button>
                <Button
                  startIcon={<ContentCopyIcon />}
                  disabled={emailList.length === 0 && notLaunchedCount === 0}
                  onClick={() => {
                    setEmailCopyState("idle");
                    setEmailListOpen(true);
                  }}
                >
                  Kopiera e-postlista
                </Button>
              </>
            )}
            {isRandom && isDraft && (
              <Button
                variant="contained"
                disabled={updateSurvey.isPending}
                onClick={() => updateSurvey.mutateAsync({ id, status: "open" })}
              >
                Öppna enkät
              </Button>
            )}
            {canLaunch && (
              <Button
                variant="contained"
                disabled={launchSurvey.isPending || selectedCount === 0}
                onClick={async () => setLaunchResult(await launchSurvey.mutateAsync({ surveyId: id, responseIds: Array.from(selectedIds) }))}
              >
                {launchSurvey.isPending
                  ? "Lanserar…"
                  : selectedCount === launchableRows.length && launchableRows.length > 1
                    ? `Lansera till hela gruppen (${selectedCount})`
                    : `Lansera till ${selectedCount} mottagare`}
              </Button>
            )}
          </Stack>
        </Stack>

        {launchResult && (
          <Alert severity={launchResult.skipped_unassigned > 0 ? "warning" : "success"} sx={{ mb: 2 }}>
            Enkäten lanserad: {launchResult.launched} mottagare fick enkäten.
            {launchResult.skipped_unassigned > 0 && ` ${launchResult.skipped_unassigned} av de valda saknade bekräftad mottagare och hoppades över.`}
          </Alert>
        )}

        {survey.status === "paused" && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {isRandom
              ? "Enkäten är pausad — inga nya användare erbjuds den vid inloggning, men redan utdelade enkäter kan fortfarande besvaras."
              : "Enkäten är pausad — lansering till fler mottagare är stoppad, men redan utskickade enkäter kan fortfarande besvaras."}
          </Alert>
        )}

        {isRandom && (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Svarsrader skapas automatiskt när inloggade användare erbjuds enkäten — här ser du vem som fått
            vilken applikation och vilka som har svarat.
          </Typography>
        )}

        {!isRandom && responses && responses.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
            <Chip size="small" color="success" label={`${matched} matchade`} />
            <Chip size="small" color="warning" label={`${ambiguous} tvetydiga`} />
            <Chip size="small" label={`${unmatched} omatchade`} />
            {canLaunch && launchableRows.length > 0 && (
              <>
                <Divider orientation="vertical" flexItem />
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>{selectedCount} av {launchableRows.length} valda att lansera till</Typography>
                <Button size="small" onClick={selectAll}>Välj alla</Button>
                <Button size="small" onClick={selectNone}>Välj inga</Button>
              </>
            )}
          </Stack>
        )}

        {canLaunch && recipientGroups.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>
              Välj per mottagare (bockar i alla dennes applikationer):
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {recipientGroups.map((g) => {
                const selectedInGroup = g.ids.filter((rid) => selectedIds.has(rid)).length;
                const fullySelected = selectedInGroup === g.ids.length;
                return (
                  <Chip
                    key={g.userId}
                    clickable
                    label={`${g.name} (${g.ids.length})`}
                    color={fullySelected ? "primary" : selectedInGroup > 0 ? "warning" : "default"}
                    variant={fullySelected ? "filled" : "outlined"}
                    onClick={() => toggleRecipientGroup(g.ids)}
                  />
                );
              })}
            </Stack>
          </Box>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {canLaunch && <TableCell padding="checkbox" />}
                <TableCell>Applikation</TableCell>
                <TableCell>Attributvärde</TableCell>
                <TableCell>Matchning</TableCell>
                <TableCell>Mottagare</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(responses ?? []).map((r) => (
                <TableRow key={r.id} selected={canLaunch && selectedIds.has(r.id)}>
                  {canLaunch && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedIds.has(r.id)}
                        disabled={!isLaunchable(r)}
                        onChange={() => toggleSelected(r.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>{r.node_name ?? <Typography variant="body2" sx={{ color: "text.secondary" }}>Inget objekt</Typography>}</TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: "text.secondary" }}>{r.raw_target_value ?? "—"}</Typography></TableCell>
                  <TableCell><Chip size="small" label={MATCH_LABEL[r.match_status]} color={MATCH_COLOR[r.match_status]} /></TableCell>
                  <TableCell>
                    {isAdmin && !isRandom ? (
                      <Autocomplete
                        size="small"
                        sx={{ minWidth: 220 }}
                        options={users ?? []}
                        getOptionLabel={(u) => `${u.name} (${u.email})`}
                        value={(users ?? []).find((u) => u.id === r.assigned_user_id) ?? null}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        onChange={(_, next) => next && assignUser.mutateAsync({ responseId: r.id, userId: next.id })}
                        renderInput={(params) => <TextField {...params} placeholder="Välj användare" />}
                      />
                    ) : (
                      <Typography variant="body2">{r.assigned_user_name ?? "—"}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Kopiera länk till mottagarens svar">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/s/${r.token}`)}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Ta bort mottagare">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setConfirmDeleteResponse({ id: r.id, label: r.node_name ?? r.assigned_user_name ?? "denna rad" })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {(responses ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={canLaunch ? 7 : 6} align="center" sx={{ py: 3, color: "text.secondary" }}>
                    {isRandom ? (
                      <>Inga svarsrader ännu — de skapas automatiskt när användare erbjuds enkäten vid inloggning.</>
                    ) : (
                      <>Inga mottagare resolverade ännu. Klicka på <strong>Resolvera mottagare</strong>.</>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <SurveyPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        description={description}
        questions={questions}
      />

      <Dialog open={manualDialogOpen} onClose={() => setManualDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Lägg till mottagare manuellt</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Koppla en person direkt till ett {NODE_TYPE_LABEL[targetNodeType as keyof typeof NODE_TYPE_LABEL]?.toLowerCase() ?? "objekt"} —
            t.ex. när det saknas ägare/förvaltare att matcha mot, eller den automatiska matchningen valde fel person.
            Väljer du inget objekt blir det ett generellt utskick utan objektkoppling.
          </Typography>
          <Stack spacing={2}>
            <Autocomplete
              options={manualNodeOptions}
              getOptionLabel={(n) => n.name}
              value={manualNode}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, next) => setManualNode(next)}
              renderInput={(params) => (
                <TextField {...params} autoFocus label={`Objekt (valfritt) — ${NODE_TYPE_LABEL[targetNodeType as keyof typeof NODE_TYPE_LABEL] ?? targetNodeType}`} placeholder="Sök objekt…" />
              )}
            />
            <Autocomplete
              options={users ?? []}
              getOptionLabel={(u) => `${u.name} (${u.email})`}
              value={manualUser}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, next) => setManualUser(next)}
              renderInput={(params) => <TextField {...params} label="Mottagare" placeholder="Välj användare" />}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualDialogOpen(false)}>Avbryt</Button>
          <Button
            variant="contained"
            disabled={!manualUser || addManualRecipient.isPending}
            onClick={async () => {
              if (!manualUser) return;
              await addManualRecipient.mutateAsync({ userId: manualUser.id, nodeId: manualNode?.id });
              setManualDialogOpen(false);
            }}
          >
            {addManualRecipient.isPending ? "Lägger till…" : "Lägg till"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDeleteResponse)} onClose={() => setConfirmDeleteResponse(null)}>
        <DialogTitle>Ta bort mottagare?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Tar bort raden för <strong>{confirmDeleteResponse?.label}</strong>, inklusive eventuellt redan inskickat svar. Åtgärden kan inte ångras.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteResponse(null)}>Avbryt</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteResponse.isPending}
            onClick={async () => {
              if (!confirmDeleteResponse) return;
              await deleteResponse.mutateAsync(confirmDeleteResponse.id);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(confirmDeleteResponse.id);
                return next;
              });
              setConfirmDeleteResponse(null);
            }}
          >
            Ta bort
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={emailListOpen} onClose={() => setEmailListOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>E-postadresser till mottagarna</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            {emailList.length === 1 ? "1 adress" : `${emailList.length} adresser`}, separerade med
            semikolon — klistra in rakt i Till-fältet i Outlook. Bara de som fått enkäten utskickad
            kommer med, och varje person listas en gång även om hen har flera applikationer.
          </Typography>

          {notLaunchedCount > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {notLaunchedCount === 1
                ? "1 resolverad mottagare har inte fått enkäten utskickad och är därför inte med."
                : `${notLaunchedCount} resolverade mottagare har inte fått enkäten utskickad och är därför inte med.`}
            </Alert>
          )}

          {emailList.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Enkäten är inte utskickad till någon ännu, så det finns inga adresser att kopiera.
              Lansera till mottagarna först.
            </Alert>
          )}

          <TextField
            multiline
            minRows={4}
            maxRows={12}
            fullWidth
            value={emailListText}
            onFocus={(e) => e.target.select()}
            slotProps={{ input: { readOnly: true } }}
          />

          {emailCopyState === "copied" && (
            <Alert severity="success" sx={{ mt: 2 }}>Listan är kopierad till urklipp.</Alert>
          )}
          {emailCopyState === "failed" && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Webbläsaren tillät inte kopiering automatiskt — markera texten ovan och kopiera med
              Ctrl+C i stället.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailListOpen(false)}>Stäng</Button>
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            disabled={emailList.length === 0}
            onClick={copyEmailList}
          >
            {emailCopyState === "copied" ? "Kopierat" : "Kopiera alla"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// Which comparisons make sense per question type. Free text and object
// pickers only support "är besvarad" — comparing them to a fixed value is
// never what an author means.
const REPORT_OPS_BY_TYPE: Record<QuestionType, ReportOp[]> = {
  yes_no: ["eq", "answered"],
  multiple_choice: ["eq", "answered"],
  rating: ["eq", "gte", "lte", "answered"],
  rating_matrix: ["answered"],
  text: ["answered"],
  system_picker: ["answered"],
};

const REPORT_OP_LABEL: Record<ReportOp, string> = {
  eq: "är",
  gte: "är minst",
  lte: "är högst",
  answered: "är besvarad",
};

const defaultConditionValue = (question: Question): unknown => {
  if (question.type === "yes_no") return true;
  if (question.type === "multiple_choice") return question.options?.find(Boolean) ?? "";
  if (question.type === "rating") return question.scale_min ?? 0;
  return null;
};

const REPORT_JOIN_LABEL: Record<ReportJoin, string> = { and: "OCH", or: "ELLER" };

const ReportConditionRow: React.FC<{
  condition: ReportCondition;
  questions: Question[];
  // The first condition has nothing to join to, so it shows no operator.
  first: boolean;
  onChange: (patch: Partial<ReportCondition>) => void;
  onRemove: () => void;
}> = ({ condition, questions, first, onChange, onRemove }) => {
  const question = questions.find((q) => q.id === condition.question_id);
  const ops = question ? REPORT_OPS_BY_TYPE[question.type] : ["answered" as ReportOp];
  const op = ops.includes(condition.op) ? condition.op : ops[0];

  const valueInput = () => {
    if (!question || op === "answered") return null;
    if (question.type === "yes_no") {
      return (
        <Select
          size="small"
          value={condition.value === true ? "yes" : "no"}
          onChange={(e) => onChange({ value: e.target.value === "yes" })}
          sx={{ minWidth: 100 }}
        >
          <MenuItem value="yes">Ja</MenuItem>
          <MenuItem value="no">Nej</MenuItem>
        </Select>
      );
    }
    if (question.type === "multiple_choice") {
      return (
        <Select
          size="small"
          value={(condition.value as string) ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
          sx={{ minWidth: 160 }}
        >
          {(question.options ?? []).filter(Boolean).map((opt) => (
            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
          ))}
        </Select>
      );
    }
    return (
      <TextField
        size="small"
        type="number"
        value={(condition.value as number) ?? 0}
        onChange={(e) => onChange({ value: Number(e.target.value) })}
        sx={{ width: 100 }}
      />
    );
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ width: 96 }}>
        {!first && (
          <Select
            size="small"
            fullWidth
            value={condition.join ?? "and"}
            onChange={(e) => onChange({ join: e.target.value as ReportJoin })}
          >
            {(["and", "or"] as ReportJoin[]).map((j) => (
              <MenuItem key={j} value={j}>{REPORT_JOIN_LABEL[j]}</MenuItem>
            ))}
          </Select>
        )}
      </Box>
      <Select
        size="small"
        value={condition.question_id}
        onChange={(e) => {
          const next = questions.find((q) => q.id === e.target.value);
          onChange({
            question_id: e.target.value,
            op: next ? REPORT_OPS_BY_TYPE[next.type][0] : "answered",
            value: next ? defaultConditionValue(next) : null,
          });
        }}
        sx={{ minWidth: 240, maxWidth: 360 }}
      >
        {questions.map((q) => (
          <MenuItem key={q.id} value={q.id}>{q.label || "(namnlös fråga)"}</MenuItem>
        ))}
      </Select>
      <Select
        size="small"
        value={op}
        onChange={(e) => onChange({ op: e.target.value as ReportOp })}
        sx={{ minWidth: 130 }}
      >
        {ops.map((o) => (
          <MenuItem key={o} value={o}>{REPORT_OP_LABEL[o]}</MenuItem>
        ))}
      </Select>
      {valueInput()}
      <IconButton size="small" color="error" onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};

const ReportSettings: React.FC<{
  surveyId: string;
  questions: Question[];
  reports: ReportDefinition[];
  changed: boolean;
  onUpdateReport: (number: number, patch: Partial<ReportDefinition>) => void;
  onSave: () => void;
  onOpen: (slot: number) => void;
}> = ({ questions, reports, changed, onUpdateReport, onSave, onOpen }) => {
  // A slot is shown once it has a definition or at least one tagged question,
  // so the panel doesn't open with five empty blocks.
  const activeSlots = REPORT_SLOTS.filter(
    (slot) =>
      reports.some((r) => r.number === slot) ||
      questions.some((q) => (q.reports ?? []).includes(slot)),
  );
  const nextFreeSlot = REPORT_SLOTS.find((slot) => !activeSlots.includes(slot));

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="h6">Rapporter</Typography>
        {nextFreeSlot && (
          <Button
            startIcon={<AddIcon />}
            onClick={() => onUpdateReport(nextFreeSlot, { name: "", conditions: [], anonymous: true })}
          >
            Lägg till rapport
          </Button>
        )}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Märk frågorna ovan med ett rapportnummer, och ge rapporten namn och urval här.
        Frågorna som urvalet bygger på tas alltid med i rapporten, även omärkta.
        Rapportinställningar går att ändra även efter att enkäten publicerats — till skillnad
        från frågorna själva.
      </Typography>

      {activeSlots.length === 0 && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Inga rapporter uppsatta. Frivilligt — en enkät fungerar lika bra utan.
        </Typography>
      )}

      <Stack spacing={2}>
        {activeSlots.map((slot) => {
          const definition = reports.find((r) => r.number === slot)
            ?? { number: slot, name: "", conditions: [], anonymous: true };
          // The report shows its condition questions too, tagged or not — mirror
          // that here so the list matches what the report actually contains.
          const conditionIds = new Set(definition.conditions.map((c) => c.question_id));
          const included = questions.filter(
            (q) => (q.reports ?? []).includes(slot) || conditionIds.has(q.id),
          );
          const setConditions = (conditions: ReportCondition[]) =>
            onUpdateReport(slot, { conditions });

          return (
            <Paper key={slot} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1 }}>
                <Chip size="small" color="primary" label={`Rapport ${slot}`} />
                <TextField
                  size="small"
                  label="Namn (valfritt)"
                  placeholder={`Rapport ${slot}`}
                  value={definition.name}
                  onChange={(e) => onUpdateReport(slot, { name: e.target.value })}
                  sx={{ flex: 1, maxWidth: 360 }}
                />
                <Button size="small" onClick={() => onOpen(slot)}>Öppna rapport</Button>
              </Stack>

              <Tooltip title="Objektet och svaren står kvar — namn och e-post på den som svarat tas bort ur rapporten, dess PDF och CSV.">
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={definition.anonymous ?? true}
                      onChange={(e) => onUpdateReport(slot, { anonymous: e.target.checked })}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Anonymisera — visa inte vem som svarat
                    </Typography>
                  }
                />
              </Tooltip>

              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                {included.length === 0
                  ? "Ingen fråga är märkt med den här rapporten ännu."
                  : `Frågor: ${included.map((q) => q.label || "(namnlös)").join(" · ")}`}
              </Typography>

              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Urval — ta bara med svar där villkoren stämmer. OCH binder starkare
                än ELLER, så "A OCH B ELLER C" betyder "(A OCH B) ELLER C".
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {definition.conditions.map((condition, idx) => (
                  <ReportConditionRow
                    key={idx}
                    condition={condition}
                    questions={questions}
                    first={idx === 0}
                    onChange={(patch) =>
                      setConditions(definition.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
                    }
                    onRemove={() =>
                      setConditions(definition.conditions.filter((_, i) => i !== idx))
                    }
                  />
                ))}
                {definition.conditions.length === 0 && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Inget villkor — samtliga inkomna svar tas med.
                  </Typography>
                )}
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    disabled={questions.length === 0}
                    onClick={() => {
                      const first = questions[0];
                      setConditions([
                        ...definition.conditions,
                        {
                          question_id: first.id,
                          op: REPORT_OPS_BY_TYPE[first.type][0],
                          value: defaultConditionValue(first),
                          join: "and",
                        },
                      ]);
                    }}
                  >
                    Lägg till villkor
                  </Button>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {changed && (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onSave}>Spara rapportinställningar</Button>
        </Box>
      )}
    </Paper>
  );
};

const QuestionRow: React.FC<{
  question: Question;
  allQuestions: Question[];
  targetNodeType: string;
  disabled: boolean;
  onChange: (patch: Partial<Question>) => void;
  onToggleReport: (slot: number) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}> = ({ question, allQuestions, targetNodeType, disabled, onChange, onToggleReport, onRemove, onMoveUp, onMoveDown }) => {
  const options = question.options ?? [];

  // Renaming an option follows through to branch rules pointing at it, so a
  // rule never silently loses its option mid-edit.
  const renameOption = (idx: number, next: string) => {
    const prev = options[idx];
    const nextOptions = options.map((o, i) => (i === idx ? next : o));
    const branches =
      question.branches && prev !== next
        ? question.branches.map((r) => (r.value === prev ? { ...r, value: next } : r))
        : question.branches;
    onChange({ options: nextOptions, branches });
  };

  const removeOption = (idx: number) => {
    const prev = options[idx];
    const nextOptions = options.filter((_, i) => i !== idx);
    // Drop rules for the removed option — unless a duplicate option with the
    // same text remains.
    const branches =
      question.branches && !nextOptions.includes(prev)
        ? question.branches.filter((r) => r.value !== prev)
        : question.branches;
    onChange({ options: nextOptions, branches });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
        <Stack sx={{ flex: 1 }} spacing={1.5}>
          <Stack direction="row" spacing={2}>
            <VariableTextField
              label="Fråga"
              value={question.label}
              targetNodeType={targetNodeType}
              disabled={disabled}
              onChange={(v) => onChange({ label: v })}
              fullWidth
              size="small"
            />
            <Select
              value={question.type}
              disabled={disabled}
              size="small"
              onChange={(e) => onChange({ type: e.target.value as QuestionType })}
              sx={{ minWidth: 160 }}
            >
              {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </Select>
          </Stack>

          <VariableTextField
            label="Hjälptext (valfri)"
            value={question.help_text ?? ""}
            targetNodeType={targetNodeType}
            disabled={disabled}
            onChange={(v) => onChange({ help_text: v || null })}
            fullWidth
            size="small"
          />

          {question.type === "multiple_choice" && (
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Alternativ — ett per rad
              </Typography>
              {options.map((opt, idx) => (
                <Stack key={idx} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={`Alternativ ${idx + 1}`}
                    value={opt}
                    disabled={disabled}
                    onChange={(e) => renameOption(idx, e.target.value)}
                  />
                  {!disabled && (
                    <IconButton size="small" color="error" onClick={() => removeOption(idx)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              ))}
              {options.length === 0 && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>Inga alternativ ännu.</Typography>
              )}
              {!disabled && (
                <Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => onChange({ options: [...options, ""] })}>
                    Lägg till alternativ
                  </Button>
                </Box>
              )}
            </Stack>
          )}

          {question.type === "rating_matrix" && (
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Parametrar att gradera — en per rad (t.ex. Användarvänlighet, Funktionalitet)
              </Typography>
              {(question.rows ?? []).map((row, idx) => (
                <Stack key={idx} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={`Parameter ${idx + 1}`}
                    value={row}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({ rows: (question.rows ?? []).map((r, i) => (i === idx ? e.target.value : r)) })
                    }
                  />
                  {!disabled && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => onChange({ rows: (question.rows ?? []).filter((_, i) => i !== idx) })}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              ))}
              {(question.rows ?? []).length === 0 && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>Inga parametrar ännu.</Typography>
              )}
              {!disabled && (
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => onChange({ rows: [...(question.rows ?? []), ""] })}
                  >
                    Lägg till parameter
                  </Button>
                </Box>
              )}
            </Stack>
          )}

          {(question.type === "rating" || question.type === "rating_matrix") && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Lägsta värde"
                  type="number"
                  value={question.scale_min ?? 0}
                  disabled={disabled}
                  onChange={(e) => onChange({ scale_min: Number(e.target.value) })}
                  size="small"
                  sx={{ width: 140 }}
                />
                <TextField
                  label="Högsta värde"
                  type="number"
                  value={question.scale_max ?? 10}
                  disabled={disabled}
                  onChange={(e) => onChange({ scale_max: Number(e.target.value) })}
                  size="small"
                  sx={{ width: 140 }}
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Etikett vid lägsta värde (valfri)"
                  value={question.scale_min_label ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ scale_min_label: e.target.value || null })}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Etikett vid högsta värde (valfri)"
                  value={question.scale_max_label ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ scale_max_label: e.target.value || null })}
                  size="small"
                  fullWidth
                />
              </Stack>
              {question.type === "rating" && (
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Symbol vid lägsta värde, t.ex. 😞 (valfri)"
                    value={question.scale_min_emoji ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChange({ scale_min_emoji: e.target.value || null })}
                    size="small"
                    sx={{ width: 260 }}
                  />
                  <TextField
                    label="Symbol vid högsta värde, t.ex. 😀 (valfri)"
                    value={question.scale_max_emoji ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChange({ scale_max_emoji: e.target.value || null })}
                    size="small"
                    sx={{ width: 260 }}
                  />
                </Stack>
              )}
            </Stack>
          )}

          {question.type === "system_picker" && (
            <FormControl size="small" fullWidth>
              <InputLabel>Begränsa till objekttyp (valfri)</InputLabel>
              <Select
                label="Begränsa till objekttyp (valfri)"
                value={question.node_type_filter ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ node_type_filter: e.target.value || null })}
              >
                <MenuItem value="">Alla typer</MenuItem>
                {NODE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{NODE_TYPE_LABEL[t]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Checkbox checked={question.required} disabled={disabled} onChange={(e) => onChange({ required: e.target.checked })} />}
              label="Obligatorisk"
            />
            {(question.type === "multiple_choice" || question.type === "system_picker") && (
              <FormControlLabel
                control={<Checkbox checked={Boolean(question.allow_multiple)} disabled={disabled} onChange={(e) => onChange({ allow_multiple: e.target.checked })} />}
                label="Tillåt flera val"
              />
            )}
          </Stack>

          {/* Deliberately not gated on `disabled`: which reports a question
              feeds is about reading the answers, not about what was asked,
              so it stays editable once the survey is collecting. */}
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Tooltip title="Svaren på den här frågan tas med i de rapporter du märker den med. Frivilligt, och kan ändras när som helst.">
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Ingår i rapport</Typography>
            </Tooltip>
            {REPORT_SLOTS.map((slot) => {
              const selected = (question.reports ?? []).includes(slot);
              return (
                <Chip
                  key={slot}
                  size="small"
                  label={slot}
                  color={selected ? "primary" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => onToggleReport(slot)}
                />
              );
            })}
          </Stack>

          {allQuestions.length > 1 && (
            <QuestionFlowEditor
              question={question}
              allQuestions={allQuestions}
              disabled={disabled}
              onChange={onChange}
            />
          )}
        </Stack>

        <Stack>
          {onMoveUp && !disabled && <IconButton size="small" onClick={onMoveUp}><ArrowUpwardIcon fontSize="small" /></IconButton>}
          {onMoveDown && !disabled && <IconButton size="small" onClick={onMoveDown}><ArrowDownwardIcon fontSize="small" /></IconButton>}
          {!disabled && <IconButton size="small" color="error" onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>}
        </Stack>
      </Stack>
    </Paper>
  );
};

const QuestionFlowEditor: React.FC<{
  question: Question;
  allQuestions: Question[];
  disabled: boolean;
  onChange: (patch: Partial<Question>) => void;
}> = ({ question, allQuestions, disabled, onChange }) => {
  const branchable = isBranchable(question);
  const rules = question.branches ?? [];
  const targets = allQuestions.filter((q) => q.id !== question.id);

  // MUI's Select doesn't support Fragment children — it walks props.children
  // directly to wire up click handling and the selected-value display, so
  // this must stay a flat array of MenuItem elements, not <>...</>.
  const gotoOptions = [
    ...targets.map((t) => (
      <MenuItem key={t.id} value={t.id}>{t.label || "(namnlös fråga)"}</MenuItem>
    )),
    <MenuItem key={END_SURVEY} value={END_SURVEY}>Avsluta enkäten</MenuItem>,
  ];

  const updateRule = (idx: number, patch: Partial<BranchRule>) => {
    onChange({ branches: rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  };
  const removeRule = (idx: number) => onChange({ branches: rules.filter((_, i) => i !== idx) });
  const addRule = () => {
    const defaultValue: BranchRule =
      question.type === "yes_no"
        ? { op: "eq", value: true, goto: targets[0]?.id ?? END_SURVEY }
        : question.type === "multiple_choice"
          ? { op: "eq", value: question.options?.find(Boolean) ?? "", goto: targets[0]?.id ?? END_SURVEY }
          : { op: "eq", value: question.scale_min ?? 0, goto: targets[0]?.id ?? END_SURVEY };
    onChange({ branches: [...rules, defaultValue] });
  };

  const renderValueInput = (rule: BranchRule, idx: number) => {
    if (question.type === "yes_no") {
      return (
        <Select
          size="small"
          value={rule.value === true ? "yes" : "no"}
          disabled={disabled}
          onChange={(e) => updateRule(idx, { value: e.target.value === "yes" })}
          sx={{ minWidth: 100 }}
        >
          <MenuItem value="yes">Ja</MenuItem>
          <MenuItem value="no">Nej</MenuItem>
        </Select>
      );
    }
    if (question.type === "multiple_choice") {
      return (
        <Select
          size="small"
          value={(rule.value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => updateRule(idx, { value: e.target.value })}
          sx={{ minWidth: 160 }}
        >
          {(question.options ?? []).filter(Boolean).map((opt) => (
            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
          ))}
        </Select>
      );
    }
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Select
          size="small"
          value={rule.op ?? "eq"}
          disabled={disabled}
          onChange={(e) => updateRule(idx, { op: e.target.value as BranchRule["op"] })}
          sx={{ minWidth: 90 }}
        >
          <MenuItem value="eq">=</MenuItem>
          <MenuItem value="gte">≥</MenuItem>
          <MenuItem value="lte">≤</MenuItem>
        </Select>
        <TextField
          size="small"
          type="number"
          value={(rule.value as number) ?? 0}
          disabled={disabled}
          onChange={(e) => updateRule(idx, { value: Number(e.target.value) })}
          sx={{ width: 90 }}
        />
      </Stack>
    );
  };

  return (
    <Box sx={{ pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
      {branchable && (
        <>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
            Förgrening: styr vilken fråga som visas härnäst utifrån svaret
            {rules.length > 1 ? " — första regeln som matchar används" : ""}
          </Typography>
          <Stack spacing={1} sx={{ mb: 1 }}>
            {rules.map((rule, idx) => (
              <Stack key={idx} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="body2">
                  {question.type === "multiple_choice" && question.allow_multiple
                    ? "Om svaret innehåller"
                    : "Om svar"}
                </Typography>
                {renderValueInput(rule, idx)}
                <Typography variant="body2">→</Typography>
                <Select
                  size="small"
                  value={rule.goto}
                  disabled={disabled}
                  onChange={(e) => updateRule(idx, { goto: e.target.value })}
                  sx={{ minWidth: 200 }}
                >
                  {gotoOptions}
                </Select>
                {!disabled && (
                  <IconButton size="small" color="error" onClick={() => removeRule(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            ))}
            {!disabled && (
              <Box>
                <Button size="small" startIcon={<AddIcon />} onClick={addRule} disabled={targets.length === 0}>
                  Lägg till förgreningsregel
                </Button>
              </Box>
            )}
          </Stack>
        </>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="body2">{rules.length > 0 ? "Övriga svar →" : "Efter denna fråga →"}</Typography>
        <Select
          size="small"
          value={question.default_goto ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ default_goto: e.target.value || null })}
          displayEmpty
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">(nästa fråga i ordningen)</MenuItem>
          {gotoOptions}
        </Select>
      </Stack>
    </Box>
  );
};

export default SurveyEdit;
