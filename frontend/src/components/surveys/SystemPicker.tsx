import React, { useMemo } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { useNodes } from "@/api/nodes";

interface Props {
  nodeTypeFilter?: string | null;
  allowMultiple?: boolean | null;
  value: string[];
  onChange: (nodeIds: string[]) => void;
  label?: string;
  excludeNodeId?: string;
}

// Singular, lower-case object-type nouns for "Välj ___" — the question's own
// node_type_filter picks which kind of object this is, independent of what
// the survey itself targets (e.g. a Process survey can still ask "which
// systems does this integrate with").
const NODE_TYPE_SINGULAR: Record<string, string> = {
  Application: "applikation",
  Process: "process",
  InformationObject: "informationsobjekt",
  InformationSource: "informationskälla",
  TechnologyComponent: "teknikkomponent",
  Server: "server",
};

/** Multi/single select of existing nodes, used for the "system_picker" survey question type. */
export const SystemPicker: React.FC<Props> = ({
  nodeTypeFilter, allowMultiple = true, value, onChange, label, excludeNodeId,
}) => {
  const { data: nodes = [], isLoading } = useNodes(nodeTypeFilter ? { node_type: nodeTypeFilter } : undefined);
  const defaultLabel = `Välj ${nodeTypeFilter ? (NODE_TYPE_SINGULAR[nodeTypeFilter] ?? "objekt") : "objekt"}`;

  const options = useMemo(
    () =>
      nodes
        .filter((n) => !n.archived && n.id !== excludeNodeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes, excludeNodeId],
  );
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  if (allowMultiple) {
    const selected = value.map((id) => byId.get(id)).filter(Boolean) as typeof options;
    return (
      <Autocomplete
        multiple
        size="small"
        loading={isLoading}
        options={options}
        value={selected}
        onChange={(_, next) => onChange(next.map((n) => n.id))}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => <TextField {...params} label={label ?? defaultLabel} />}
      />
    );
  }

  const single = value.length > 0 ? byId.get(value[0]) ?? null : null;
  return (
    <Autocomplete
      size="small"
      loading={isLoading}
      options={options}
      value={single}
      onChange={(_, next) => onChange(next ? [next.id] : [])}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => <TextField {...params} label={label ?? defaultLabel} />}
    />
  );
};

export default SystemPicker;
