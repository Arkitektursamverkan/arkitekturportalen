import React, { useMemo } from "react";
import { Autocomplete, Chip, TextField, createFilterOptions } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useNodes } from "@/api/nodes";
import { NODE_COLORS } from "@/config/graphConfig";
import type { NodeType, NodeRead } from "@/types/graph";

interface Item {
  /** UUID for an existing node, or pseudo id "proposal:<name>" for a new proposal */
  id: string;
  name: string;
  type: NodeType;
  isProposal: boolean;
}

interface Props {
  type: NodeType;
  label: string;
  ids: string[];
  proposals: string[];
  onChange: (next: { ids: string[]; proposals: string[] }) => void;
  helperText?: string;
}

const filter = createFilterOptions<Item>();

export const NodeMultiSelect: React.FC<Props> = ({ type, label, ids, proposals, onChange, helperText }) => {
  const { data: nodes = [], isLoading } = useNodes();

  const options: Item[] = useMemo(
    () =>
      nodes
        .filter((n) => n.type === type && !n.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => ({ id: n.id, name: n.name, type: n.type as NodeType, isProposal: false })),
    [nodes, type],
  );
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const selected: Item[] = useMemo(() => {
    const fromIds = ids.map((id) => byId.get(id)).filter(Boolean) as Item[];
    const fromProposals: Item[] = proposals.map((name) => ({
      id: `proposal:${name}`,
      name,
      type,
      isProposal: true,
    }));
    return [...fromIds, ...fromProposals];
  }, [ids, proposals, byId, type]);

  return (
    <Autocomplete<Item, true, false, false>
      multiple
      size="small"
      loading={isLoading}
      options={options}
      value={selected}
      onChange={(_, next) => {
        const newIds: string[] = [];
        const newProposals: string[] = [];
        for (const item of next) {
          if (item.isProposal) newProposals.push(item.name.trim());
          else newIds.push(item.id);
        }
        onChange({ ids: newIds, proposals: Array.from(new Set(newProposals.filter(Boolean))) });
      }}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(opts, params) => {
        const filtered = filter(opts, params);
        const trimmed = params.inputValue.trim();
        if (
          trimmed &&
          !opts.some((o) => o.name.toLowerCase() === trimmed.toLowerCase()) &&
          !selected.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
        ) {
          filtered.push({
            id: `proposal:${trimmed}`,
            name: trimmed,
            type,
            isProposal: true,
          });
        }
        return filtered;
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          {option.isProposal ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontStyle: "italic" }}>
              <AutoAwesomeIcon fontSize="small" />
              Lägg till "{option.name}" som förslag
            </span>
          ) : (
            option.name
          )}
        </li>
      )}
      renderValue={(picked, getItemProps) =>
        picked.map((n, i) => (
          <Chip
            {...getItemProps({ index: i })}
            key={n.id}
            label={n.name}
            size="small"
            icon={n.isProposal ? <AutoAwesomeIcon fontSize="small" sx={{ color: "inherit !important" }} /> : undefined}
            sx={
              n.isProposal
                ? {
                    bgcolor: "transparent",
                    border: `1px dashed ${NODE_COLORS[n.type]}`,
                    color: NODE_COLORS[n.type],
                    fontStyle: "italic",
                  }
                : { bgcolor: NODE_COLORS[n.type], color: "#fff" }
            }
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText ?? "Välj från listan eller skriv ett nytt namn → \"Lägg till som förslag\"."}
        />
      )}
    />
  );
};

// Re-export the existing NodeRead type for callers that still need it
export type { NodeRead };
export default NodeMultiSelect;
