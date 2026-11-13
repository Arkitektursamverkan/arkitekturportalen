import NodeCalendarSection from "@/components/calendar/NodeCalendarSection";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Divider, Drawer, FormControl,
  IconButton, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell,
  TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FlagIcon from "@mui/icons-material/Flag";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReplyIcon from "@mui/icons-material/Reply";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import type { FlagType, GraphNode, NodeRead as NodeReadType } from "@/types/graph";
import { LIST_KEY, isOwnField, listPath } from "@/config/domainLists";
import OwnFields from "@/components/common/OwnFields";
import { NODE_COLORS, ATTR_FIELDS, getValidEdgeTypes, getIntegrationDirection } from "@/config/graphConfig";
import IntegrationDirectionSelect from "./IntegrationDirectionSelect";
import { useGraphStore } from "@/store/graphStore";
import { useClearSelectionOnNavigate } from "@/store/useClearSelectionOnNavigate";
import { useRoleStore } from "@/store/roleStore";
import { useUpdateNode, useUpdateNodeFields, useDeleteNode, useNodes as useAllNodes } from "@/api/nodes";
import { useDeleteEdge, useEdges, useUpdateEdgeFields, useUpdateEdgeNote, useUpdateEdgeDirection } from "@/api/edges";
import { useNodeFlags, useCreateFlag, useDeleteFlag, useRespondToFlag } from "@/api/flags";
import {
  attrField, proposalFieldLabel, useCreateChangeProposals, useNodeChangeProposals,
  useResolveChangeProposal, useWithdrawChangeProposal, type ChangeProposal,
} from "@/api/changeProposals";
import LinkIcon from "@mui/icons-material/Link";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { useNodeContentSummary, useNodeDocuments, useNodeNotes } from "@/api/nodeContent";
import { useNodePermissions } from "@/api/access";

const PANEL_WIDTH = 320;

// The explorer page each object type opens in.
const EXPLORER_PATHS: Record<string, string> = {
  Process: "/processes",
  Application: "/systems",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

/** The page an object opens in; an object in an own list has its list's. */
const explorerPath = (type: string, attributes?: Record<string, unknown> | null): string | undefined =>
  type === "CustomObject" ? listPath(String(attributes?.[LIST_KEY])) : EXPLORER_PATHS[type];

const NodeDetailPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { selectedNode, selectedEdge, clearSelection, selectNode } = useGraphStore();
  const { isAdmin } = useRoleStore();
  // Going to another page closes the panel.
  useClearSelectionOnNavigate();
  // Whoever a grant lets edit the object — a förvaltare of one application
  // or process branch as much as a superuser — gets the edit and delete buttons.
  const { data: nodePerms } = useNodePermissions(selectedNode?.id);
  const canEditNode = isAdmin || Boolean(nodePerms?.edit_object);
  // An edge may be changed by whoever may edit either end (app/access.py).
  const { data: sourcePerms } = useNodePermissions(selectedEdge?.source);
  const { data: targetPerms } = useNodePermissions(selectedEdge?.target);
  const canEditEdge = isAdmin || Boolean(sourcePerms?.edit_object || targetPerms?.edit_object);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEdgeDelete, setConfirmEdgeDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const deleteNode = useDeleteNode();
  const deleteEdge = useDeleteEdge();

  // Reset edit mode when selection changes
  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setConfirmEdgeDelete(false);
    setDeleteReason("");
  }, [selectedNode?.id, selectedEdge?.id]);

  // Delete key triggers confirmation dialogs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (selectedEdge && canEditEdge) { setConfirmEdgeDelete(true); e.preventDefault(); }
      else if (selectedNode && canEditNode) { setConfirmDelete(true); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEdge, selectedNode, canEditEdge, canEditNode]);

  const open = Boolean(selectedNode || selectedEdge);

  const navigateToNode = (node: GraphNode, tab?: string) => {
    const path = explorerPath(node.type, node.attributes);
    if (path) navigate(`${path}?id=${node.id}${tab ? `&flik=${tab}` : ""}`);
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={clearSelection}
        variant="persistent"
        sx={{
          width: open ? PANEL_WIDTH : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: PANEL_WIDTH, boxSizing: "border-box", top: 64 },
        }}
      >
        <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="h6" sx={{ fontSize: 15 }}>
              {selectedNode ? t("common.type") : "Edge"}
            </Typography>
            <IconButton size="small" onClick={clearSelection}><CloseIcon fontSize="small" /></IconButton>
          </Stack>

          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              navigate={navigateToNode}
              t={t}
              isAdmin={canEditNode}
              isEditor={canEditNode}
              editing={editing}
              setEditing={setEditing}
              onUpdated={(updated) => selectNode(updated)}
              onRequestDelete={() => setConfirmDelete(true)}
            />
          )}
          {selectedEdge && <EdgeDetail edge={selectedEdge} t={t} isAdmin={canEditEdge} isEditor={canEditEdge} onRequestDelete={() => setConfirmEdgeDelete(true)} />}
        </Box>
      </Drawer>

      {/* Edge delete confirmation dialog */}
      {selectedEdge && (
        <Dialog open={confirmEdgeDelete} onClose={() => setConfirmEdgeDelete(false)}>
          <DialogTitle>{t("nodeDetail.deleteEdgeTitle")}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {t("nodeDetail.deleteEdgeBody", { type: t(`edgeTypes.${selectedEdge.type}`) })}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmEdgeDelete(false)}>{t("common.cancel")}</Button>
            <Button
              color="error"
              variant="contained"
              disabled={deleteEdge.isPending}
              onClick={() => {
                deleteEdge.mutate(selectedEdge.id, {
                  onSuccess: () => {
                    setConfirmEdgeDelete(false);
                    clearSelection();
                  },
                });
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Node delete confirmation dialog — rendered outside Drawer */}
      {selectedNode && (
        <Dialog open={confirmDelete} onClose={() => { setConfirmDelete(false); setDeleteReason(""); }} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ color: "error.main" }}>{t("nodeDetail.deleteTitle")}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Du håller på att ta bort objektet <strong>{selectedNode.name}</strong> ({t(`nodeTypes.${selectedNode.type}`)}) permanent.
              Detta tar bort objektet och <strong>alla dess kopplingnar</strong> — inte bara den valda kopplingen.
              Åtgärden kan inte ångras när du bekräftat.
            </DialogContentText>
            <AttachedContentWarning nodeId={selectedNode.id} open={confirmDelete} t={t} />
            <TextField
              autoFocus
              fullWidth
              required
              multiline
              minRows={2}
              size="small"
              label="Anledning till borttag (obligatorisk)"
              placeholder="Beskriv varför objektet tas bort…"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setConfirmDelete(false); setDeleteReason(""); }}>{t("common.cancel")}</Button>
            <Button
              color="error"
              variant="contained"
              disabled={deleteNode.isPending || !deleteReason.trim()}
              onClick={() => {
                deleteNode.mutate({ id: selectedNode.id, reason: deleteReason.trim() }, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    setDeleteReason("");
                    clearSelection();
                    setSearchParams({});
                  },
                });
              }}
            >
              {deleteNode.isPending ? "Tar bort…" : t("common.delete")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};

/* ── Node detail (view + edit) ────────────────────────────────────── */

interface NodeDetailProps {
  node: GraphNode;
  navigate: (n: GraphNode, tab?: string) => void;
  t: (k: string) => string;
  isAdmin: boolean;
  isEditor: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onUpdated: (node: GraphNode) => void;
  onRequestDelete: () => void;
}

const NodeDetail: React.FC<NodeDetailProps> = ({ node, navigate, t, isAdmin, isEditor, editing, setEditing, onUpdated, onRequestDelete }) => {
  const updateNode = useUpdateNode();
  const updateNodeFields = useUpdateNodeFields();
  const isSystemAdmin = useRoleStore((s) => s.isAdmin);
  const { data: allEdges = [] } = useEdges();
  const { data: allProcesses = [] } = useAllNodes({ node_type: "Process" });
  const connectionCount = allEdges.filter((e) => e.source_id === node.id || e.target_id === node.id).length;
  const { data: flags = [] } = useNodeFlags(node.id);
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? "");
  const [attrs, setAttrs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(node.attributes ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [parentId, setParentId] = useState<string | null>((node.attributes?.parent_id as string) ?? null);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  // Ändringsförslag: vilken roll som helst får pennan. Förslaget skriver inte
  // till objektet – det öppna förslaget visas ovanför det överstrukna värdet
  // tills admin gjort ändringen i den bakomliggande listan och släckt det.
  const { data: proposals = [] } = useNodeChangeProposals(node.id);
  const createProposals = useCreateChangeProposals();
  const { enqueueSnackbar } = useSnackbar();
  const [proposing, setProposing] = useState(false);
  const [proposalComment, setProposalComment] = useState("");
  const editable = editing || proposing;
  const pendingByField = useMemo(() => {
    const m = new Map<string, ChangeProposal[]>();
    for (const p of proposals) m.set(p.field, [...(m.get(p.field) ?? []), p]);
    return m;
  }, [proposals]);

  // Ett påbörjat förslag hör till det objekt det skrevs för.
  useEffect(() => {
    setProposing(false);
    setProposalComment("");
  }, [node.id]);

  // Sync local state when node changes
  useEffect(() => {
    setName(node.name);
    setDescription(node.description ?? "");
    setAttrs(Object.fromEntries(Object.entries(node.attributes ?? {}).map(([k, v]) => [k, String(v)])));
    setParentId((node.attributes?.parent_id as string) ?? null);
  }, [node]);

  const handleSave = () => {
    // The own fields save themselves (OwnFields); the form leaves them alone.
    const updatedAttrs: Record<string, unknown> = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => !isOwnField(k)),
    );
    if (node.type === "Process") {
      if (parentId) {
        updatedAttrs.parent_id = parentId;
      } else {
        delete updatedAttrs.parent_id;
      }
    }
    updateNode.mutate(
      { id: node.id, name, description: description || null, attributes: updatedAttrs },
      {
        onSuccess: (saved) => {
          setEditing(false);
          onUpdated(saved);
        },
      },
    );
  };

  const initialAttrs = () =>
    Object.fromEntries(Object.entries(node.attributes ?? {}).map(([k, v]) => [k, String(v)]));

  const handleSubmitProposal = () => {
    const before = initialAttrs();
    const changes: { field: string; new_value: string }[] = [];
    if (name.trim() !== node.name.trim()) changes.push({ field: "name", new_value: name });
    if (description.trim() !== (node.description ?? "").trim()) changes.push({ field: "description", new_value: description });
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "parent_id") continue;
      if ((v ?? "").trim() !== (before[k] ?? "").trim()) changes.push({ field: attrField(k), new_value: v });
    }
    if (changes.length === 0) {
      enqueueSnackbar("Du har inte ändrat något fält", { variant: "info" });
      return;
    }
    createProposals.mutate(
      { nodeId: node.id, changes, comment: proposalComment.trim() || null },
      {
        onSuccess: (created) => {
          enqueueSnackbar(
            `${created.length === 1 ? "Förslaget" : `${created.length} förslag`} skickat till administratören`,
            { variant: "success" },
          );
          handleCancel();
        },
        onError: () => enqueueSnackbar("Kunde inte skicka förslaget", { variant: "error" }),
      },
    );
  };

  const handleCancel = () => {
    setProposing(false);
    setProposalComment("");
    setName(node.name);
    setDescription(node.description ?? "");
    setAttrs(Object.fromEntries(Object.entries(node.attributes ?? {}).map(([k, v]) => [k, String(v)])));
    setParentId((node.attributes?.parent_id as string) ?? null);
    setEditing(false);
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: NODE_COLORS[node.type] }} />
        <Chip label={t(`nodeTypes.${node.type}`)} size="small" />
        <Box sx={{ flex: 1 }} />
        {!editable && (
          <Tooltip title="Föreslå ändring">
            <IconButton size="small" color="primary" onClick={() => setProposing(true)} aria-label="Föreslå ändring">
              <EditNoteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {isEditor && !editable && (
          <IconButton size="small" onClick={() => setEditing(true)} title={t("nodeDetail.edit")}>
            <EditIcon fontSize="small" />
          </IconButton>
        )}
        {isAdmin && !editable && (
          <IconButton size="small" onClick={onRequestDelete} color="error" title={t("common.delete")}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
        {!editable && (
          <Tooltip title={t("flags.addFlag")}>
            <IconButton size="small" onClick={() => setFlagDialogOpen(true)} color="warning">
              <FlagIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {editing && (
          <>
            <IconButton size="small" onClick={handleSave} color="primary" disabled={updateNode.isPending} title={t("common.save")}>
              <SaveIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={handleCancel} title={t("common.cancel")}>
              <CancelIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Stack>

      {proposing && (
        <Typography variant="caption" color="primary" sx={{ display: "block", mb: 1 }}>
          Ändra de fält som ska vara annorlunda. Förslaget går till administratören,
          som gör ändringen i den bakomliggande listan.
        </Typography>
      )}

      {editable ? (
        <TextField
          fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)}
          label={t("common.name")} sx={{ mb: 1 }}
        />
      ) : (
        <Box sx={{ mb: 0.5 }}>
          <ProposedValue proposals={pendingByField.get("name")} current={node.name} fontSize={16} fontWeight={700} />
        </Box>
      )}

      {editable ? (
        <TextField
          fullWidth size="small" multiline minRows={2} value={description}
          onChange={(e) => setDescription(e.target.value)}
          label={t("common.description")} sx={{ mb: 1 }}
        />
      ) : pendingByField.has("description") ? (
        <Box sx={{ mb: 1 }}>
          <ProposedValue proposals={pendingByField.get("description")} current={node.description} fontSize={14} />
        </Box>
      ) : (
        node.description && (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>{node.description}</Typography>
        )
      )}

      <Divider sx={{ my: 1 }} />
      <Table size="small">
        <TableBody>
          <TableRow>
            <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: "text.secondary", fontSize: 12 }}>
              {t("common.source")}
            </TableCell>
            <TableCell sx={{ border: 0, py: 0.5, fontSize: 12 }}>
              {t(`externalSource.${node.external_source}`)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: "text.secondary", fontSize: 12 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <LinkIcon sx={{ fontSize: 14 }} />
                <span>{t("nodeDetail.connections")}</span>
              </Stack>
            </TableCell>
            <TableCell sx={{ border: 0, py: 0.5, fontSize: 12 }}>
              {connectionCount}
            </TableCell>
          </TableRow>
          {(() => {
            const definedFields = ATTR_FIELDS[node.type as keyof typeof ATTR_FIELDS] ?? [];
            const definedKeys = new Set(definedFields.map((f) => f.key));
            // Show defined fields first (always), then any extra stored attrs
            const extraKeys = Object.keys(attrs).filter(
              (k) => k !== "parent_id" && k !== LIST_KEY && !definedKeys.has(k) && !isOwnField(k),
            );
            // Ett förslag på ett fält objektet ännu saknar ska också synas.
            for (const f of pendingByField.keys()) {
              const k = f.startsWith("attributes.") ? f.slice("attributes.".length) : null;
              if (k && !definedKeys.has(k) && !extraKeys.includes(k)) extraKeys.push(k);
            }
            const allFields = [
              ...definedFields.map((f) => ({ key: f.key, label: t(f.labelKey) })),
              ...extraKeys.map((k) => {
                const attrKey = `attributes.${k.toLowerCase()}`;
                const translated = t(attrKey);
                return { key: k, label: translated !== attrKey ? translated : k };
              }),
            ];
            return allFields.map(({ key: k, label }) => (
              <TableRow key={k}>
                <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: "text.secondary", fontSize: 12 }}>{label}</TableCell>
                <TableCell sx={{ border: 0, py: 0.5, fontSize: 12 }}>
                  {editable ? (
                    <TextField
                      fullWidth variant="standard" size="small" value={attrs[k] ?? ""}
                      onChange={(e) => setAttrs((prev) => ({ ...prev, [k]: e.target.value }))}
                      slotProps={{ htmlInput: { style: { fontSize: 12, padding: 0 } } }}
                    />
                  ) : pendingByField.has(attrField(k)) ? (
                    <ProposedValue proposals={pendingByField.get(attrField(k))} current={attrs[k]} fontSize={12} />
                  ) : (
                    attrs[k] ? String(attrs[k]) : <Typography component="span" sx={{ fontSize: 12, color: "text.disabled" }}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            ));
          })()}
        </TableBody>
      </Table>
      {node.type !== "CustomObject" && (
        <OwnFields
          kind="nodes" type={node.type} ownerId={node.id} attributes={node.attributes}
          canEdit={isEditor} isAdmin={isSystemAdmin}
          onSave={(values) => updateNodeFields.mutateAsync({ id: node.id, values })}
        />
      )}
      {proposing && (
        <Box sx={{ mt: 1.5 }}>
          <TextField
            fullWidth size="small" multiline minRows={2}
            label="Motivering (valfritt)"
            placeholder="Varför ska det ändras? Källa, beslut …"
            value={proposalComment}
            onChange={(e) => setProposalComment(e.target.value)}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: "flex-end" }}>
            <Button size="small" onClick={handleCancel}>{t("common.cancel")}</Button>
            <Button
              size="small" variant="contained"
              disabled={createProposals.isPending}
              onClick={handleSubmitProposal}
              startIcon={createProposals.isPending ? <CircularProgress size={12} color="inherit" /> : <EditNoteIcon />}
            >
              Skicka förslag
            </Button>
          </Stack>
        </Box>
      )}
      {node.type === "Process" && editing && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
            {t("createNode.parentProcess")}
          </Typography>
          <Autocomplete
            size="small"
            options={allProcesses.filter((p) => p.id !== node.id)}
            value={allProcesses.find((p) => p.id === parentId) ?? null}
            onChange={(_, v) => setParentId(v?.id ?? null)}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} placeholder={t("createNode.selectParentProcess")} size="small" />
            )}
          />
        </Box>
      )}
      {node.type === "Process" && !editing && parentId && (
        (() => {
          const parent = allProcesses.find((p) => p.id === parentId);
          return parent ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("createNode.parentProcess")}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{parent.name}</Typography>
            </Box>
          ) : null;
        })()
      )}
      {explorerPath(node.type, node.attributes) && !editable && (
        <ObjectContentLink nodeId={node.id} onOpen={(tab) => navigate(node, tab)} t={t} />
      )}

      {explorerPath(node.type, node.attributes) && !editable && (
        <Box sx={{ mt: 2 }}>
          <IconButton size="small" onClick={() => navigate(node)} title="Open detail view">
            <OpenInNewIcon fontSize="small" />
            <Typography variant="caption" sx={{ ml: 0.5 }}>
              {node.type === "Process" ? t("processExplorer.e2eGraph")
                : node.type === "Application" ? t("systemView.title")
                : t(`nodeTypes.${node.type}`)}
            </Typography>
          </IconButton>
        </Box>
      )}

      {/* Business calendar events this object is critical for */}
      {!editable && <NodeCalendarSection nodeId={node.id} nodeType={node.type} />}

      {/* Open change proposals — who proposed what, and the admin's switch */}
      {!editable && proposals.length > 0 && (
        <ChangeProposalsSection nodeId={node.id} nodeType={node.type} proposals={proposals} t={t} />
      )}

      {/* Edge notes — context-specific annotations */}
      {!editable && (
        <EdgeNotesSection nodeId={node.id} edges={allEdges} t={t} />
      )}

      {/* Quality flags */}
      {!editable && (
        <NodeFlagsSection nodeId={node.id} flags={flags} t={t} isAdmin={isAdmin} />
      )}

      {/* Add flag dialog */}
      <FlagDialog
        nodeId={node.id}
        open={flagDialogOpen}
        onClose={() => setFlagDialogOpen(false)}
        t={t}
      />
    </Box>
  );
};

/* ── Edge notes section (shown inside NodeDetail) ─────────────────── */

import type { EdgeRead } from "@/types/graph";

const EdgeNotesSection: React.FC<{
  nodeId: string;
  edges: EdgeRead[];
  t: (k: string) => string;
}> = ({ nodeId, edges, t }) => {
  const { data: allNodes = [] } = useAllNodes();
  const updateNote = useUpdateEdgeNote();
  const { enqueueSnackbar } = useSnackbar();
  const anchorNodeId = useGraphStore((s) => s.anchorNodeId);

  // When viewing a connected node (not the anchor itself), only show the edge
  // between this node and the anchor so notes stay context-specific.
  const connectedEdges = edges.filter((e) => {
    const touchesNode = e.source_id === nodeId || e.target_id === nodeId;
    if (!touchesNode) return false;
    if (anchorNodeId && anchorNodeId !== nodeId) {
      return e.source_id === anchorNodeId || e.target_id === anchorNodeId;
    }
    return true;
  });

  const edgesWithNotes = connectedEdges.filter((e) => e.attributes?.note);
  const [expanded, setExpanded] = useState(false);

  const shownEdges = expanded ? connectedEdges : edgesWithNotes;

  // Only render the section when there are actual notes to show
  if (edgesWithNotes.length === 0 && !expanded) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1 }} />
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
          Anteckningar per koppling
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          sx={{ fontSize: 10, py: 0, minWidth: 0 }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Dölj tomma" : `Visa alla (${connectedEdges.length})`}
        </Button>
      </Stack>
      <Stack spacing={1}>
        {shownEdges.map((edge) => {
          const otherId = edge.source_id === nodeId ? edge.target_id : edge.source_id;
          const other = allNodes.find((n) => n.id === otherId);
          return (
            <EdgeNoteRow
              key={edge.id}
              edge={edge}
              otherNode={other ?? null}
              onSave={async (note) => {
                try {
                  await updateNote.mutateAsync({ id: edge.id, note });
                  enqueueSnackbar("Anteckning sparad", { variant: "success" });
                } catch {
                  enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
                }
              }}
              t={t}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

const EdgeNoteRow: React.FC<{
  edge: EdgeRead;
  otherNode: { name: string; type: string } | null;
  onSave: (note: string | null) => Promise<void>;
  t: (k: string) => string;
}> = ({ edge, otherNode, onSave, t }) => {
  const existingNote = (edge.attributes?.note as string | undefined) ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(existingNote);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue((edge.attributes?.note as string | undefined) ?? "");
    setEditing(false);
  }, [edge.id, edge.attributes?.note]);

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.default" }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 0.5 }}>
        <Chip
          size="small"
          label={t(`edgeTypes.${edge.type}`)}
          sx={{ fontSize: 10, height: 18 }}
        />
        {otherNode && (
          <Chip
            size="small"
            label={otherNode.name}
            sx={{ fontSize: 10, height: 18, bgcolor: (NODE_COLORS as Record<string, string>)[otherNode.type], color: "#fff", maxWidth: 140 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {!editing && (
          <IconButton size="small" onClick={() => setEditing(true)} sx={{ p: 0.25 }}>
            <EditIcon sx={{ fontSize: 13 }} />
          </IconButton>
        )}
      </Stack>
      {editing ? (
        <>
          <TextField
            multiline minRows={2} maxRows={5} fullWidth size="small"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Skriv en anteckning om denna koppling…"
            autoFocus
            sx={{ fontSize: 12 }}
          />
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: "flex-end" }}>
            <Button size="small" onClick={() => { setEditing(false); setValue(existingNote); }}>
              {t("common.cancel")}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try { await onSave(value.trim() || null); setEditing(false); }
                finally { setSaving(false); }
              }}
            >
              {saving ? <CircularProgress size={12} color="inherit" /> : "Spara"}
            </Button>
          </Stack>
        </>
      ) : (
        <Typography
          variant="caption"
          sx={{ color: existingNote ? "text.primary" : "text.disabled", cursor: "pointer", display: "block", whiteSpace: "pre-wrap" }}
          onClick={() => setEditing(true)}>
          {existingNote || "Klicka för att lägga till anteckning…"}
        </Typography>
      )}
    </Box>
  );
};

/* ── Change proposals ─────────────────────────────────────────────── */

const proposalTooltip = (p: ChangeProposal) =>
  `Föreslaget av ${p.proposed_by ?? "okänd"} ${new Date(p.created_at).toLocaleDateString("sv-SE")}` +
  (p.comment ? ` – ${p.comment}` : "");

/**
 * Ett fält med öppet ändringsförslag: det föreslagna värdet ovanför, det
 * nuvarande (det listan levererat) överstruket under. Överstrykningen står
 * kvar tills admin släcker förslaget.
 */
const ProposedValue: React.FC<{
  proposals: ChangeProposal[] | undefined;
  current: string | null | undefined;
  fontSize: number;
  fontWeight?: number;
}> = ({ proposals = [], current, fontSize, fontWeight }) => (
  // Inget öppet förslag – då finns ingenting att stryka över.
  proposals.length === 0 ? (
    <Typography component="div" sx={{ fontSize, fontWeight, whiteSpace: "pre-wrap" }}>
      {current ? String(current) : "—"}
    </Typography>
  ) : (
  <Box>
    {proposals.map((p) => (
      <Tooltip key={p.id} title={proposalTooltip(p)}>
        <Typography
          component="div"
          sx={{ fontSize, fontWeight: fontWeight ?? 600, color: "primary.main", whiteSpace: "pre-wrap", cursor: "help" }}
        >
          {p.new_value || <em>(tomt)</em>}
        </Typography>
      </Tooltip>
    ))}
    <Typography
      component="div"
      sx={{ fontSize, fontWeight, color: "text.secondary", textDecoration: "line-through", whiteSpace: "pre-wrap" }}
    >
      {current ? String(current) : "—"}
    </Typography>
  </Box>
  )
);

const ChangeProposalsSection: React.FC<{
  nodeId: string;
  nodeType: string;
  proposals: ChangeProposal[];
  t: (k: string) => string;
}> = ({ nodeId, nodeType, proposals, t }) => {
  // Resolving proposals is an editor's task in the whole portal, not a
  // right on the object — the backend asks for the global role.
  const isEditor = useRoleStore((s) => s.isEditor);
  const myId = useRoleStore((s) => s.id);
  const resolve = useResolveChangeProposal();
  const withdraw = useWithdrawChangeProposal();
  const { enqueueSnackbar } = useSnackbar();
  const busy = resolve.isPending || withdraw.isPending;

  const onResolve = (p: ChangeProposal, outcome: "done" | "rejected") =>
    resolve.mutate(
      { id: p.id, nodeId, outcome, note: null },
      {
        onSuccess: () => enqueueSnackbar(outcome === "done" ? "Förslaget släckt" : "Förslaget avslaget", { variant: "success" }),
        onError: () => enqueueSnackbar("Kunde inte uppdatera förslaget", { variant: "error" }),
      },
    );

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 1 }}>
        Ändringsförslag ({proposals.length})
      </Typography>
      <Stack spacing={1}>
        {proposals.map((p) => (
          <Box key={p.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.default" }}>
            <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
              {proposalFieldLabel(p.field, nodeType, t)}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", fontSize: 11 }}>
              <Box component="span" sx={{ textDecoration: "line-through", color: "text.secondary" }}>
                {p.current_value || "—"}
              </Box>
              {" → "}
              <Box component="span" sx={{ color: "primary.main", fontWeight: 600 }}>{p.new_value || "(tomt)"}</Box>
            </Typography>
            {p.comment && (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: 11, whiteSpace: "pre-wrap" }}>
                {p.comment}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", fontSize: 10, mt: 0.25 }}>
              {p.proposed_by ?? "okänd"} · {new Date(p.created_at).toLocaleString("sv-SE")}
            </Typography>
            {(isEditor || (myId && p.proposed_by_id === myId)) && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: "flex-end" }}>
                {myId && p.proposed_by_id === myId && (
                  <Button
                    size="small" sx={{ fontSize: 10, py: 0 }} disabled={busy}
                    onClick={() => withdraw.mutate({ id: p.id, nodeId })}
                  >
                    Dra tillbaka
                  </Button>
                )}
                {isEditor && (
                  <>
                    <Button size="small" sx={{ fontSize: 10, py: 0 }} disabled={busy} onClick={() => onResolve(p, "rejected")}>
                      Avslå
                    </Button>
                    <Tooltip title="Ändringen är gjord i den bakomliggande listan. Överstrykningen försvinner och objektet visar det som läses in från listan.">
                      <span>
                        <Button
                          size="small" variant="contained" sx={{ fontSize: 10, py: 0 }} disabled={busy}
                          onClick={() => onResolve(p, "done")}
                        >
                          Klart – släck
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                )}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

/* ── Node flags section ────────────────────────────────────────────── */

const FLAG_COLORS: Record<string, string> = {
  INCOMPLETE: "warning",
  OUTDATED: "default",
  INCORRECT: "error",
};

const NodeFlagsSection: React.FC<{ nodeId: string; flags: import("@/types/graph").NodeFlag[]; t: (k: string) => string; isAdmin: boolean }> = ({ nodeId, flags, t, isAdmin }) => {
  const deleteFlag = useDeleteFlag();
  const respondToFlag = useRespondToFlag();
  const { enqueueSnackbar } = useSnackbar();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  if (flags.length === 0) return null;

  const startResponding = (flag: import("@/types/graph").NodeFlag) => {
    setRespondingId(flag.id);
    setResponseText(flag.response ?? "");
  };

  const cancelResponding = () => { setRespondingId(null); setResponseText(""); };

  const submitResponse = async (flagId: string) => {
    try {
      await respondToFlag.mutateAsync({ nodeId, flagId, response: responseText.trim() || null });
      enqueueSnackbar("Svar sparat", { variant: "success" });
      cancelResponding();
    } catch {
      enqueueSnackbar(t("flags.deleteError"), { variant: "error" });
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 1 }}>
        {t("flags.sectionTitle")}
      </Typography>
      <Stack spacing={1}>
        {flags.map((flag) => (
          <Box key={flag.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.default" }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: flag.description ? 0.5 : 0 }}>
              <Chip
                size="small"
                label={t(`flags.types.${flag.flag_type}`)}
                color={FLAG_COLORS[flag.flag_type] as "warning" | "default" | "error"}
                sx={{ fontSize: 10, height: 18 }}
              />
              <Box sx={{ flex: 1 }} />
              {isAdmin && respondingId !== flag.id && (
                <IconButton size="small" sx={{ p: 0.25 }} title="Svara" onClick={() => startResponding(flag)}>
                  <ReplyIcon sx={{ fontSize: 13 }} />
                </IconButton>
              )}
              {isAdmin && (
                <IconButton
                  size="small"
                  sx={{ p: 0.25 }}
                  onClick={async () => {
                    try {
                      await deleteFlag.mutateAsync({ nodeId, flagId: flag.id });
                      enqueueSnackbar(t("flags.deleteSuccess"), { variant: "success" });
                    } catch {
                      enqueueSnackbar(t("flags.deleteError"), { variant: "error" });
                    }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 13 }} />
                </IconButton>
              )}
            </Stack>
            {flag.description && (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: 11 }}>
                {flag.description}
              </Typography>
            )}
            {flag.created_by && (
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block", fontSize: 10, mt: 0.25 }}>
                {flag.created_by}
              </Typography>
            )}

            {/* Response area */}
            {respondingId === flag.id ? (
              <Box sx={{ mt: 0.75 }}>
                <TextField
                  fullWidth multiline minRows={2} size="small" autoFocus
                  placeholder="Skriv ett svar på flaggan…"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  sx={{ fontSize: 11 }}
                />
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: "flex-end" }}>
                  <Button size="small" onClick={cancelResponding}>{t("common.cancel")}</Button>
                  <Button
                    size="small" variant="contained"
                    disabled={respondToFlag.isPending}
                    onClick={() => submitResponse(flag.id)}
                  >
                    {respondToFlag.isPending ? <CircularProgress size={12} color="inherit" /> : "Spara svar"}
                  </Button>
                </Stack>
              </Box>
            ) : flag.response ? (
              <Box sx={{ mt: 0.75, bgcolor: "action.selected", borderRadius: 0.5, p: 0.75 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", fontSize: 10 }}>
                  Svar {flag.responded_by ? `· ${flag.responded_by}` : ""}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {flag.response}
                </Typography>
              </Box>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

/* ── Flag dialog ───────────────────────────────────────────────────── */

const FLAG_TYPES: FlagType[] = ["INCOMPLETE", "OUTDATED", "INCORRECT"];

const FlagDialog: React.FC<{ nodeId: string; open: boolean; onClose: () => void; t: (k: string) => string }> = ({ nodeId, open, onClose, t }) => {
  const createFlag = useCreateFlag();
  const { enqueueSnackbar } = useSnackbar();
  const [flagType, setFlagType] = useState<FlagType>("INCOMPLETE");
  const [desc, setDesc] = useState("");

  const handleSubmit = async () => {
    try {
      await createFlag.mutateAsync({ nodeId, flag_type: flagType, description: desc.trim() || null });
      enqueueSnackbar(t("flags.createSuccess"), { variant: "success" });
      setDesc("");
      onClose();
    } catch {
      enqueueSnackbar(t("flags.createError"), { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("flags.dialogTitle")}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
          <InputLabel>{t("flags.flagType")}</InputLabel>
          <Select
            value={flagType}
            label={t("flags.flagType")}
            onChange={(e) => setFlagType(e.target.value as FlagType)}
          >
            {FLAG_TYPES.map((ft) => (
              <MenuItem key={ft} value={ft}>{t(`flags.types.${ft}`)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label={t("flags.description")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("flags.descriptionPlaceholder")}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="contained"
          color="warning"
          disabled={createFlag.isPending}
          onClick={handleSubmit}
        >
          {createFlag.isPending ? <CircularProgress size={16} color="inherit" /> : t("flags.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/* ── Edge detail with replace ──────────────────────────────────────── */

import type { GraphEdge, NodeRead } from "@/types/graph";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useNodes } from "@/api/nodes";
import { useCreateEdge, useDeleteEdge as useDeleteEdgeHook } from "@/api/edges";

interface EdgeDetailProps {
  edge: GraphEdge;
  t: (k: string) => string;
  isAdmin: boolean;
  isEditor: boolean;
  onRequestDelete: () => void;
}

const EdgeDetail: React.FC<EdgeDetailProps> = ({ edge, t, isAdmin, isEditor, onRequestDelete }) => {
  const { data: allNodes = [] } = useNodes();
  const createEdge = useCreateEdge();
  const delEdge = useDeleteEdgeHook();
  const updateNote = useUpdateEdgeNote();
  const updateDirection = useUpdateEdgeDirection();
  const updateFields = useUpdateEdgeFields();
  const isSystemAdmin = useRoleStore((s) => s.isAdmin);
  // The panel shows the edge as it was when it was clicked; what is saved
  // since then is kept here so the fields show it.
  const [savedFields, setSavedFields] = useState<Record<string, unknown>>({});
  useEffect(() => setSavedFields({}), [edge.id]);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const { enqueueSnackbar } = useSnackbar();
  const [replacing, setReplacing] = useState<"source" | "target" | null>(null);
  const [replaceNode, setReplaceNode] = useState<NodeRead | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState((edge.attributes?.note as string | undefined) ?? "");

  useEffect(() => {
    setEditingNote(false);
    setNoteValue((edge.attributes?.note as string | undefined) ?? "");
  }, [edge.id, edge.attributes?.note]);

  const sourceNode = allNodes.find((n) => n.id === edge.source);
  const targetNode = allNodes.find((n) => n.id === edge.target);
  const direction = getIntegrationDirection(edge.type, edge.attributes);

  // Filter valid replacement nodes based on edge type
  const replaceOptions = useMemo(() => {
    if (!replacing) return [];
    if (replacing === "source" && targetNode) {
      return allNodes.filter((n) => {
        if (n.id === edge.source) return false;
        return getValidEdgeTypes(n.type, targetNode.type).includes(edge.type);
      });
    }
    if (replacing === "target" && sourceNode) {
      return allNodes.filter((n) => {
        if (n.id === edge.target) return false;
        return getValidEdgeTypes(sourceNode.type, n.type).includes(edge.type);
      });
    }
    return [];
  }, [replacing, allNodes, edge, sourceNode, targetNode]);

  const handleReplace = async () => {
    if (!replaceNode || !replacing) return;
    try {
      const newSource = replacing === "source" ? replaceNode.id : edge.source;
      const newTarget = replacing === "target" ? replaceNode.id : edge.target;
      await createEdge.mutateAsync({
        source_id: newSource,
        target_id: newTarget,
        type: edge.type,
        ...(direction ? { direction } : {}),
        // The own fields follow the connection to its new end.
        attributes: Object.fromEntries(
          Object.entries({ ...edge.attributes, ...savedFields }).filter(([k, v]) => isOwnField(k) && v != null),
        ),
      });
      await delEdge.mutateAsync(edge.id);
      enqueueSnackbar(t("nodeDetail.replaceSuccess"), { variant: "success" });
      clearSelection();
    } catch {
      enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
    }
  };

  const isPending = createEdge.isPending || delEdge.isPending;
  // What has its own control is not listed once more as a raw key and value:
  // the direction showed up as "direction BIDIRECTIONAL" under its own buttons.
  const otherAttributes = Object.entries(edge.attributes ?? {}).filter(
    ([k]) => k !== "note" && k !== "direction" && !isOwnField(k),
  );

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Chip label={t(`edgeTypes.${edge.type}`)} size="small" />
        <Box sx={{ flex: 1 }} />
        {isEditor && (
          <IconButton size="small" onClick={onRequestDelete} color="error" title={t("common.delete")}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {/* Source */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", width: 32 }}>{t("nodeDetail.from")}</Typography>
        {sourceNode && (
          <Chip
            size="small"
            label={sourceNode.name}
            sx={{ bgcolor: NODE_COLORS[sourceNode.type], color: "#fff", fontSize: 11, maxWidth: 200 }}
          />
        )}
        {isEditor && (
          <IconButton
            size="small"
            onClick={() => { setReplacing(replacing === "source" ? null : "source"); setReplaceNode(null); }}
            color={replacing === "source" ? "primary" : "default"}
            title={t("nodeDetail.replace")}
          >
            <SwapHorizIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>

      {/* Target */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", width: 32 }}>{t("nodeDetail.to")}</Typography>
        {targetNode && (
          <Chip
            size="small"
            label={targetNode.name}
            sx={{ bgcolor: NODE_COLORS[targetNode.type], color: "#fff", fontSize: 11, maxWidth: 200 }}
          />
        )}
        {isEditor && (
          <IconButton
            size="small"
            onClick={() => { setReplacing(replacing === "target" ? null : "target"); setReplaceNode(null); }}
            color={replacing === "target" ? "primary" : "default"}
            title={t("nodeDetail.replace")}
          >
            <SwapHorizIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>

      {/* Direction — only an integration has one */}
      {direction && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", width: 32 }}>
            {t("integrationDirection.label")}
          </Typography>
          {isEditor ? (
            <IntegrationDirectionSelect
              value={direction}
              onChange={(d) => {
                updateDirection.mutate(
                  { id: edge.id, direction: d },
                  {
                    onError: () => enqueueSnackbar(t("quickAdd.error"), { variant: "error" }),
                  },
                );
              }}
              sourceName={sourceNode?.name}
              targetName={targetNode?.name}
              disabled={updateDirection.isPending}
            />
          ) : (
            <Typography variant="body2">{t(`integrationDirection.${direction}`)}</Typography>
          )}
        </Stack>
      )}

      <OwnFields
        kind="edges" type={edge.type} ownerId={edge.id} attributes={{ ...edge.attributes, ...savedFields }}
        canEdit={isEditor} isAdmin={isSystemAdmin}
        onSave={async (values) => {
          await updateFields.mutateAsync({ id: edge.id, values });
          setSavedFields((s) => ({ ...s, ...values }));
        }}
      />

      {/* Replace picker */}
      {replacing && (
        <Box sx={{ mt: 1 }}>
          <Autocomplete
            size="small"
            options={replaceOptions}
            value={replaceNode}
            onChange={(_, v) => setReplaceNode(v)}
            getOptionLabel={(o) => o.name}
            groupBy={(o) => t(`nodeTypes.${o.type}`)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option.type], flexShrink: 0 }} />
                  <Typography variant="body2">{option.name}</Typography>
                </Stack>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("nodeDetail.replaceWith")}
                size="small"
                autoFocus
              />
            )}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small" variant="contained"
              disabled={!replaceNode || isPending}
              onClick={handleReplace}
              startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <SwapHorizIcon />}
            >
              {t("nodeDetail.replace")}
            </Button>
            <Button size="small" onClick={() => setReplacing(null)}>
              {t("common.cancel")}
            </Button>
          </Stack>
        </Box>
      )}

      {/* Note */}
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
            Anteckning
          </Typography>
          <Box sx={{ flex: 1 }} />
          {!editingNote && (
            <IconButton size="small" onClick={() => setEditingNote(true)} title="Redigera anteckning">
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Stack>
        {editingNote ? (
          <>
            <TextField
              multiline
              minRows={2}
              maxRows={6}
              fullWidth
              size="small"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Skriv en anteckning om denna koppling…"
              autoFocus
            />
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, justifyContent: "flex-end" }}>
              <Button
                size="small"
                onClick={() => { setEditingNote(false); setNoteValue((edge.attributes?.note as string | undefined) ?? ""); }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={updateNote.isPending ? <CircularProgress size={12} color="inherit" /> : <SaveIcon />}
                disabled={updateNote.isPending}
                onClick={async () => {
                  try {
                    await updateNote.mutateAsync({ id: edge.id, note: noteValue || null });
                    setEditingNote(false);
                    enqueueSnackbar("Anteckning sparad", { variant: "success" });
                  } catch {
                    enqueueSnackbar(t("quickAdd.error"), { variant: "error" });
                  }
                }}
              >
                Spara
              </Button>
            </Stack>
          </>
        ) : (
          <Typography
            variant="body2"
            sx={{ color: noteValue ? "text.primary" : "text.disabled", whiteSpace: "pre-wrap", cursor: "pointer", minHeight: 24 }}
            onClick={() => setEditingNote(true)}>
            {noteValue || "Ingen anteckning ännu. Klicka för att lägga till."}
          </Typography>
        )}
      </Box>

      {/* Extra attributes – the note, the direction and the own fields have their own UI above */}
      {otherAttributes.length > 0 && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableBody>
            {otherAttributes.map(([k, v]) => (
              <TableRow key={k}>
                <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: "text.secondary", fontSize: 12 }}>{k}</TableCell>
                <TableCell sx={{ border: 0, py: 0.5, fontSize: 12 }}>{String(v)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

export default NodeDetailPanel;

/* ── Documents and notes ──────────────────────────────────────────── */

/** How many documents and notes the object has, opening its tab in the explorer. */
const ObjectContentLink: React.FC<{ nodeId: string; onOpen: (tab: string) => void; t: (k: string, o?: Record<string, unknown>) => string }> = ({ nodeId, onOpen, t }) => {
  const { data: docs } = useNodeDocuments(nodeId);
  const { data: notes } = useNodeNotes(nodeId);
  if (!docs || !notes) return null;
  const docCount = docs.documents.length;
  const noteCount = notes.notes.length;
  return (
    <Box sx={{ mt: 2 }}>
      <Tooltip title={t("objectContent.panelOpen")}>
        <Button
          size="small"
          startIcon={<AttachFileIcon fontSize="small" />}
          onClick={() => onOpen(docCount > 0 || noteCount === 0 ? "dokument" : "anteckningar")}
          sx={{ textTransform: "none" }}
        >
          {t("objectContent.panelSummary", { docs: docCount, notes: noteCount })}
        </Button>
      </Tooltip>
    </Box>
  );
};

/** Everything attached goes with the object — say so before it's too late. */
const AttachedContentWarning: React.FC<{ nodeId: string; open: boolean; t: (k: string, o?: Record<string, unknown>) => string }> = ({ nodeId, open, t }) => {
  const { data } = useNodeContentSummary(nodeId, open);
  if (!data || (data.documents === 0 && data.notes === 0)) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      {t("objectContent.deleteWarning", { docs: data.documents, notes: data.notes })}
    </Alert>
  );
};
