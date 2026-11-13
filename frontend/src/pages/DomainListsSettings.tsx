import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { useNodes } from "@/api/nodes";
import { usePublicOrgSettings, useSaveDomainLists } from "@/api/orgSettings";
import {
  DOMAINS, LIST_KEY, OPTIONAL_LISTS, ownFieldKey, ownFieldsFor, slug,
  type CustomList, type DomainKey, type DomainLists, type ExtraField, type ListFieldType, type OwnFieldKind,
} from "@/config/domainLists";

/**
 * Administration → Listor: which lists this installation has. A switched-off
 * list is hidden for everyone but keeps its objects; nothing here is touched
 * by an upgrade, since it is stored in the installation's database.
 */

const FIELD_TYPES: ListFieldType[] = ["text", "number", "date", "choice", "link"];

const ListDialog: React.FC<{
  list: CustomList | null;
  takenKeys: string[];
  onClose: () => void;
  onSave: (list: CustomList) => void;
}> = ({ list, takenKeys, onClose, onSave }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CustomList>(
    list ?? { key: "", name: "", domain: "technology", active: true, fields: [] },
  );
  const setField = (i: number, patch: Partial<CustomList["fields"][number]>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));

  const save = () => {
    const fieldKeys: string[] = [];
    const fields = draft.fields.filter((f) => f.label.trim()).map((f) => {
      const key = f.key || slug(f.label, [...fieldKeys, LIST_KEY]);
      fieldKeys.push(key);
      return { ...f, key, label: f.label.trim() };
    });
    onSave({ ...draft, name: draft.name.trim(), key: draft.key || slug(draft.name, takenKeys), fields });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{list ? t("domainLists.editList") : t("domainLists.newList")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t("domainLists.listName")} value={draft.name} required autoFocus sx={{ flexGrow: 1 }}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <TextField
              select label={t("domainLists.domain")} value={draft.domain} sx={{ minWidth: 200 }}
              onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value as DomainKey }))}
            >
              {DOMAINS.map((d) => <MenuItem key={d.key} value={d.key}>{t(d.labelKey)}</MenuItem>)}
            </TextField>
          </Stack>
          <Typography variant="subtitle2">{t("domainLists.fields")}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: "4px !important" }}>{t("domainLists.fieldsHint")}</Typography>
          {draft.fields.map((f, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
              <TextField
                size="small" label={t("domainLists.fieldLabel")} value={f.label} sx={{ flexGrow: 1 }}
                onChange={(e) => setField(i, { label: e.target.value })}
              />
              <TextField
                size="small" select label={t("domainLists.fieldType")} value={f.type} sx={{ minWidth: 130 }}
                onChange={(e) => setField(i, { type: e.target.value as ListFieldType })}
              >
                {FIELD_TYPES.map((ft) => <MenuItem key={ft} value={ft}>{t(`domainLists.fieldTypes.${ft}`)}</MenuItem>)}
              </TextField>
              {f.type === "choice" && (
                <TextField
                  size="small" label={t("domainLists.fieldOptions")} sx={{ flexGrow: 1 }}
                  defaultValue={f.options.join(", ")}
                  onBlur={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                />
              )}
              <IconButton
                aria-label={t("domainLists.removeField")}
                onClick={() => setDraft((d) => ({ ...d, fields: d.fields.filter((_, k) => k !== i) }))}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button
              size="small" startIcon={<AddIcon />}
              onClick={() => setDraft((d) => ({ ...d, fields: [...d.fields, { key: "", label: "", type: "text", options: [] }] }))}
            >
              {t("domainLists.addField")}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!draft.name.trim()} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

/** The types own fields can sit on. An own list has its fields in its own definition. */
const OWN_FIELD_TARGETS: { kind: OwnFieldKind; titleKey: string; labelPrefix: string; types: string[] }[] = [
  {
    kind: "nodes", titleKey: "domainLists.ownFieldsObjects", labelPrefix: "nodeTypes",
    types: ["Process", "InformationObject", "InformationSource", "Application", "TechnologyComponent", "Server", "ServerService", "ArchitecturePrinciple"],
  },
  {
    kind: "edges", titleKey: "domainLists.ownFieldsConnections", labelPrefix: "edgeTypes",
    types: ["INTEGRATES_WITH", "USES", "SUPPORTS", "HANDLES", "REALIZES", "CONTAINS", "RUNS_ON"],
  },
];

const OwnFieldsDialog: React.FC<{
  typeLabel: string;
  fields: ExtraField[];
  onClose: () => void;
  onSave: (fields: ExtraField[]) => void;
}> = ({ typeLabel, fields, onClose, onSave }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ExtraField[]>(fields);
  const setField = (i: number, patch: Partial<ExtraField>) =>
    setDraft((d) => d.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const named = draft.filter((f) => f.label.trim());
  // A choice needs something to choose between, and two fields cannot share a name.
  const incomplete = named.some((f) => f.type === "choice" && f.options.length === 0)
    || new Set(named.map((f) => f.label.trim().toLowerCase())).size !== named.length;

  const save = () => {
    const keys = named.map((f) => f.key).filter(Boolean);
    onSave(named.map((f) => {
      // A field keeps its key when it is renamed: the values lie under it.
      const key = f.key || ownFieldKey(f.label, keys);
      if (!f.key) keys.push(key);
      return { key, label: f.label.trim(), type: f.type, options: f.type === "choice" ? f.options : [] };
    }));
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("domainLists.ownFieldsFor", { type: typeLabel })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {draft.map((f, i) => (
            <Stack key={i} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "flex-start" } }}>
              <TextField
                size="small" label={t("domainLists.fieldLabel")} value={f.label} sx={{ flexGrow: 1 }} autoFocus={!f.key && !f.label}
                onChange={(e) => setField(i, { label: e.target.value })}
              />
              <TextField
                size="small" select label={t("domainLists.fieldType")} value={f.type} sx={{ minWidth: 130 }}
                onChange={(e) => setField(i, { type: e.target.value as ExtraField["type"] })}
              >
                {(["text", "choice"] as const).map((ft) => <MenuItem key={ft} value={ft}>{t(`domainLists.ownFieldTypes.${ft}`)}</MenuItem>)}
              </TextField>
              {f.type === "choice" && (
                <TextField
                  size="small" label={t("domainLists.fieldOptions")} sx={{ flexGrow: 1 }}
                  helperText={t("domainLists.ownFieldsOptionsHint")}
                  defaultValue={f.options.join(", ")}
                  onChange={(e) => setField(i, {
                    options: [...new Set(e.target.value.split(",").map((o) => o.trim()).filter(Boolean))],
                  })}
                />
              )}
              <IconButton aria-label={t("domainLists.removeField")} onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button
              size="small" startIcon={<AddIcon />}
              onClick={() => setDraft((d) => [...d, { key: "", label: "", type: "text", options: [] }])}
            >
              {t("domainLists.addField")}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={incomplete} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

const DomainListsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { data: org } = usePublicOrgSettings();
  const { data: nodes = [] } = useNodes();
  const saveLists = useSaveDomainLists();
  const [lists, setLists] = useState<DomainLists>({ disabled: [], custom: [] });
  const [editing, setEditing] = useState<CustomList | "new" | null>(null);
  const [editingFields, setEditingFields] = useState<{ kind: OwnFieldKind; type: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (org?.domain_lists) setLists(org.domain_lists);
  }, [org?.domain_lists]);

  const save = (next: DomainLists) => {
    setError(null);
    saveLists.mutate(next, {
      onSuccess: (data) => setLists(data.domain_lists),
      onError: (e) => setError(
        isAxiosError(e) && typeof e.response?.data?.detail === "string" ? e.response.data.detail : t("domainLists.saveError"),
      ),
    });
  };
  const toggleBuiltin = (type: string, on: boolean) =>
    save({ ...lists, disabled: on ? lists.disabled.filter((d) => d !== type) : [...lists.disabled, type] });
  const putList = (list: CustomList) => {
    setEditing(null);
    const exists = lists.custom.some((c) => c.key === list.key);
    save({ ...lists, custom: exists ? lists.custom.map((c) => (c.key === list.key ? list : c)) : [...lists.custom, list] });
  };
  const putOwnFields = (kind: OwnFieldKind, type: string, fields: ExtraField[]) => {
    setEditingFields(null);
    const extra = lists.extra_fields ?? { nodes: {}, edges: {} };
    save({ ...lists, extra_fields: { ...extra, [kind]: { ...extra[kind], [type]: fields } } });
  };
  const countIn = (key: string) => nodes.filter((n) => n.type === "CustomObject" && n.attributes?.[LIST_KEY] === key).length;

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>{t("domainLists.title")}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>{t("domainLists.intro")}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t("domainLists.builtin")}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>{t("domainLists.builtinHint")}</Typography>
          <Stack>
            {OPTIONAL_LISTS.map((l) => (
              <FormControlLabel
                key={l.type}
                control={(
                  <Switch
                    checked={!lists.disabled.includes(l.type)} disabled={saveLists.isPending}
                    onChange={(e) => toggleBuiltin(l.type, e.target.checked)}
                  />
                )}
                label={`${t(l.labelKey)} (${t(DOMAINS.find((d) => d.key === l.domain)!.labelKey)})`}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t("domainLists.own")}</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing("new")}>{t("domainLists.newList")}</Button>
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>{t("domainLists.ownHint")}</Typography>
          {lists.custom.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("domainLists.noOwn")}</Typography>}
          <Stack spacing={0.5}>
            {lists.custom.map((c) => (
              <Stack key={c.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Switch
                  checked={c.active} disabled={saveLists.isPending}
                  slotProps={{ input: { "aria-label": c.name } }}
                  onChange={(e) => putList({ ...c, active: e.target.checked })}
                />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{c.name}</Typography>
                <Chip size="small" variant="outlined" label={t(DOMAINS.find((d) => d.key === c.domain)!.labelKey)} />
                <Tooltip title={t("domainLists.editList")}>
                  <IconButton size="small" aria-label={t("domainLists.editList")} onClick={() => setEditing(c)}><EditIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title={c.active && countIn(c.key) ? t("domainLists.removeHasObjects") : t("domainLists.removeList")}>
                  <span>
                    <IconButton
                      size="small" aria-label={t("domainLists.removeList")}
                      disabled={c.active && countIn(c.key) > 0}
                      onClick={() => save({ ...lists, custom: lists.custom.filter((x) => x.key !== c.key) })}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
          <Alert severity="info" sx={{ mt: 2 }}>{t("domainLists.syncHint")}</Alert>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t("domainLists.ownFields")}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>{t("domainLists.ownFieldsHint")}</Typography>
          {OWN_FIELD_TARGETS.map((group) => (
            <Box key={group.kind} sx={{ mt: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t(group.titleKey)}</Typography>
              <Stack spacing={0.5}>
                {group.types.filter((type) => !lists.disabled.includes(type)).map((type) => {
                  const label = t(`${group.labelPrefix}.${type}`);
                  const fields = ownFieldsFor(lists, group.kind, type);
                  return (
                    <Stack key={type} direction="row" spacing={1} sx={{ alignItems: "center", minHeight: 34 }}>
                      <Typography variant="body2" sx={{ width: 190, flexShrink: 0 }}>{label}</Typography>
                      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexGrow: 1, flexWrap: "wrap", minWidth: 0 }}>
                        {fields.length === 0 && (
                          <Typography variant="body2" sx={{ color: "text.disabled" }}>{t("domainLists.ownFieldsNone")}</Typography>
                        )}
                        {fields.map((f) => (
                          <Chip
                            key={f.key} size="small" variant="outlined"
                            label={f.type === "choice" ? `${f.label}: ${f.options.join(", ")}` : f.label}
                            sx={{ maxWidth: "100%" }}
                          />
                        ))}
                      </Stack>
                      <Tooltip title={t("domainLists.ownFieldsEdit")}>
                        <IconButton
                          size="small" aria-label={`${t("domainLists.ownFieldsEdit")}: ${label}`} disabled={saveLists.isPending}
                          onClick={() => setEditingFields({ kind: group.kind, type, label })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </CardContent>
      </Card>

      {editingFields && (
        <OwnFieldsDialog
          typeLabel={editingFields.label}
          fields={ownFieldsFor(lists, editingFields.kind, editingFields.type)}
          onClose={() => setEditingFields(null)}
          onSave={(fields) => putOwnFields(editingFields.kind, editingFields.type, fields)}
        />
      )}

      {editing && (
        <ListDialog
          list={editing === "new" ? null : editing}
          takenKeys={lists.custom.map((c) => c.key)}
          onClose={() => setEditing(null)}
          onSave={putList}
        />
      )}
    </Container>
  );
};

export default DomainListsSettings;
