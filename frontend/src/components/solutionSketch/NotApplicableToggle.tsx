import React from "react";
import { Chip, Tooltip } from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";

interface Props {
  field: string;
  notApplicable: string[];
  onToggle: (next: string[]) => void;
}

/**
 * Per-question toggle: "Ej relevant". When active the field's dotted path is
 * added to the sketch's not_applicable array, which greys out the input,
 * counts the field as completed for coverage, but excludes its content from
 * the domain-relevance heuristics.
 */
export const NotApplicableToggle: React.FC<Props> = ({ field, notApplicable, onToggle }) => {
  const active = notApplicable.includes(field);
  const toggle = () => {
    if (active) onToggle(notApplicable.filter((f) => f !== field));
    else onToggle([...notApplicable, field]);
  };
  return (
    <Tooltip title={active ? "Markerad som ej relevant — klicka för att avmarkera" : "Markera frågan som ej relevant för denna skiss"}>
      <Chip
        size="small"
        variant={active ? "filled" : "outlined"}
        color={active ? "default" : "default"}
        icon={active ? <BlockIcon fontSize="small" /> : <RemoveCircleOutlineIcon fontSize="small" />}
        label={active ? "Ej relevant" : "Ej relevant?"}
        onClick={toggle}
        sx={{ cursor: "pointer" }}
      />
    </Tooltip>
  );
};

export default NotApplicableToggle;
