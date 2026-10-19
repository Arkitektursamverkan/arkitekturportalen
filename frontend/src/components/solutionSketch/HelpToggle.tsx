import React from "react";
import { Chip, Tooltip } from "@mui/material";
import OutlinedFlagIcon from "@mui/icons-material/OutlinedFlag";
import FlagIcon from "@mui/icons-material/Flag";

interface Props {
  field: string;
  helpRequests: string[];
  onToggle: (next: string[]) => void;
}

/**
 * Small per-question toggle: "Begär hjälp att besvara". When active the field's
 * dotted path is added to the sketch's help_requests array so a reviewer can see
 * which questions the submitter wants help with.
 */
export const HelpToggle: React.FC<Props> = ({ field, helpRequests, onToggle }) => {
  const active = helpRequests.includes(field);
  const toggle = () => {
    if (active) onToggle(helpRequests.filter((f) => f !== field));
    else onToggle([...helpRequests, field]);
  };
  return (
    <Tooltip title={active ? "Hjälp begärd — klicka för att avmarkera" : "Begär hjälp att besvara denna fråga"}>
      <Chip
        size="small"
        variant={active ? "filled" : "outlined"}
        color={active ? "warning" : "default"}
        icon={active ? <FlagIcon fontSize="small" /> : <OutlinedFlagIcon fontSize="small" />}
        label={active ? "Hjälp begärd" : "Begär hjälp"}
        onClick={toggle}
        sx={{ cursor: "pointer" }}
      />
    </Tooltip>
  );
};

export default HelpToggle;
