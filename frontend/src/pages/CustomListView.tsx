import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Link, List, ListItemButton, ListItemText, MenuItem, Stack, Table, TableBody, TableCell, TableRow, TextField,
  Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useNodePermissions } from "@/api/access";
import { useEdges } from "@/api/edges";
import { useCreateNode, useNodes, useUpdateNode } from "@/api/nodes";
import { usePublicOrgSettings } from "@/api/orgSettings";
import ListSearchBox from "@/components/common/ListSearchBox";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import { LIST_KEY, type CustomList, type ListField } from "@/config/domainLists";
import { useRoleStore } from "@/store/roleStore";
import type { NodeRead } from "@/types/graph";

/**
 * A list an admin added (config/domainLists.ts): its objects, their own fields
 * and what they are connected to. Objects can come from a sync; those are
 * maintained in the source, which writes over changes made here.
 */

const fieldText = (node: NodeRead, field: ListField): string => {
  const v = node.attributes?.[field.key];
  return v === null || v === undefined ? "" : String(v);
};

const INPUT_TYPES: Record<string, string> = { number: "number", date: "date", link: "url" };

interface FormProps {
  list: CustomList;
  node?: NodeRead;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const ObjectDialog: React.FC<FormProps> = ({ list, node, onClose, onSaved }) => {
  const { t } = useTranslation();
  const create = useCreateNode();
  const update = useUpdateNode();
  const [name, setName] = useState(node?.name ?? "");
  const [description, setDescription] = useState(node?.description ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(list.fields.map((f) => [f.key, node ? fieldText(node, f) : ""])),
  );
  const [failed, setFailed] = useState(false);

  const save = () => {
    // Attributes are replaced as a whole: what a sync or an older field wrote stays.
    const attributes: Record<string, unknown> = { ...(node?.attributes ?? {}), [LIST_KEY]: list.key };
    for (const f of list.fields) {
      if (values[f.key]) attributes[f.key] = f.type === "number" ? Number(values[f.key]) : values[f.key];
      else delete attributes[f.key];
    }
    const done = { onSuccess: (saved: NodeRead) => onSaved(saved.id), onError: () => setFailed(true) };
    if (node) update.mutate({ id: node.id, name, description: description || undefined, attributes }, done);
    else create.mutate({ type: "CustomObject", name, description: description || undefined, attributes }, done);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{node ? t("customList.editObject") : t("customList.newObject")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {failed && <Alert severity="error">{t("customList.saveError")}</Alert>}
          <TextField label={t("customList.name")} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <TextField
            label={t("customList.description")} value={description} multiline minRows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
          {list.fields.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              select={f.type === "choice"}
              type={INPUT_TYPES[f.type] ?? "text"}
              value={values[f.key] ?? ""}
              slotProps={f.type === "date" ? { inputLabel: { shrink: true } } : undefined}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              {f.type === "choice" && <MenuItem value="">–</MenuItem>}
              {f.type === "choice" && f.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </TextField>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!name.trim() || create.isPending || update.isPending} onClick={save}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const CustomListView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { listKey } = useParams();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const [searchText, setSearchText] = useState("");
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const isAdmin = useRoleStore((s) => s.isAdmin);
  const canCreate = useRoleStore((s) => s.isAdmin || s.typeAccess.CustomObject === "edit");

  const { data: org } = usePublicOrgSettings();
  const list = org?.domain_lists?.custom.find((c) => c.key === listKey && c.active);
  const { data: allNodes = [], isLoading } = useNodes();
  const { data: edges = [] } = useEdges();
  const { data: perms } = useNodePermissions(selectedId);

  const objects = useMemo(
    () => allNodes
      .filter((n) => n.type === "CustomObject" && n.attributes?.[LIST_KEY] === listKey)
      .sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [allNodes, listKey],
  );
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const selected = objects.find((o) => o.id === selectedId);
  const visible = objects.filter((o) => !searchText || o.name.toLowerCase().includes(searchText.toLowerCase()));
  const canEdit = isAdmin || Boolean(perms?.edit_object);

  const connected = useMemo(() => {
    if (!selected) return [];
    return edges.flatMap((e) => {
      const otherId = e.source_id === selected.id ? e.target_id : e.target_id === selected.id ? e.source_id : null;
      const other = otherId ? nodeById.get(otherId) : undefined;
      return other ? [other] : [];
    });
  }, [edges, nodeById, selected]);

  if (!list) return org ? <Box sx={{ p: 3 }}><Alert severity="info">{t("customList.notFound")}</Alert></Box> : <LoadingSpinner height="80vh" />;

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper", flexShrink: 0 }}>
        <Stack direction="row" sx={{ p: 2, borderBottom: 1, borderColor: "divider", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{list.name}</Typography>
          {canCreate && (
            <Tooltip title={t("customList.newObject")}>
              <IconButton size="small" aria-label={t("customList.newObject")} onClick={() => setDialog("new")}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        {isLoading ? (
          <LoadingSpinner height={200} />
        ) : objects.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", p: 2 }}>{t("customList.empty")}</Typography>
        ) : (
          <List dense>
            {visible.map((o) => (
              <ListItemButton key={o.id} selected={o.id === selectedId} onClick={() => setParams(selectObject(params, o.id))}>
                <ListItemText primary={o.name} slotProps={{ primary: { noWrap: true } }} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <ObjectPane nodeId={selected?.id} viewTabs={[{ value: "oversikt", label: t("objectContent.tabOverview") }]}>
        {() => (
          <Box sx={{ height: "100%", overflow: "auto", p: 3 }}>
            {!selected ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Typography sx={{ color: "text.secondary" }}>{t("customList.noSelection")}</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ maxWidth: 960 }}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="h5">{selected.name}</Typography>
                    {canEdit && (
                      <Tooltip title={t("customList.editObject")}>
                        <IconButton size="small" aria-label={t("customList.editObject")} onClick={() => setDialog("edit")}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  {selected.description && (
                    <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{selected.description}</Typography>
                  )}
                </Box>
                {list.fields.some((f) => fieldText(selected, f)) && (
                  <Card variant="outlined">
                    <CardContent>
                      <Table size="small">
                        <TableBody>
                          {list.fields.filter((f) => fieldText(selected, f)).map((f) => (
                            <TableRow key={f.key}>
                              <TableCell sx={{ width: 220, color: "text.secondary" }}>{f.label}</TableCell>
                              <TableCell>
                                {f.type === "link" && /^https?:\/\//i.test(fieldText(selected, f))
                                  ? <Link href={fieldText(selected, f)} target="_blank" rel="noopener noreferrer">{fieldText(selected, f)}</Link>
                                  : fieldText(selected, f)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                <Card variant="outlined">
                  <CardContent>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {t("customList.connections")} <Chip label={connected.length} size="small" sx={{ ml: 0.5 }} />
                      </Typography>
                      {canEdit && <Button size="small" onClick={() => navigate("/connections")}>{t("customList.connect")}</Button>}
                    </Stack>
                    {connected.length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("customList.noConnections")}</Typography>
                    ) : (
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {connected.map((n) => <Chip key={n.id} size="small" variant="outlined" label={n.name} />)}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            )}
          </Box>
        )}
      </ObjectPane>

      {dialog && (
        <ObjectDialog
          list={list}
          node={dialog === "edit" ? selected : undefined}
          onClose={() => setDialog(null)}
          onSaved={(id) => { setDialog(null); setParams(selectObject(params, id)); }}
        />
      )}
    </Box>
  );
};

export default CustomListView;
