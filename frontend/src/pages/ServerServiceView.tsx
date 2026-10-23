import React, { useMemo, useState } from "react";
import {
  Box, Card, CardContent, Chip, IconButton, List, ListItemButton, ListItemText, Stack, Table, TableBody,
  TableCell, TableRow, Tooltip, Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { useNodePermissions } from "@/api/access";
import { ATTR_FIELDS } from "@/config/graphConfig";
import ListSearchBox from "@/components/common/ListSearchBox";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import { useGraphStore } from "@/store/graphStore";
import { useRoleStore } from "@/store/roleStore";
import type { NodeRead } from "@/types/graph";

/**
 * Servertjänster — services delivered from the servers (DNS, nätverk …),
 * synced from the Servertjänster list in the integration platform. They are
 * connected to servers from the server's page; here each service shows which
 * servers it runs on. Access follows Servrar (app/access.py, TYPE_FAMILY).
 */

const attr = (n: NodeRead, key: string): string =>
  typeof n.attributes?.[key] === "string" ? (n.attributes[key] as string).trim() : "";

const byName = (a: NodeRead, b: NodeRead) => a.name.localeCompare(b.name, "sv");

const ServerServiceView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const [searchText, setSearchText] = useState("");
  const serverAccess = useRoleStore((s) => s.serverAccess);
  const isAdmin = useRoleStore((s) => s.isAdmin);
  const selectNode = useGraphStore((s) => s.selectNode);

  const { data: allNodes = [], isLoading } = useNodes();
  const { data: edges = [] } = useEdges();
  const { data: perms } = useNodePermissions(selectedId);

  const services = useMemo(() => allNodes.filter((n) => n.type === "ServerService").sort(byName), [allNodes]);
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  // The servers each service RUNS_ON, keyed by service id.
  const serversByService = useMemo(() => {
    const map = new Map<string, NodeRead[]>();
    for (const e of edges) {
      if (e.type !== "RUNS_ON") continue;
      const target = nodeById.get(e.target_id);
      if (!target || target.type !== "Server") continue;
      const list = map.get(e.source_id) ?? [];
      list.push(target);
      map.set(e.source_id, list);
    }
    for (const list of map.values()) list.sort(byName);
    return map;
  }, [edges, nodeById]);

  const selected = services.find((s) => s.id === selectedId);
  const visible = services.filter((s) => !searchText || s.name.toLowerCase().includes(searchText.toLowerCase()));
  const canEdit = isAdmin || Boolean(perms?.edit_object);

  if (serverAccess === "none") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)", p: 3 }}>
        <Typography sx={{ color: "text.secondary" }}>{t("serverServiceView.noAccess")}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("serverServiceView.select")}</Typography>
        </Box>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        {isLoading ? (
          <LoadingSpinner height={200} />
        ) : services.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", p: 2 }}>{t("serverServiceView.noServices")}</Typography>
        ) : (
          <List dense>
            {visible.map((s) => {
              const count = serversByService.get(s.id)?.length ?? 0;
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
                    secondary={[attr(s, "miljö"), attr(s, "komponenttyp")].filter(Boolean).join(" · ") || undefined}
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
                <Typography sx={{ color: "text.secondary" }}>{t("serverServiceView.noSelection")}</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ maxWidth: 960 }}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="h5">{selected.name}</Typography>
                    {canEdit && (
                      <Tooltip title={t("serverServiceView.edit")}>
                        <IconButton size="small" onClick={() => selectNode({
                          id: selected.id, type: selected.type, name: selected.name, description: selected.description,
                          external_source: selected.external_source, archived: selected.archived, attributes: selected.attributes,
                        })}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  {selected.description && (
                    <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{selected.description}</Typography>
                  )}
                  <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                    {ATTR_FIELDS.ServerService.filter((f) => attr(selected, f.key)).map((f) => (
                      <Chip key={f.key} size="small" variant="outlined" label={`${t(f.labelKey)}: ${attr(selected, f.key)}`} />
                    ))}
                  </Stack>
                </Box>

                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                      {t("serverServiceView.servers")}{" "}
                      <Chip label={serversByService.get(selected.id)?.length ?? 0} size="small" sx={{ ml: 0.5 }} />
                    </Typography>
                    {(serversByService.get(selected.id) ?? []).length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("serverServiceView.noServers")}</Typography>
                    ) : (
                      <Table size="small">
                        <TableBody>
                          {(serversByService.get(selected.id) ?? []).map((srv) => (
                            <TableRow key={srv.id} hover>
                              <TableCell>
                                <Typography
                                  variant="body2"
                                  sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                                  onClick={() => navigate(`/servers?id=${srv.id}`)}
                                >
                                  {srv.name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                  {[attr(srv, "miljö"), attr(srv, "servertyp")].filter(Boolean).join(" · ") || "—"}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            )}
          </Box>
        )}
      </ObjectPane>
    </Box>
  );
};

export default ServerServiceView;
