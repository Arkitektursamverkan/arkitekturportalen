import React from "react";
import { Box, Button, Stack, Tab, Tabs } from "@mui/material";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useNodeDocuments, useNodeNotes } from "@/api/nodeContent";
import ObjectDocuments from "./ObjectDocuments";
import ObjectNotes from "./ObjectNotes";
import NodeAccessDialog from "@/components/access/NodeAccessDialog";
import { useRoleStore } from "@/store/roleStore";

/**
 * The right-hand side of an object explorer: the page's own views (graph,
 * flow, overview …) followed by Dokument and Anteckningar. The chosen tab
 * lives in the URL (`flik`), so a link can open an object straight on its
 * documents and switching object keeps the tab — see `selectObject`.
 */

export const TAB_PARAM = "flik";
const CONTENT_TABS = ["dokument", "anteckningar"] as const;

export interface ViewTab {
  value: string;
  label: string;
}

/** Search params for selecting another object, keeping the open tab. */
export function selectObject(params: URLSearchParams, id: string): Record<string, string> {
  const tab = params.get(TAB_PARAM);
  return tab ? { id, [TAB_PARAM]: tab } : { id };
}

interface Props {
  nodeId: string | undefined;
  viewTabs: ViewTab[];
  /** Renders the page's own view for the tab; also used with no object selected. */
  children: (tab: string) => React.ReactNode;
}

const ObjectPane: React.FC<Props> = ({ nodeId, viewTabs, children }) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: docs } = useNodeDocuments(nodeId);
  const { data: notes } = useNodeNotes(nodeId);
  const isAdmin = useRoleStore((s) => s.isAdmin);
  const [showAccess, setShowAccess] = React.useState(false);
  // Who reaches the object is for admins and for those who manage it.
  const canSeeAccess = isAdmin || Boolean(docs?.permissions.manage);

  const requested = params.get(TAB_PARAM);
  const valid = [...viewTabs.map((v) => v.value), ...CONTENT_TABS];
  // An unknown tab — or a view this object lacks, like a missing flow — falls
  // back to the first view instead of leaving an empty pane.
  const tab = requested && valid.includes(requested) ? requested : viewTabs[0].value;

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === viewTabs[0].value) next.delete(TAB_PARAM);
    else next.set(TAB_PARAM, value);
    setParams(next);
  };

  const docCount = docs?.documents.length;
  const noteCount = notes?.notes.length;
  const withCount = (label: string, n: number | undefined) => (n ? `${label} (${n})` : label);

  return (
    <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {nodeId && (
        <Stack
          direction="row"
          sx={{ alignItems: "center", flexShrink: 0, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", pr: 1 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ flexGrow: 1, minHeight: 38, "& .MuiTab-root": { minHeight: 38, py: 0 } }}
          >
            {viewTabs.map((v) => <Tab key={v.value} value={v.value} label={v.label} />)}
            <Tab value="dokument" label={withCount(t("objectContent.tabDocuments"), docCount)} />
            <Tab value="anteckningar" label={withCount(t("objectContent.tabNotes"), noteCount)} />
          </Tabs>
          {canSeeAccess && (
            <Button
              size="small"
              startIcon={<AdminPanelSettingsOutlinedIcon fontSize="small" />}
              onClick={() => setShowAccess(true)}
              sx={{ textTransform: "none", whiteSpace: "nowrap" }}
            >
              {t("access.nodeDialog.button")}
            </Button>
          )}
        </Stack>
      )}
      {showAccess && nodeId && <NodeAccessDialog nodeId={nodeId} onClose={() => setShowAccess(false)} />}
      <Box sx={{ flexGrow: 1, position: "relative", overflow: "hidden" }}>
        {nodeId && tab === "dokument" ? (
          <Box sx={{ height: "100%", overflowY: "auto", p: 3 }}>
            <ObjectDocuments nodeId={nodeId} />
          </Box>
        ) : nodeId && tab === "anteckningar" ? (
          <Box sx={{ height: "100%", overflowY: "auto", p: 3 }}>
            <ObjectNotes nodeId={nodeId} />
          </Box>
        ) : (
          children(tab)
        )}
      </Box>
    </Box>
  );
};

export default ObjectPane;
