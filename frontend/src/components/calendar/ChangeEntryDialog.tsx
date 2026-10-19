import React, { useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTranslation } from "react-i18next";
import {
  AFFECTED_SHARE_LABELS, APPROVAL_STATUS_LABELS, CHANGE_TYPE_LABELS, USER_IMPACT_LABELS,
  changeWhenLabel, useChangeConflicts, useDeleteChangeEntry, useSaveChangeEntry,
  type AffectedShare, type ApprovalStatus, type ChangeConflict, type ChangeEntry,
  type ChangeEntryInput, type ChangeType, type UserImpact,
} from "@/api/changeLog";
import { compactDate } from "@/api/calendar";
import { useDepartments } from "@/api/directory";
import { useNodes } from "@/api/nodes";
import { NODE_COLORS } from "@/config/graphConfig";
import { useRoleStore } from "@/store/roleStore";

const LINKABLE_TYPES = ["Application", "TechnologyComponent"];

const nodeColor = (type: string) => (NODE_COLORS as Record<string, string>)[type] ?? "#999";

const keysOf = <K extends string>(labels: Record<K, string>) => Object.keys(labels) as K[];

/** När verksamhetsposten pågår: "2 nov. 08:00–17:00" eller "28 dec. – 8 jan., heldag". */
const conflictWhen = (c: ChangeConflict): string => {
  const days = c.start_date === c.end_date ? compactDate(c.start_date) : `${compactDate(c.start_date)} – ${compactDate(c.end_date)}`;
  if (!c.start_time || !c.end_time) return `${days}, heldag`;
  return c.start_date === c.end_date
    ? `${days} ${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)}`
    : `${days}, ${c.start_time.slice(0, 5)} första dagen till ${c.end_time.slice(0, 5)} sista dagen`;
};

const ConflictList: React.FC<{ conflicts: ChangeConflict[] }> = ({ conflicts }) => (
  <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
    {conflicts.map((c) => (
      <li key={`${c.event_id}-${c.start_date}`}>
        <strong>{c.title}</strong> – {conflictWhen(c)}
        {c.change_freeze && (
          <Chip
            size="small" color="error" icon={<LockIcon />} label="Verksamhetskritiskt"
            sx={{ ml: 1, height: 20, fontSize: 11 }}
          />
        )}
        {c.shared_nodes.length > 0 && ` · är beroende av ${c.shared_nodes.join(", ")}`}
      </li>
    ))}
  </Stack>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    {children}
  </Box>
);

const emptyInput = (startsAt: string): ChangeEntryInput => ({
  title: "",
  starts_at: startsAt,
  ends_at: null,
  affected_share: "none",
  user_impact: "none",
  change_type: "normal",
  description: "",
  impact: "",
  risks: "",
  notify_departments: [],
  approval_status: "pending",
  approved_by: "",
  node_ids: [],
  conflict_override: false,
});

/**
 * En post i förändringsloggen: formulär för den som får skriva, läsvy för
 * övriga. Krockar förändringen med en fastställd verksamhetspost måste man
 * kryssa i att den genomförs ändå innan det går att spara.
 */
const ChangeEntryDialog: React.FC<{
  entry: ChangeEntry | null;
  /** "YYYY-MM-DDTHH:MM" för en ny post. */
  initialStart: string;
  canManage: boolean;
  onClose: () => void;
}> = ({ entry, initialStart, canManage, onClose }) => {
  const { t } = useTranslation();
  const userName = useRoleStore((s) => s.name);
  const save = useSaveChangeEntry();
  const remove = useDeleteChangeEntry();
  const { data: allNodes = [], isLoading: nodesLoading } = useNodes();
  const { data: departmentList } = useDepartments();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [form, setForm] = useState<ChangeEntryInput>(() =>
    entry
      ? {
          ...emptyInput(entry.starts_at.slice(0, 16)),
          ...entry,
          starts_at: entry.starts_at.slice(0, 16),
          ends_at: entry.ends_at?.slice(0, 16) ?? null,
          node_ids: entry.nodes.map((n) => n.id),
        }
      : emptyInput(initialStart),
  );
  const set = <K extends keyof ChangeEntryInput>(key: K, value: ChangeEntryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { data: conflicts = [] } = useChangeConflicts(form.starts_at, form.ends_at, form.node_ids);

  const nodeOptions = useMemo(
    () =>
      allNodes
        .filter((n) => LINKABLE_TYPES.includes(n.type) && (!n.archived || form.node_ids.includes(n.id)))
        .map((n) => ({ id: n.id, name: n.name, type: n.type as string }))
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "sv")),
    [allNodes, form.node_ids],
  );

  // Avdelningar att meddela: de som går att välja, plus redan sparade som dolts sedan dess.
  const departments = useMemo(() => {
    const names = (departmentList?.departments ?? []).map((d) => d.name);
    return [...names, ...form.notify_departments.filter((d) => !names.includes(d))];
  }, [departmentList, form.notify_departments]);
  const allNotified = departments.length > 0 && departments.every((d) => form.notify_departments.includes(d));

  if (!canManage && entry) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{entry.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {entry.conflicts.length > 0 && (
              <Alert severity="warning" icon={<WarningAmberIcon />}>
                Genomförs trots krock med verksamhetskalendern
                {entry.conflict_override_by && ` – valt av ${entry.conflict_override_by}`}:
                <ConflictList conflicts={entry.conflicts} />
              </Alert>
            )}
            <Field label="Datum och tid"><Typography>{changeWhenLabel(entry)}</Typography></Field>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Field label="Typ av förändring"><Typography>{CHANGE_TYPE_LABELS[entry.change_type]}</Typography></Field>
              <Field label="Antal personer som berörs"><Typography>{AFFECTED_SHARE_LABELS[entry.affected_share]}</Typography></Field>
              <Field label="Påverkan på användare"><Typography>{USER_IMPACT_LABELS[entry.user_impact]}</Typography></Field>
            </Stack>
            {entry.nodes.length > 0 && (
              <Field label="Berör">
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {entry.nodes.map((n) => (
                    <Chip key={n.id} size="small" variant="outlined" label={n.name} sx={{ borderColor: nodeColor(n.type), color: nodeColor(n.type) }} />
                  ))}
                </Stack>
              </Field>
            )}
            {entry.description && <Field label="Beskrivning"><Typography sx={{ whiteSpace: "pre-wrap" }}>{entry.description}</Typography></Field>}
            {entry.impact && <Field label="Påverkan"><Typography sx={{ whiteSpace: "pre-wrap" }}>{entry.impact}</Typography></Field>}
            {entry.risks && <Field label="Risker"><Typography sx={{ whiteSpace: "pre-wrap" }}>{entry.risks}</Typography></Field>}
            {entry.notify_departments.length > 0 && (
              <Field label="Följande bör meddelas">
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {entry.notify_departments.map((d) => <Chip key={d} size="small" label={d} />)}
                </Stack>
              </Field>
            )}
            <Field label="Status för godkännande">
              <Typography>
                {APPROVAL_STATUS_LABELS[entry.approval_status]}
                {entry.approved_by && ` · ${entry.approval_status === "approved" ? "godkänt av" : "hanterat av"} ${entry.approved_by}`}
              </Typography>
            </Field>
            <Typography variant="caption" color="text.secondary">
              Loggad av {entry.created_by ?? "okänd"} {new Date(entry.created_at).toLocaleDateString("sv-SE")}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Stäng</Button></DialogActions>
      </Dialog>
    );
  }

  const hasConflict = conflicts.length > 0;
  const problem =
    !form.title.trim() ? "Ange en rubrik"
    : !form.starts_at ? "Ange datum och tid"
    : form.ends_at && form.ends_at < form.starts_at ? "Sluttiden kan inte ligga före starttiden"
    : hasConflict && !form.conflict_override ? "Ta ställning till krocken med verksamhetskalendern"
    : null;

  const submit = () =>
    save.mutate(
      { ...form, id: entry?.id, title: form.title.trim(), ends_at: form.ends_at || null, conflict_override: hasConflict && form.conflict_override },
      { onSuccess: onClose },
    );

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{entry ? "Ändra förändring" : "Logga förändring"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Rubrik" required autoFocus fullWidth value={form.title}
            placeholder="T.ex. Uppgradering av Momentum"
            inputProps={{ maxLength: 255 }}
            onChange={(e) => set("title", e.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Datum och tid, start" type="datetime-local" required fullWidth
              InputLabelProps={{ shrink: true }} value={form.starts_at}
              onChange={(e) => set("starts_at", e.target.value)}
            />
            <TextField
              label="Datum och tid, slut (valfritt)" type="datetime-local" fullWidth
              InputLabelProps={{ shrink: true }} value={form.ends_at ?? ""}
              inputProps={{ min: form.starts_at }}
              onChange={(e) => set("ends_at", e.target.value || null)}
            />
          </Stack>

          {hasConflict && (
            <Alert severity={conflicts.some((c) => c.change_freeze) ? "error" : "warning"} icon={<WarningAmberIcon />}>
              Förändringen krockar med verksamhetskalendern:
              <ConflictList conflicts={conflicts} />
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Checkbox
                    checked={form.conflict_override}
                    onChange={(e) => set("conflict_override", e.target.checked)}
                  />
                }
                label={
                  conflicts.some((c) => c.change_freeze)
                    ? "Genomför ändå – jag bortser från den verksamhetskritiska aktiviteten"
                    : "Genomför ändå – jag bortser från verksamhetsaktiviteten"
                }
              />
            </Alert>
          )}

          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
            <TextField
              select label="Typ av förändring" value={form.change_type} sx={{ minWidth: 180 }}
              onChange={(e) => set("change_type", e.target.value as ChangeType)}
            >
              {keysOf(CHANGE_TYPE_LABELS).map((k) => <MenuItem key={k} value={k}>{CHANGE_TYPE_LABELS[k]}</MenuItem>)}
            </TextField>
            <Field label="Antal personer som berörs">
              <ToggleButtonGroup
                size="small" exclusive value={form.affected_share}
                onChange={(_e, v: AffectedShare | null) => v && set("affected_share", v)}
              >
                {keysOf(AFFECTED_SHARE_LABELS).map((k) => <ToggleButton key={k} value={k}>{AFFECTED_SHARE_LABELS[k]}</ToggleButton>)}
              </ToggleButtonGroup>
            </Field>
            <Field label="Påverkan på användare">
              <ToggleButtonGroup
                size="small" exclusive value={form.user_impact}
                onChange={(_e, v: UserImpact | null) => v && set("user_impact", v)}
              >
                {keysOf(USER_IMPACT_LABELS).map((k) => <ToggleButton key={k} value={k}>{USER_IMPACT_LABELS[k]}</ToggleButton>)}
              </ToggleButtonGroup>
            </Field>
          </Stack>

          <Autocomplete
            multiple
            loading={nodesLoading}
            options={nodeOptions}
            value={nodeOptions.filter((n) => form.node_ids.includes(n.id))}
            groupBy={(n) => t(`nodeTypes.${n.type}`)}
            getOptionLabel={(n) => n.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_e, value) => set("node_ids", value.map((n) => n.id))}
            renderTags={(value, getTagProps) =>
              value.map((n, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return (
                  <Chip
                    key={key} size="small" variant="outlined" label={n.name} {...tagProps}
                    sx={{ borderColor: nodeColor(n.type), color: nodeColor(n.type) }}
                  />
                );
              })
            }
            renderInput={(params) => <TextField {...params} label="Applikation och/eller teknikkomponent" />}
          />

          <TextField
            label="Beskrivning" fullWidth multiline minRows={2} value={form.description}
            placeholder="Vad ändras?"
            onChange={(e) => set("description", e.target.value)}
          />
          <TextField
            label="Påverkan" fullWidth multiline minRows={2} value={form.impact}
            placeholder="Vad märker användarna, och hur länge?"
            onChange={(e) => set("impact", e.target.value)}
          />
          <TextField
            label="Risker" fullWidth multiline minRows={2} value={form.risks}
            onChange={(e) => set("risks", e.target.value)}
          />

          <Box>
            <Typography variant="subtitle2">Följande bör meddelas</Typography>
            {departments.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Inga avdelningar att välja – hämta katalogen från Entra ID under Användare.
              </Typography>
            ) : (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allNotified}
                      indeterminate={!allNotified && form.notify_departments.length > 0}
                      onChange={(e) => set("notify_departments", e.target.checked ? departments : [])}
                    />
                  }
                  label={<strong>Alla</strong>}
                />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" } }}>
                  {departments.map((d) => (
                    <FormControlLabel
                      key={d}
                      control={
                        <Checkbox
                          size="small"
                          checked={form.notify_departments.includes(d)}
                          onChange={(e) =>
                            set(
                              "notify_departments",
                              e.target.checked
                                ? departments.filter((x) => x === d || form.notify_departments.includes(x))
                                : form.notify_departments.filter((x) => x !== d),
                            )
                          }
                        />
                      }
                      label={<Typography variant="body2">{d}</Typography>}
                    />
                  ))}
                </Box>
              </>
            )}
          </Box>

          <Divider />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select label="Status för godkännande" fullWidth value={form.approval_status}
              onChange={(e) => {
                const status = e.target.value as ApprovalStatus;
                // Den som godkänner är oftast den som sitter vid formuläret.
                setForm((f) => ({
                  ...f,
                  approval_status: status,
                  approved_by: status === "approved" && !f.approved_by ? userName : f.approved_by,
                }));
              }}
            >
              {keysOf(APPROVAL_STATUS_LABELS).map((k) => <MenuItem key={k} value={k}>{APPROVAL_STATUS_LABELS[k]}</MenuItem>)}
            </TextField>
            <TextField
              label="Godkänt av" fullWidth value={form.approved_by}
              inputProps={{ maxLength: 255 }}
              onChange={(e) => set("approved_by", e.target.value)}
            />
          </Stack>

          {(save.isError || remove.isError) && (
            <Alert severity="error">{((save.error ?? remove.error) as Error)?.message ?? "Kunde inte spara"}</Alert>
          )}
          {confirmRemove && entry && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" disabled={remove.isPending} onClick={() => remove.mutate(entry.id, { onSuccess: onClose })}>
                  Ta bort
                </Button>
              }
            >
              Ta bort posten ur förändringsloggen?
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {entry && !confirmRemove && <Button color="inherit" onClick={() => setConfirmRemove(true)}>Ta bort</Button>}
        <Box flex={1} />
        <Button onClick={onClose}>Avbryt</Button>
        <Tooltip title={problem ?? ""}>
          <span>
            <Button variant="contained" disabled={Boolean(problem) || save.isPending} onClick={submit}>
              {entry ? "Spara" : "Lägg till"}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default ChangeEntryDialog;
