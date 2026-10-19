import React, { useRef, useState } from "react";
import { Menu, MenuItem, Stack, TextField, Typography, type TextFieldProps } from "@mui/material";
import { getSurveyVariables, variablePlaceholder } from "@/utils/surveyVariables";

type Props = Omit<TextFieldProps, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  // Survey's target node type (e.g. "Process", "Application") — controls
  // the wording of the @ picker's variables, e.g. "Processens namn" vs
  // "Systemets namn".
  targetNodeType: string;
};

/**
 * A TextField that opens a variable picker when the admin types "@" — lets
 * them insert a merge field (e.g. the surveyed object's name) without having
 * to remember the `{{token}}` syntax by heart.
 */
const VariableTextField: React.FC<Props> = ({ value, onChange, helperText, targetNodeType, ...textFieldProps }) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [atIndex, setAtIndex] = useState<number | null>(null);

  const filtered = getSurveyVariables(targetNodeType).filter(
    (v) =>
      v.label.toLowerCase().includes(query.toLowerCase()) ||
      v.token.toLowerCase().includes(query.toLowerCase()),
  );

  const closeMenu = () => {
    setAnchorEl(null);
    setAtIndex(null);
    setQuery("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    const uptoCaret = next.slice(0, caret);
    const match = uptoCaret.match(/@([\wåäöÅÄÖ]*)$/);
    if (match) {
      setAtIndex(caret - match[0].length);
      setQuery(match[1]);
      setAnchorEl(e.target);
    } else {
      closeMenu();
    }
  };

  const insertVariable = (token: string) => {
    if (atIndex === null) return;
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const before = value.slice(0, atIndex);
    const after = value.slice(caret);
    const insertion = variablePlaceholder(token);
    onChange(`${before}${insertion}${after}`);
    closeMenu();
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      input?.focus();
      input?.setSelectionRange(pos, pos);
    });
  };

  return (
    <>
      <TextField
        {...textFieldProps}
        value={value}
        onChange={handleChange}
        inputRef={inputRef}
        helperText={helperText ?? "Skriv @ för att infoga en variabel, t.ex. objektets namn"}
        onKeyDown={(e) => {
          if (anchorEl && e.key === "Escape") closeMenu();
        }}
      />
      <Menu
        open={Boolean(anchorEl) && filtered.length > 0}
        anchorEl={anchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
      >
        {filtered.map((v) => (
          <MenuItem key={v.token} onClick={() => insertVariable(v.token)}>
            <Stack>
              <Typography variant="body2">{v.label}</Typography>
              <Typography variant="caption" color="text.secondary">{variablePlaceholder(v.token)}</Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default VariableTextField;
