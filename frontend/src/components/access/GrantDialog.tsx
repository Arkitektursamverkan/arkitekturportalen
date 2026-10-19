import React, { useState } from "react";
import {
  Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, FormGroup, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useAccessMeta, useCreateGrant, useGroups, useRoles,
  type GrantCreate, type PrincipalType, type ScopeType,
} from "@/api/access";
import { useUsers } from "@/api/users";
import { NodePicker } from "./accessParts";

interface Props {
  onClose: () => void;
  /** Opened from an object: the scope is that object. */
  fixedNode?: { id: string; name: string; type: string };
}

const GrantDialog: React.FC<Props> = ({ onClose, fixedNode }) => {
  const { t } = useTranslation();
  const { data: meta } = useAccessMeta();
  const { data: roles = [] } = useRoles();
  const { data: groups = [] } = useGroups();
  const { data: users = [] } = useUsers();
  const create = useCreateGrant();

  const [principal, setPrincipal] = useState<PrincipalType>("group");
  const [principalRole, setPrincipalRole] = useState("superuser");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string>("");
  const [scope, setScope] = useState<ScopeType>(fixedNode ? "node" : "types");
  const [types, setTypes] = useState<string[]>([]);
  const [nodeId, setNodeId] = useState<string | null>(fixedNode?.id ?? null);
  const [nodeType, setNodeType] = useState<string | null>(fixedNode?.type ?? null);
  const [children, setChildren] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready =
    roleId !== "" &&
    (principal !== "group" || groupId) &&
    (principal !== "user" || userId) &&
    (scope !== "types" || types.length > 0) &&
    (scope !== "node" || nodeId);

  const save = async () => {
    setError(null);
    const input: GrantCreate = {
      principal_type: principal,
      principal_role: principal === "role" ? principalRole : null,
      group_id: principal === "group" ? groupId : null,
      user_id: principal === "user" ? userId : null,
      role_id: roleId,
      scope_type: scope,
      node_types: scope === "types" ? types : [],
      node_id: scope === "node" ? nodeId : null,
      include_children: scope === "node" && nodeType === "Process" && children,
      note: note.trim(),
    };
    try {
      await create.mutateAsync(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const toggleType = (nt: string) =>
    setTypes((cur) => (cur.includes(nt) ? cur.filter((x) => x !== nt) : [...cur, nt]));

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{fixedNode ? t("access.nodeDialog.addHere") : t("access.grants.add")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Who */}
          <Stack spacing={1}>
            <Typography variant="subtitle2">{t("access.principal.label")}</Typography>
            <ToggleButtonGroup size="small" exclusive value={principal} onChange={(_, v) => v && setPrincipal(v)}>
              {(["group", "user", "role", "everyone"] as PrincipalType[]).map((p) => (
                <ToggleButton key={p} value={p} sx={{ textTransform: "none" }}>{t(`access.principal.${p}`)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            {principal === "group" && (
              <TextField select size="small" label={t("access.principal.group")} value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </TextField>
            )}
            {principal === "user" && (
              <Autocomplete
                size="small"
                options={users.filter((u) => u.role !== "system")}
                getOptionLabel={(u) => `${u.name} (${u.email})`}
                value={users.find((u) => u.id === userId) ?? null}
                onChange={(_, u) => setUserId(u?.id ?? null)}
                renderInput={(params) => <TextField {...params} label={t("access.principal.user")} />}
              />
            )}
            {principal === "role" && (
              <TextField select size="small" label={t("access.principal.role")} value={principalRole} onChange={(e) => setPrincipalRole(e.target.value)}>
                {(meta?.principal_roles ?? ["user", "superuser"]).map((r) => (
                  <MenuItem key={r} value={r}>{t(`access.globalRoles.${r}`)}</MenuItem>
                ))}
              </TextField>
            )}
          </Stack>

          {/* Role */}
          <TextField select size="small" label={t("access.grants.role")} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                <Stack>
                  <Typography variant="body2">{r.name}</Typography>
                  {r.description && <Typography variant="caption" color="text.secondary">{r.description}</Typography>}
                </Stack>
              </MenuItem>
            ))}
          </TextField>

          {/* What */}
          {fixedNode ? (
            <Stack spacing={1}>
              <Typography variant="subtitle2">{t("access.scope.label")}</Typography>
              <Typography variant="body2">{fixedNode.name}</Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Typography variant="subtitle2">{t("access.scope.label")}</Typography>
              <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => v && setScope(v)}>
                {(["types", "node", "all"] as ScopeType[]).map((s) => (
                  <ToggleButton key={s} value={s} sx={{ textTransform: "none" }}>{t(`access.scope.${s}`)}</ToggleButton>
                ))}
              </ToggleButtonGroup>
              {scope === "types" && (
                <FormGroup row>
                  {(meta?.node_types ?? []).map((nt) => (
                    <FormControlLabel
                      key={nt}
                      control={<Checkbox size="small" checked={types.includes(nt)} onChange={() => toggleType(nt)} />}
                      label={<Typography variant="body2">{t(`access.types.${nt}`)}</Typography>}
                      sx={{ minWidth: 190 }}
                    />
                  ))}
                </FormGroup>
              )}
              {scope === "node" && (
                <NodePicker
                  value={nodeId}
                  onChange={(id, n) => { setNodeId(id); setNodeType(n?.type ?? null); }}
                  label={t("access.scope.node")}
                />
              )}
            </Stack>
          )}
          {scope === "node" && nodeType === "Process" && (
            <FormControlLabel
              control={<Switch size="small" checked={children} onChange={(e) => setChildren(e.target.checked)} />}
              label={<Typography variant="body2">{t("access.scope.includeChildren")}</Typography>}
            />
          )}

          <TextField size="small" label={t("access.grants.note")} value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!ready || create.isPending} onClick={save}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GrantDialog;
