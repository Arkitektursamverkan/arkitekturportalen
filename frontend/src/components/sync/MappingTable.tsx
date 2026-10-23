import React from "react";
import {
  Alert, Box, Button, Chip, FormControl, MenuItem, Select, Table, TableBody,
  TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ClearIcon from "@mui/icons-material/Clear";
import { useSnackbar } from "notistack";
import type { NodeTypeField, SourceField } from "@/api/platformImport";

export type EaField = NodeTypeField & { group: "Core" | "Attribute" };
export type FieldMap = Record<string, string>;  // ea target → platform source field

interface Props {
  sourceFields: SourceField[];
  eaFields: EaField[];
  value: FieldMap;
  onChange: (next: FieldMap) => void;
  /** When true, hide "Name must be mapped" inline warning. */
  hideNameWarning?: boolean;
}

/** Stable list of platform fields that we never expect users to map. */
const ALWAYS_UNMAPPED = new Set(["external_id", "Created", "Modified", "LinkTitle", "LinkTitleNoMenu"]);

/** Best-effort: match EA target labels/attr names to platform field names. */
export function autoMatchFields(eaFields: EaField[], sourceFields: SourceField[]): FieldMap {
  const map: FieldMap = {};
  for (const eaField of eaFields) {
    const eaLabel = eaField.label.toLowerCase();
    const attrName = eaField.target.startsWith("attr:") ? eaField.target.slice(5).toLowerCase() : "";
    let bestMatch = "";
    for (const sf of sourceFields) {
      const sfLower = sf.name.toLowerCase();
      if (sfLower === eaLabel || (attrName && sfLower === attrName)) { bestMatch = sf.name; break; }
      if (eaField.target === "name" && (sfLower === "title" || sfLower === "name")) { bestMatch = sf.name; break; }
      if (eaField.target === "description" && (sfLower === "beskrivning" || sfLower === "description")) { bestMatch = sf.name; break; }
    }
    if (bestMatch) map[eaField.target] = bestMatch;
  }
  return map;
}

export const MappingTable: React.FC<Props> = ({
  sourceFields, eaFields, value, onChange, hideNameWarning,
}) => {
  const { enqueueSnackbar } = useSnackbar();

  const setMapping = (eaTarget: string, platformField: string) => {
    const next = { ...value };
    if (platformField) next[eaTarget] = platformField;
    else delete next[eaTarget];
    onChange(next);
  };

  const autoSuggest = () => {
    const map = autoMatchFields(eaFields, sourceFields);
    onChange(map);
    enqueueSnackbar(`Auto-matched ${Object.keys(map).length} of ${eaFields.length} fields`, { variant: "info" });
  };

  const getSample = (fieldName: string): string =>
    sourceFields.find((sf) => sf.name === fieldName)?.sample || "";

  const hasNameMapping = !!value["name"];

  const renderRow = (eaField: EaField) => (
    <TableRow
      key={eaField.target}
      sx={{ bgcolor: !value[eaField.target] && eaField.required ? "error.50" : undefined }}
    >
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: eaField.required ? 600 : 400 }}>
          {eaField.label}
          {eaField.required && (
            <Chip
              label="required"
              size="small"
              color="error"
              variant="outlined"
              sx={{ ml: 0.5, height: 18, fontSize: 10 }}
            />
          )}
        </Typography>
      </TableCell>
      <TableCell><ArrowBackIcon color="action" fontSize="small" /></TableCell>
      <TableCell>
        <FormControl fullWidth size="small">
          <Select
            value={value[eaField.target] || ""}
            displayEmpty
            onChange={(e) => setMapping(eaField.target, e.target.value)}
          >
            <MenuItem value=""><em>— ej mappad —</em></MenuItem>
            {sourceFields.map((sf) => (
              <MenuItem key={sf.name} value={sf.name}>{sf.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
      <TableCell>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", maxWidth: 200, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value[eaField.target] ? getSample(value[eaField.target]) : ""}
        </Typography>
      </TableCell>
    </TableRow>
  );

  const mappedSources = new Set(Object.values(value));
  const unmapped = sourceFields.filter((sf) => !mappedSources.has(sf.name) && !ALWAYS_UNMAPPED.has(sf.name));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          För varje EA-fält, välj vilket plattformsfält som ska ge värdet.
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" startIcon={<AutoFixHighIcon />} onClick={autoSuggest}>Auto-match</Button>
          <Button size="small" startIcon={<ClearIcon />} onClick={() => onChange({})}>Töm alla</Button>
        </Box>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, width: "30%" }}>EA-fält</TableCell>
            <TableCell sx={{ width: 30 }} />
            <TableCell sx={{ fontWeight: 600, width: "35%" }}>Plattformsfält</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Exempelvärde</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell colSpan={4} sx={{ bgcolor: "grey.50", py: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>KÄRNFÄLT</Typography>
            </TableCell>
          </TableRow>
          {eaFields.filter((f) => f.group === "Core").map(renderRow)}

          <TableRow>
            <TableCell colSpan={4} sx={{ bgcolor: "grey.50", py: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>ATTRIBUT</Typography>
            </TableCell>
          </TableRow>
          {eaFields.filter((f) => f.group === "Attribute").map(renderRow)}
        </TableBody>
      </Table>

      {!hasNameMapping && !hideNameWarning && (
        <Alert severity="warning">Fältet "Name" måste mappas för att kunna fortsätta.</Alert>
      )}

      {unmapped.length > 0 && (
        <Alert severity="info">
          <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
            {unmapped.length} plattformsfält ej mappade:
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {unmapped.map((sf) => sf.name).join(", ")}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default MappingTable;
