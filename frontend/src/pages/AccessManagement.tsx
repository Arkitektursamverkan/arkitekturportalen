import React, { useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import ErrorAlert from "@/components/common/ErrorAlert";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import GrantDialog from "@/components/access/GrantDialog";
import { NodePicker, PrincipalChip, principalLabel, scopeLabel, viaLabel } from "@/components/access/accessParts";
import {
  useAccessCheck, useAccessMeta, useCreateGroup, useCreateRole, useDeleteGrant, useDeleteGroup,
  useDeleteRole, useGrants, useGroups, useRoles, useSetGroupMembers, useUpdateGroup, useUpdateRole,
  type Group, type Permission, type Role,
} from "@/api/access";
import { useUsers, type AppUser } from "@/api/users";

const TABS = ["tilldelningar", "grupper", "roller", "kontrollera"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABEL: Record<TabKey, string> = {
  tilldelningar: "access.tabs.grants",
  grupper: "access.tabs.groups",
  roller: "access.tabs.roles",
  kontrollera: "access.tabs.check",
};

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

const AccessManagement: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get("flik") as TabKey | null;
  const tab: TabKey = requested && TABS.includes(requested) ? requested : "tilldelningar";

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 1 }}>{t("access.title")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 900 }}>{t("access.intro")}</Typography>
      <Tabs
        value={tab}
        onChange={(_, v) => setParams(v === "tilldelningar" ? {} : { flik: v })}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {TABS.map((k) => <Tab key={k} value={k} label={t(TAB_LABEL[k])} />)}
      </Tabs>
      {tab === "tilldelningar" && <GrantsTab />}
      {tab === "grupper" && <GroupsTab />}
      {tab === "roller" && <RolesTab />}
      {tab === "kontrollera" && <CheckTab />}
    </Box>
  );
};

// ── Grants ──────────────────────────────────────────────────────────────────

const GrantsTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: grants = [], isLoading, error } = useGrants();
  const del = useDeleteGrant();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return grants;
    return grants.filter((g) =>
      [principalLabel(g, t), g.role_name, scopeLabel(g, t), g.note].some((s) => s.toLowerCase().includes(q)),
    );
  }, [grants, filter, t]);

  if (isLoading) return <LoadingSpinner height={200} />;
  if (error) return <ErrorAlert error={error as Error} />;

  return (
    <Box>
      {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>{t("access.grants.add")}</Button>
        <TextField size="small" placeholder={t("access.grants.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 280 }} />
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>{t("access.principal.label")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("access.grants.role")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("access.scope.label")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("access.grants.created")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((g) => (
              <TableRow key={g.id} hover>
                <TableCell><PrincipalChip grant={g} /></TableCell>
                <TableCell>
                  <Tooltip title={g.permissions.map((p) => t(`access.permissions.${p}`)).join(" · ")}>
                    <Typography variant="body2" component="span">{g.role_name}</Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{scopeLabel(g, t)}</Typography>
                  {g.note && <Typography variant="caption" color="text.secondary">{g.note}</Typography>}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(g.created_at).toLocaleDateString("sv-SE")}{g.created_by ? ` · ${g.created_by}` : ""}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={t("access.grants.delete")}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (!window.confirm(t("access.grants.confirmDelete"))) return;
                        del.mutate(g.id, { onError: (e) => setFailure(errorText(e, t("common.error"))) });
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>{t("access.grants.empty")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {adding && <GrantDialog onClose={() => setAdding(false)} />}
    </Box>
  );
};

// ── Groups ──────────────────────────────────────────────────────────────────

const GroupsTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: groups = [], isLoading, error } = useGroups();
  const del = useDeleteGroup();
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner height={200} />;
  if (error) return <ErrorAlert error={error as Error} />;

  return (
    <Box>
      {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")} sx={{ mb: 2 }}>
        {t("access.groups.add")}
      </Button>
      {groups.length === 0 ? (
        <Typography color="text.secondary">{t("access.groups.empty")}</Typography>
      ) : (
        <Stack spacing={1.5}>
          {groups.map((g) => (
            <Paper key={g.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" fontWeight={600}>{g.name}</Typography>
                <Chip size="small" label={t("access.groups.memberCount", { n: g.members.length })} />
                <Box flexGrow={1} />
                <Tooltip title={t("access.groups.edit")}>
                  <IconButton size="small" onClick={() => setEditing(g)}><EditIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title={t("access.groups.delete")}>
                  <IconButton size="small" onClick={() => setDeleting(g)}><DeleteIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
              {g.description && <Typography variant="body2" color="text.secondary">{g.description}</Typography>}
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {g.members.map((m) => <Chip key={m.id} size="small" variant="outlined" label={m.name} title={m.email} />)}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      {editing && <GroupDialog group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Dialog open onClose={() => setDeleting(null)}>
          <DialogTitle>{t("access.groups.delete")}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t("access.groups.confirmDelete", { name: deleting.name })}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => del.mutate(deleting.id, {
                onSuccess: () => setDeleting(null),
                onError: (e) => { setDeleting(null); setFailure(errorText(e, t("common.error"))); },
              })}
            >
              {t("access.groups.delete")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

const GroupDialog: React.FC<{ group: Group | null; onClose: () => void }> = ({ group, onClose }) => {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const setMembers = useSetGroupMembers();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [members, setMembersState] = useState<string[]>(group?.members.map((m) => m.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const people = users.filter((u) => u.role !== "system");
  const pending = create.isPending || update.isPending || setMembers.isPending;

  const save = async () => {
    setError(null);
    try {
      if (group) {
        await update.mutateAsync({ id: group.id, patch: { name: name.trim(), description: description.trim() } });
        await setMembers.mutateAsync({ id: group.id, userIds: members });
      } else {
        await create.mutateAsync({ name: name.trim(), description: description.trim(), member_ids: members });
      }
      onClose();
    } catch (e) {
      setError(errorText(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{group ? group.name : t("access.groups.add")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField size="small" label={t("access.groups.name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField size="small" label={t("access.groups.description")} value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
          <Autocomplete
            multiple
            size="small"
            options={people}
            value={people.filter((u) => members.includes(u.id))}
            getOptionLabel={(u: AppUser) => `${u.name} (${u.email})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) => setMembersState(v.map((u) => u.id))}
            renderTags={(value, getTagProps) =>
              value.map((u, i) => <Chip {...getTagProps({ index: i })} key={u.id} size="small" label={u.name} />)
            }
            renderInput={(params) => <TextField {...params} label={t("access.groups.members")} />}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!name.trim() || pending} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Roles ───────────────────────────────────────────────────────────────────

const RolesTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: meta } = useAccessMeta();
  const { data: roles = [], isLoading, error } = useRoles();
  const update = useUpdateRole();
  const del = useDeleteRole();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading || !meta) return <LoadingSpinner height={200} />;
  if (error) return <ErrorAlert error={error as Error} />;

  const toggle = (role: Role, perm: Permission) => {
    const next = role.permissions.includes(perm)
      ? role.permissions.filter((p) => p !== perm)
      : [...role.permissions, perm];
    update.mutate({ id: role.id, patch: { permissions: next } }, {
      onError: (e) => setFailure(errorText(e, t("common.error"))),
    });
  };

  return (
    <Box>
      {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>{t("access.roles.hint")}</Alert>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")} sx={{ mb: 2 }}>
        {t("access.roles.add")}
      </Button>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              {roles.map((r) => (
                <TableCell key={r.id} align="center" sx={{ verticalAlign: "bottom", minWidth: 130 }}>
                  <Stack alignItems="center" spacing={0.5}>
                    <Stack direction="row" alignItems="center">
                      <Typography variant="body2" fontWeight={700}>{r.name}</Typography>
                      <IconButton size="small" onClick={() => setEditing(r)}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
                    </Stack>
                    {r.builtin
                      ? <Chip size="small" label={t("access.roles.builtin")} sx={{ height: 18, fontSize: 10 }} />
                      : (
                        <Tooltip title={t("access.roles.delete")}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={r.grant_count > 0}
                              onClick={() => {
                                if (!window.confirm(t("access.roles.confirmDelete", { name: r.name }))) return;
                                del.mutate(r.id, { onError: (e) => setFailure(errorText(e, t("common.error"))) });
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    <Typography variant="caption" color="text.secondary">{t("access.roles.inUse", { n: r.grant_count })}</Typography>
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {meta.permissions.map((p) => (
              <TableRow key={p} hover>
                <TableCell><Typography variant="body2">{t(`access.permissions.${p}`)}</Typography></TableCell>
                {roles.map((r) => (
                  <TableCell key={r.id} align="center" padding="checkbox">
                    <Checkbox size="small" checked={r.permissions.includes(p)} disabled={update.isPending} onChange={() => toggle(r, p)} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && <RoleDialog role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Box>
  );
};

const RoleDialog: React.FC<{ role: Role | null; onClose: () => void }> = ({ role, onClose }) => {
  const { t } = useTranslation();
  const create = useCreateRole();
  const update = useUpdateRole();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      if (role) await update.mutateAsync({ id: role.id, patch: { name: name.trim(), description: description.trim() } });
      else await create.mutateAsync({ name: name.trim(), description: description.trim(), permissions: ["object.read"] });
      onClose();
    } catch (e) {
      setError(errorText(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{role ? role.name : t("access.roles.add")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField size="small" label={t("access.roles.name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField size="small" label={t("access.roles.description")} value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!name.trim() || create.isPending || update.isPending} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Check ───────────────────────────────────────────────────────────────────

const CheckTab: React.FC = () => {
  const { t } = useTranslation();
  const { data: meta } = useAccessMeta();
  const { data: users = [] } = useUsers();
  const [userId, setUserId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const { data, isLoading, error } = useAccessCheck(userId ?? undefined, nodeId ?? undefined);
  const people = users.filter((u) => u.role !== "system");

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t("access.check.intro")}</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3 }}>
        <Autocomplete
          size="small"
          options={people}
          getOptionLabel={(u) => `${u.name} (${u.email})`}
          value={people.find((u) => u.id === userId) ?? null}
          onChange={(_, u) => setUserId(u?.id ?? null)}
          renderInput={(params) => <TextField {...params} label={t("access.check.user")} />}
          sx={{ flex: 1 }}
        />
        <Box sx={{ flex: 1 }}>
          <NodePicker value={nodeId} onChange={(id) => setNodeId(id)} label={t("access.check.node")} />
        </Box>
      </Stack>

      {isLoading && userId && nodeId && <LoadingSpinner height={120} />}
      {error && <ErrorAlert error={error as Error} />}
      {data && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">{t("access.check.groups")}:</Typography>
            {data.groups.length === 0
              ? <Typography variant="body2" color="text.secondary">{t("access.check.noGroups")}</Typography>
              : data.groups.map((g) => <Chip key={g} size="small" label={g} />)}
          </Stack>
          {data.is_admin ? (
            <Alert severity="info">{t("access.check.isAdmin", { name: data.user.name })}</Alert>
          ) : data.permissions.length === 0 ? (
            <Alert severity="warning">{t("access.check.noAccess", { name: data.user.name })}</Alert>
          ) : (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("access.check.may")}</Typography>
              <Stack spacing={0.5}>
                {(meta?.permissions ?? []).map((p) => (
                  <Stack key={p} direction="row" spacing={1} alignItems="center" sx={{ opacity: data.permissions.includes(p) ? 1 : 0.4 }}>
                    {data.permissions.includes(p) ? <CheckIcon fontSize="small" color="success" /> : <Box sx={{ width: 20 }} />}
                    <Typography variant="body2">{t(`access.permissions.${p}`)}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}
          {data.grants.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("access.check.because")}</Typography>
              <Table size="small">
                <TableBody>
                  {data.grants.map((r) => (
                    <TableRow key={r.grant.id}>
                      <TableCell><PrincipalChip grant={r.grant} /></TableCell>
                      <TableCell>{r.grant.role_name}</TableCell>
                      <TableCell>{viaLabel(r, t)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default AccessManagement;
