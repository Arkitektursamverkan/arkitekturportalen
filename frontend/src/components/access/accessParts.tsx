import React from "react";
import { Autocomplete, Box, Chip, Stack, TextField, Typography } from "@mui/material";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNodes } from "@/api/nodes";
import { NODE_COLORS } from "@/config/graphConfig";
import type { Grant, GrantReach } from "@/api/access";
import type { NodeRead } from "@/types/graph";

/**
 * Shared pieces of Behörigheter: how a grant's who, what and why read, and
 * the pickers for objects and users.
 */

export function principalLabel(g: Grant, t: TFunction): string {
  switch (g.principal_type) {
    case "everyone":
      return t("access.principal.everyone");
    case "role":
      return t("access.principal.roleNamed", { role: t(`access.globalRoles.${g.principal_role}`).toLowerCase() });
    default:
      return g.principal_name ?? "—";
  }
}

export function scopeLabel(g: Grant, t: TFunction): string {
  if (g.scope_type === "all") return t("access.scope.all");
  if (g.scope_type === "types") return g.node_types.map((nt) => t(`access.types.${nt}`)).join(", ");
  const name = g.node_name ?? g.node_id ?? "—";
  return g.include_children ? `${name} (${t("access.scope.withChildren")})` : name;
}

export function viaLabel(r: GrantReach, t: TFunction): string {
  return r.via === "inherited"
    ? t("access.via.inherited", { name: r.inherited_from_name ?? "" })
    : t(`access.via.${r.via}`);
}

export const PrincipalChip: React.FC<{ grant: Grant }> = ({ grant }) => {
  const { t } = useTranslation();
  const color = grant.principal_type === "group" ? "primary" : grant.principal_type === "user" ? "secondary" : "default";
  const kind = grant.principal_type === "group" ? `${t("access.principal.group")}: `
    : grant.principal_type === "user" ? `${t("access.principal.user")}: ` : "";
  return <Chip size="small" color={color} variant="outlined" label={`${kind}${principalLabel(grant, t)}`} />;
};

const Dot: React.FC<{ type: string }> = ({ type }) => (
  <Box sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, bgcolor: (NODE_COLORS as Record<string, string>)[type] ?? "grey.500" }} />
);

/** Search among every object the signed-in user can see. */
export const NodePicker: React.FC<{
  value: string | null;
  onChange: (id: string | null, node: NodeRead | null) => void;
  label: string;
  size?: "small" | "medium";
}> = ({ value, onChange, label, size = "small" }) => {
  const { t } = useTranslation();
  const { data: nodes = [] } = useNodes();
  const options = React.useMemo(
    () => [...nodes].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "sv")),
    [nodes],
  );
  const selected = options.find((n) => n.id === value) ?? null;
  return (
    <Autocomplete
      size={size}
      options={options}
      value={selected}
      groupBy={(n) => t(`access.types.${n.type}`)}
      getOptionLabel={(n) => n.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, n) => onChange(n?.id ?? null, n)}
      renderOption={(props, n) => (
        <li {...props} key={n.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Dot type={n.type} />
            <Typography variant="body2">{n.name}</Typography>
          </Stack>
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder={t("access.scope.chooseNode")} />}
    />
  );
};
