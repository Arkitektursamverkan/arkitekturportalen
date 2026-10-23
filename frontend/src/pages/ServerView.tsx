import React, { useMemo, useState } from "react";
import {
  Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItemButton, ListItemText, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useCreateNode, useNodes } from "@/api/nodes";
import { useCreateEdge, useDeleteEdge, useEdges } from "@/api/edges";
import ListSearchBox from "@/components/common/ListSearchBox";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import { ATTR_FIELDS } from "@/config/graphConfig";
import { useGraphStore } from "@/store/graphStore";
import { useRoleStore } from "@/store/roleStore";
import type { EdgeRead, NodeRead, NodeType } from "@/types/graph";

const attr = (n: NodeRead, key: string): string =>
  typeof n.attributes?.[key] === "string" ? (n.attributes[key] as string).trim() : "";

/** What can be hung on a server, and where each kind opens. */
const HOSTED: { type: NodeType; route: string; titleKey: string; addKey: string; emptyKey: string; columns: string[] }[] = [
  {
    type: "TechnologyComponent", route: "/tech-components",
    titleKey: "serverView.components", addKey: "serverView.addComponents", emptyKey: "serverView.noComponents",
    columns: ["komponenttyp", "leverantör"],
  },
  {
    type: "ServerService", route: "/server-services",
    titleKey: "serverView.serverServices", addKey: "serverView.addServerServices", emptyKey: "serverView.noServerServices",
    columns: ["komponenttyp", "miljö"],
  },
  {
    type: "Application", route: "/systems",
    titleKey: "serverView.applications", addKey: "serverView.addApplications", emptyKey: "serverView.noApplications",
    columns: ["leverantör", "status"],
  },
];

const COLUMN_LABEL: Record<string, string> = {
  komponenttyp: "csvImport.columns.component_type",
  leverantör: "attributes.leverantör",
  status: "attributes.status",
  miljö: "attributes.miljö",
};

// ── New-server dialog ─────────────────────────────────────────────────────────

const NewServerDialog: React.FC<{ open: boolean; onClose: () => void; onCreated: (id: string) => void }> = ({ open, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const createNode = useCreateNode();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  const reset = () => { setName(""); setDescription(""); setAttrs({}); };

  const handleCreate = async () => {
    const attributes = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try {
      const node = await createNode.mutateAsync({
        type: "Server", name: name.trim(), description: description.trim() || undefined, attributes,
      });
      enqueueSnackbar(t("serverView.created", { name: node.name }), { variant: "success" });
      reset();
      onCreated(node.id);
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>{t("serverView.newServer")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label={t("serverView.name")} value={name} onChange={(e) => setName(e.target.value)}
            required autoFocus size="small" placeholder="t.ex. Larmserver" />
          <TextField label={t("serverView.description")} value={description} onChange={(e) => setDescription(e.target.value)}
            multiline minRows={2} size="small" />
          {ATTR_FIELDS.Server.map((f) => (
            <TextField key={f.key} label={t(f.labelKey)} size="small" value={attrs[f.key] ?? ""}
              onChange={(e) => setAttrs((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!name.trim() || createNode.isPending} onClick={handleCreate}>
          {t("serverView.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── What runs on the server, of one kind ─────────────────────────────────────

const HostedSection: React.FC<{
  server: NodeRead;
  spec: (typeof HOSTED)[number];
  candidates: NodeRead[];
  hosted: { node: NodeRead; edge: EdgeRead }[];
}> = ({ server, spec, candidates, hosted }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const isEditor = useRoleStore((s) => s.serverAccess === "edit");
  const createEdge = useCreateEdge();
  const deleteEdge = useDeleteEdge();
  // The picker only picks — each choice is saved at once and the box is cleared.
  const [inputValue, setInputValue] = useState("");

  const hostedIds = new Set(hosted.map((h) => h.node.id));
  const options = candidates.filter((n) => !hostedIds.has(n.id));

  const handleAdd = async (n: NodeRead | null) => {
    if (!n) return;
    setInputValue("");
    try {
      await createEdge.mutateAsync({ source_id: n.id, target_id: server.id, type: "RUNS_ON" });
      enqueueSnackbar(t("serverView.added", { name: n.name, server: server.name }), { variant: "success" });
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {t(spec.titleKey)} <Chip label={hosted.length} size="small" sx={{ ml: 0.5 }} />
        </Typography>

        {hosted.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: isEditor ? 2 : 0 }}>{t(spec.emptyKey)}</Typography>
        ) : (
          <Table size="small" sx={{ mb: isEditor ? 2 : 0 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t("serverView.name")}</TableCell>
                {spec.columns.map((c) => <TableCell key={c} sx={{ fontWeight: 600 }}>{t(COLUMN_LABEL[c])}</TableCell>)}
                {isEditor && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {hosted.map(({ node, edge }) => (
                <TableRow key={edge.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                      onClick={() => navigate(`${spec.route}?id=${node.id}`)}>
                      {node.name}
                    </Typography>
                  </TableCell>
                  {spec.columns.map((c) => (
                    <TableCell key={c}><Typography variant="body2" sx={{ color: "text.secondary" }}>{attr(node, c) || "—"}</Typography></TableCell>
                  ))}
                  {isEditor && (
                    <TableCell align="right" sx={{ width: 48 }}>
                      <Tooltip title={t("serverView.remove")}>
                        <IconButton size="small" onClick={() => deleteEdge.mutate(edge.id)} disabled={deleteEdge.isPending}>
                          <LinkOffIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {isEditor && (
          <Autocomplete
            size="small" fullWidth
            options={options} value={null} onChange={(_, v) => handleAdd(v)}
            inputValue={inputValue} onInputChange={(_, v, reason) => { if (reason !== "reset") setInputValue(v); }}
            getOptionLabel={(n) => n.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disabled={createEdge.isPending}
            renderInput={(params) => (
              <TextField {...params} placeholder={t(spec.addKey)}
                slotProps={{
                  ...params.slotProps,
                  input: { ...params.slotProps.input, startAdornment: <AddIcon fontSize="small" sx={{ color: "text.secondary", mr: 0.5 }} /> }
                }} />
            )}
          />
        )}
      </CardContent>
    </Card>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const ServerView: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const [searchText, setSearchText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const serverAccess = useRoleStore((s) => s.serverAccess);
  const isEditor = serverAccess === "edit";
  const selectNode = useGraphStore((s) => s.selectNode);

  const { data: allNodes = [], isLoading } = useNodes();
  const { data: edges = [] } = useEdges();

  const byName = (a: NodeRead, b: NodeRead) => a.name.localeCompare(b.name, "sv");
  const servers = useMemo(() => allNodes.filter((n) => n.type === "Server").sort(byName), [allNodes]);
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  // Everything that RUNS_ON each server, keyed by server id.
  const hostedByServer = useMemo(() => {
    const serverIds = new Set(servers.map((s) => s.id));
    const map = new Map<string, { node: NodeRead; edge: EdgeRead }[]>();
    for (const e of edges) {
      if (e.type !== "RUNS_ON" || !serverIds.has(e.target_id)) continue;
      const node = nodeById.get(e.source_id);
      if (!node) continue;
      const list = map.get(e.target_id) || [];
      list.push({ node, edge: e });
      map.set(e.target_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => byName(a.node, b.node));
    return map;
  }, [servers, edges, nodeById]);

  const selected = servers.find((s) => s.id === selectedId);
  const visibleServers = servers.filter((s) => !searchText || s.name.toLowerCase().includes(searchText.toLowerCase()));

  if (serverAccess === "none") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)", p: 3 }}>
        <Typography sx={{ color: "text.secondary" }}>{t("serverView.noAccess")}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("serverView.select")}</Typography>
          {isEditor && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>{t("serverView.newServer")}</Button>
          )}
        </Stack>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        {isLoading ? (
          <LoadingSpinner height={200} />
        ) : servers.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", p: 2 }}>{t("serverView.noServers")}</Typography>
        ) : (
          <List dense>
            {visibleServers.map((s) => {
              const count = hostedByServer.get(s.id)?.length ?? 0;
              return (
                <ListItemButton key={s.id} selected={s.id === selectedId} onClick={() => setParams(selectObject(params, s.id))}>
                  <ListItemText
                    primary={
                      <Stack
                        direction="row"
                        sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{s.name}</Typography>
                        {count > 0 && <Chip label={count} size="small" sx={{ height: 18, fontSize: 10, minWidth: 24, ml: 0.5 }} />}
                      </Stack>
                    }
                    secondary={[attr(s, "miljö"), attr(s, "servertyp")].filter(Boolean).join(" · ") || undefined}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>

      <ObjectPane nodeId={selected?.id} viewTabs={[{ value: "oversikt", label: t("objectContent.tabOverview") }]}>
        {() => (
          <Box sx={{ height: "100%", overflow: "auto", p: 3 }}>
            {!selected ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Typography sx={{ color: "text.secondary" }}>{t("serverView.noSelection")}</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ maxWidth: 960 }}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="h5">{selected.name}</Typography>
                    {isEditor && <Tooltip title={t("serverView.edit")}>
                      <IconButton size="small" onClick={() => selectNode({
                        id: selected.id, type: selected.type, name: selected.name, description: selected.description,
                        external_source: selected.external_source, archived: selected.archived, attributes: selected.attributes,
                      })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>}
                  </Stack>
                  {selected.description && (
                    <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{selected.description}</Typography>
                  )}
                  <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                    {ATTR_FIELDS.Server.filter((f) => attr(selected, f.key)).map((f) => (
                      <Chip key={f.key} size="small" variant="outlined" label={`${t(f.labelKey)}: ${attr(selected, f.key)}`} />
                    ))}
                  </Stack>
                </Box>

                {HOSTED.map((spec) => (
                  <HostedSection
                    key={`${selected.id}-${spec.type}`}
                    server={selected}
                    spec={spec}
                    candidates={allNodes.filter((n) => n.type === spec.type).sort(byName)}
                    hosted={(hostedByServer.get(selected.id) ?? []).filter((h) => h.node.type === spec.type)}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}
      </ObjectPane>

      <NewServerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => { setDialogOpen(false); setParams({ id }); }}
      />
    </Box>
  );
};

export default ServerView;
