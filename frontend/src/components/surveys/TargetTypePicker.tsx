import React, { useMemo } from "react";
import { Autocomplete, MenuItem, Select, Stack, TextField } from "@mui/material";
import { ATTR_FIELDS } from "@/config/graphConfig";
import type { NodeType } from "@/types/graph";

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  Process: "Affärsprocesser",
  Application: "Applikationer",
  InformationObject: "Informationsobjekt",
  InformationSource: "Informationskällor",
  TechnologyComponent: "Teknikkomponenter",
  Server: "Servrar",
  ServerService: "Servertjänster",
};

export const NODE_TYPES: NodeType[] = ["Application", "Process", "InformationObject", "InformationSource", "TechnologyComponent"];

interface Props {
  nodeType: string;
  attributeKey: string;
  disabled?: boolean;
  onChange: (next: { nodeType: string; attributeKey: string }) => void;
}

/** Lets an admin pick which entity type a survey is scoped to (e.g. "System") and which
 * attribute on it identifies the recipient (e.g. "systemförvaltare"). */
export const TargetTypePicker: React.FC<Props> = ({ nodeType, attributeKey, disabled, onChange }) => {
  const attrOptions = useMemo(
    () => (ATTR_FIELDS[nodeType as NodeType] ?? []).map((f) => f.key),
    [nodeType],
  );

  return (
    <Stack direction="row" spacing={2}>
      <Select
        size="small"
        value={nodeType}
        disabled={disabled}
        onChange={(e) => onChange({ nodeType: e.target.value, attributeKey })}
        sx={{ minWidth: 220 }}
      >
        {NODE_TYPES.map((t) => (
          <MenuItem key={t} value={t}>{NODE_TYPE_LABEL[t]}</MenuItem>
        ))}
      </Select>
      <Autocomplete
        freeSolo
        size="small"
        sx={{ minWidth: 260, flex: 1 }}
        options={attrOptions}
        value={attributeKey}
        disabled={disabled}
        onInputChange={(_, next) => onChange({ nodeType, attributeKey: next })}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Attribut som pekar ut mottagaren"
            helperText="T.ex. systemförvaltare — attributets namn på objektet"
          />
        )}
      />
    </Stack>
  );
};

export default TargetTypePicker;
