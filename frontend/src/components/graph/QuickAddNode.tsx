import React, { useMemo, useState } from "react";
import {
  Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Fab, Stack, Tab, Tabs, TextField,
  Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import HistoryIcon from "@mui/icons-material/History";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateNode, useNodes } from "@/api/nodes";
import { useCreateEdge } from "@/api/edges";
import { useRoleStore } from "@/store/roleStore";
import {
  NODE_COLORS,
  getValidTargetTypes,
  getValidSourceTypes,
  getValidEdgeTypes,
  DEFAULT_INTEGRATION_DIRECTION,
} from "@/config/graphConfig";
import type { EdgeType, IntegrationDirection, NodeRead, NodeType } from "@/types/graph";
import IntegrationDirectionSelect from "./IntegrationDirectionSelect";

const RECENT_KEY = "ea-recent-connections";
const RECENT_MAX = 10;

interface RecentConnection {
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  edgeType: EdgeType;
  direction: "anchorIsSource" | "anchorIsTarget";
}

function loadRecent(): RecentConnection[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(entry: RecentConnection) {
  const prev = loadRecent().filter((r) => r.nodeId !== entry.nodeId || r.edgeType !== entry.edgeType);
  localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...prev].slice(0, RECENT_MAX)));
}

interface ConnectionOption {
  nodeType: NodeType;
  edgeType: EdgeType;
  direction: "anchorIsSource" | "anchorIsTarget";
  label: string;
}

interface Props {
  anchorNodeId?: string;
  anchorNodeType?: NodeType;
  anchorNodeName?: string;
  /** If provided, only show options producing these edge types (filters to view-relevant connections) */
  allowedEdgeTypes?: EdgeType[];
}

const QuickAddNode: React.FC<Props> = ({ anchorNodeId, anchorNodeType, anchorNodeName, allowedEdgeTypes }) => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const { isEditor, serverAccess } = useRoleStore();
  const qc = useQueryClient();
  const createNode = useCreateNode();
  const createEdge = useCreateEdge();
  const { data: allNodes = [], isLoading: loadingNodes } = useNodes();

  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentConnection[]>([]);
  const [tab, setTab] = useState(0); // 0 = new, 1 = existing
  const [selectedOption, setSelectedOption] = useState<ConnectionOption | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingNode, setExistingNode] = useState<NodeRead | null>(null);
  const [integrationDirection, setIntegrationDirection] =
    useState<IntegrationDirection>(DEFAULT_INTEGRATION_DIRECTION);
  const [selectedRecents, setSelectedRecents] = useState<Set<number>>(new Set());

  // Build connection options: for each valid related type, determine the correct edge direction
  const options = useMemo<ConnectionOption[]>(() => {
    if (!anchorNodeType) return [];
    const result: ConnectionOption[] = [];
    const seen = new Set<string>();

    // Anchor as source → related node is target
    for (const tgt of getValidTargetTypes(anchorNodeType)) {
      for (const et of getValidEdgeTypes(anchorNodeType, tgt)) {
        const key = `${tgt}-${et}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          nodeType: tgt,
          edgeType: et,
          direction: "anchorIsSource",
          label: `${t(`nodeTypes.${tgt}`)} (${t(`edgeTypes.${et}`)})`,
        });
      }
    }

    // Anchor as target → related node is source
    for (const src of getValidSourceTypes(anchorNodeType)) {
      for (const et of getValidEdgeTypes(src, anchorNodeType)) {
        const key = `${src}-${et}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          nodeType: src,
          edgeType: et,
          direction: "anchorIsTarget",
          label: `${t(`nodeTypes.${src}`)} (${t(`edgeTypes.${et}`)})`,
        });
      }
    }

    // Servers can only be connected by those with edit access to Servrar.
    const permitted = serverAccess === "edit"
      ? result
      : result.filter((o) => o.nodeType !== "Server" && o.nodeType !== "ServerService");
    if (allowedEdgeTypes) {
      const allowed = new Set(allowedEdgeTypes);
      return permitted.filter((o) => allowed.has(o.edgeType));
    }
    return permitted;
  }, [anchorNodeType, allowedEdgeTypes, serverAccess, t]);

  // Filter existing nodes to match selected option type
  const existingOptions = useMemo(() => {
    if (!selectedOption) return [];
    return allNodes.filter((n) => n.type === selectedOption.nodeType && n.id !== anchorNodeId);
  }, [allNodes, selectedOption, anchorNodeId]);

  if (!isEditor || !anchorNodeId) return null;

  const handleOpen = () => {
    setRecents(loadRecent());
    setOpen(true);
    setTab(0);
    setSelectedOption(null);
    setName("");
    setDescription("");
    setExistingNode(null);
    setSelectedRecents(new Set());
    setIntegrationDirection(DEFAULT_INTEGRATION_DIRECTION);
  };

  const makeEdge = async (
    relatedNodeId: string,
    option: ConnectionOption,
    integrationDir?: IntegrationDirection,
  ) => {
    const sourceId = option.direction === "anchorIsSource" ? anchorNodeId : relatedNodeId;
    const targetId = option.direction === "anchorIsSource" ? relatedNodeId : anchorNodeId;
    await createEdge.mutateAsync({
      source_id: sourceId,
      target_id: targetId,
      type: option.edgeType,
      ...(option.edgeType === "INTEGRATES_WITH" && integrationDir
        ? { direction: integrationDir }
        : {}),
    });
  };

  const handleQuickRecent = async (recent: RecentConnection) => {
    try {
      const option: ConnectionOption = {
        nodeType: recent.nodeType,
        edgeType: recent.edgeType,
        direction: recent.direction,
        label: "",
      };
      await makeEdge(recent.nodeId, option);
      saveRecent(recent);
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("quickAdd.linked", { name: recent.nodeName }), { variant: "success" });
      setOpen(false);
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  const handleCreateNew = async (close: boolean) => {
    if (!selectedOption || !name.trim()) return;
    try {
      const node = await createNode.mutateAsync({
        type: selectedOption.nodeType,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await makeEdge(node.id, selectedOption, integrationDirection);
      saveRecent({ nodeId: node.id, nodeName: node.name, nodeType: node.type as NodeType, edgeType: selectedOption.edgeType, direction: selectedOption.direction });
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("quickAdd.success", { name: node.name, type: t(`nodeTypes.${node.type}`) }), { variant: "success" });
      if (close) {
        setOpen(false);
      } else {
        setRecents(loadRecent());
        setName("");
        setDescription("");
      }
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  const handleLinkExisting = async (close: boolean) => {
    if (!selectedOption || !existingNode) return;
    try {
      await makeEdge(existingNode.id, selectedOption, integrationDirection);
      saveRecent({ nodeId: existingNode.id, nodeName: existingNode.name, nodeType: existingNode.type as NodeType, edgeType: selectedOption.edgeType, direction: selectedOption.direction });
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("quickAdd.linked", { name: existingNode.name }), { variant: "success" });
      if (close) {
        setOpen(false);
      } else {
        setRecents(loadRecent());
        setExistingNode(null);
      }
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  const handleLinkSelectedRecents = async (close: boolean) => {
    const toLink = recents.filter((_, i) => selectedRecents.has(i));
    if (toLink.length === 0) return;
    try {
      await Promise.all(toLink.map((r) => makeEdge(r.nodeId, { nodeType: r.nodeType, edgeType: r.edgeType, direction: r.direction, label: "" })));
      toLink.forEach((r) => saveRecent(r));
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(
        toLink.length === 1
          ? t("quickAdd.linked", { name: toLink[0].nodeName })
          : t("quickAdd.linkedMultiple", { num: toLink.length }),
        { variant: "success" },
      );
      if (close) {
        setOpen(false);
      } else {
        setRecents(loadRecent());
        setSelectedRecents(new Set());
      }
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  const isPending = createNode.isPending || createEdge.isPending;
  // The far end of the pending edge — typed on the "new" tab, picked on "existing".
  const otherEndName = (tab === 0 ? name.trim() : existingNode?.name) || undefined;

  return (
    <>
      <Tooltip title={t("quickAdd.tooltip")} placement="left">
        <Fab
          color="primary"
          size="small"
          onClick={handleOpen}
          sx={{ position: "absolute", bottom: 80, right: 8, zIndex: 10 }}
        >
          <AddIcon />
        </Fab>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("quickAdd.title")}</DialogTitle>
        <DialogContent>
          {anchorNodeName && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              {t("quickAdd.subtitle", { name: anchorNodeName })}
            </Typography>
          )}

          {/* Recent connections */}
          {recents.length > 0 && (
            <>
              <Stack direction="row" alignItems="center" spacing={0.5} mb={1}>
                <HistoryIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Senaste kopplingarna
                </Typography>
              </Stack>
              <Stack spacing={0.25} mb={1}>
                {recents.map((r, i) => (
                  <Stack
                    key={i}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ cursor: "pointer", borderRadius: 1, px: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                    onClick={() => setSelectedRecents((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; })}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedRecents.has(i)}
                      disabled={createEdge.isPending}
                      onChange={() => {}}
                      sx={{ p: 0.25 }}
                    />
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[r.nodeType], flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{r.nodeName}</Typography>
                  </Stack>
                ))}
              </Stack>
              {selectedRecents.size > 0 && (
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleLinkSelectedRecents(false)}
                    disabled={createEdge.isPending}
                    startIcon={createEdge.isPending ? <CircularProgress size={14} color="inherit" /> : <LinkIcon />}
                  >
                    {t("quickAdd.linkSelected", { num: selectedRecents.size })}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleLinkSelectedRecents(true)}
                    disabled={createEdge.isPending}
                  >
                    {t("quickAdd.linkSelectedAndClose")}
                  </Button>
                </Stack>
              )}
              <Divider sx={{ mb: 2 }} />
            </>
          )}

          {/* Step 1: Pick connection type */}
          <Typography variant="subtitle2" mb={1}>{t("quickAdd.selectType")}</Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} mb={2}>
            {options.map((opt, i) => (
              <Chip
                key={i}
                label={opt.label}
                onClick={() => { setSelectedOption(opt); setExistingNode(null); }}
                variant={selectedOption === opt ? "filled" : "outlined"}
                sx={{
                  bgcolor: selectedOption === opt ? NODE_COLORS[opt.nodeType] : undefined,
                  color: selectedOption === opt ? "#fff" : undefined,
                  borderColor: NODE_COLORS[opt.nodeType],
                  "&:hover": { bgcolor: NODE_COLORS[opt.nodeType], color: "#fff", opacity: 0.85 },
                }}
              />
            ))}
          </Stack>

          {/* Step 2: New or existing */}
          {selectedOption && (
            <>
              <Divider sx={{ mb: 1.5 }} />
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab icon={<AddIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t("quickAdd.tabNew")} sx={{ textTransform: "none", minHeight: 40 }} />
                <Tab icon={<LinkIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t("quickAdd.tabExisting")} sx={{ textTransform: "none", minHeight: 40 }} />
              </Tabs>

              {tab === 0 && (
                <>
                  <TextField
                    fullWidth size="small" label={t("common.name")} required autoFocus
                    value={name} onChange={(e) => setName(e.target.value)}
                    sx={{ mb: 1.5 }}
                  />
                  <TextField
                    fullWidth size="small" label={t("common.description")} multiline minRows={2}
                    value={description} onChange={(e) => setDescription(e.target.value)}
                  />
                </>
              )}

              {tab === 1 && (
                <Autocomplete
                  options={existingOptions}
                  loading={loadingNodes}
                  value={existingNode}
                  onChange={(_, v) => setExistingNode(v)}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} key={option.id}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option.type], flexShrink: 0 }} />
                        <Box>
                          <Typography variant="body2">{option.name}</Typography>
                          {option.description && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 300, display: "block" }}>
                              {option.description}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t("quickAdd.searchExisting", { type: t(`nodeTypes.${selectedOption.nodeType}`) })}
                      size="small"
                      autoFocus
                    />
                  )}
                />
              )}

              {/* Direction — an integration runs one way, the other, or both */}
              {selectedOption.edgeType === "INTEGRATES_WITH" && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
                  <IntegrationDirectionSelect
                    variant="verbose"
                    value={integrationDirection}
                    onChange={setIntegrationDirection}
                    sourceName={
                      selectedOption.direction === "anchorIsSource" ? anchorNodeName : otherEndName
                    }
                    targetName={
                      selectedOption.direction === "anchorIsSource" ? otherEndName : anchorNodeName
                    }
                  />
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          {tab === 0 && (
            <>
              <Button
                variant="contained"
                onClick={() => handleCreateNew(false)}
                disabled={!selectedOption || !name.trim() || isPending}
                startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
              >
                {t("quickAdd.create")}
              </Button>
              <Button
                variant="outlined"
                onClick={() => handleCreateNew(true)}
                disabled={!selectedOption || !name.trim() || isPending}
              >
                {t("quickAdd.createAndClose")}
              </Button>
            </>
          )}
          {tab === 1 && (
            <>
              <Button
                variant="contained"
                onClick={() => handleLinkExisting(false)}
                disabled={!existingNode || isPending}
                startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
              >
                {t("quickAdd.link")}
              </Button>
              <Button
                variant="outlined"
                onClick={() => handleLinkExisting(true)}
                disabled={!existingNode || isPending}
              >
                {t("quickAdd.linkAndClose")}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default QuickAddNode;
