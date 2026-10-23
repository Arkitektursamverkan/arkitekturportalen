import React from "react";
import {
  Box, Button, Checkbox, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup,
  Stack, TextField, Typography,
} from "@mui/material";
import type { AnswerValue } from "@/api/mySurveys";
import type { Question } from "@/api/surveys";
import SystemPicker from "@/components/surveys/SystemPicker";
import { renderSurveyText } from "@/utils/surveyVariables";

/**
 * Renders one survey question exactly as a respondent sees it. Shared by the
 * respond page and the admin's form preview so the two can never drift apart.
 */
const QuestionField: React.FC<{
  question: Question;
  value: AnswerValue | undefined;
  disabled: boolean;
  nodeId: string | undefined;
  variableValues: Record<string, string>;
  onChange: (value: AnswerValue) => void;
}> = ({ question, value, disabled, nodeId, variableValues, onChange }) => {
  const resolvedLabel = renderSurveyText(question.label, variableValues);
  const resolvedHelpText = question.help_text ? renderSurveyText(question.help_text, variableValues) : question.help_text;
  const label = question.required ? `${resolvedLabel} *` : resolvedLabel;

  switch (question.type) {
    case "text":
      return (
        <TextField
          label={label}
          helperText={resolvedHelpText}
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
      );
    case "yes_no":
      return (
        <FormControl>
          <FormLabel>{label}</FormLabel>
          {resolvedHelpText && <Typography variant="caption" sx={{ color: "text.secondary" }}>{resolvedHelpText}</Typography>}
          <RadioGroup
            row
            value={value === true ? "yes" : value === false ? "no" : ""}
            onChange={(e) => onChange(e.target.value === "yes")}
          >
            <FormControlLabel value="yes" control={<Radio disabled={disabled} />} label="Ja" />
            <FormControlLabel value="no" control={<Radio disabled={disabled} />} label="Nej" />
          </RadioGroup>
        </FormControl>
      );
    case "multiple_choice": {
      const options = question.options ?? [];
      if (question.allow_multiple) {
        const selected = (value as string[]) ?? [];
        return (
          <FormControl>
            <FormLabel>{label}</FormLabel>
            {resolvedHelpText && <Typography variant="caption" sx={{ color: "text.secondary" }}>{resolvedHelpText}</Typography>}
            <Stack>
              {options.map((opt) => (
                <FormControlLabel
                  key={opt}
                  control={
                    <Checkbox
                      checked={selected.includes(opt)}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, opt]
                          : selected.filter((o) => o !== opt);
                        onChange(next);
                      }}
                    />
                  }
                  label={opt}
                />
              ))}
            </Stack>
          </FormControl>
        );
      }
      const single = ((value as string[]) ?? [])[0] ?? "";
      return (
        <FormControl>
          <FormLabel>{label}</FormLabel>
          {resolvedHelpText && <Typography variant="caption" sx={{ color: "text.secondary" }}>{resolvedHelpText}</Typography>}
          <RadioGroup value={single} onChange={(e) => onChange([e.target.value])}>
            {options.map((opt) => (
              <FormControlLabel key={opt} value={opt} control={<Radio disabled={disabled} />} label={opt} />
            ))}
          </RadioGroup>
        </FormControl>
      );
    }
    case "rating": {
      const min = question.scale_min ?? 0;
      const max = question.scale_max ?? 10;
      const scaleValues = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
      const selected = typeof value === "number" ? value : undefined;
      return (
        <Box>
          <FormLabel>{label}</FormLabel>
          {resolvedHelpText && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>{resolvedHelpText}</Typography>
          )}
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", mt: 1 }}>
            {question.scale_min_emoji && <Typography sx={{ mr: 1, fontSize: 20 }}>{question.scale_min_emoji}</Typography>}
            {scaleValues.map((n) => (
              <Button
                key={n}
                size="small"
                variant={selected === n ? "contained" : "outlined"}
                disabled={disabled}
                onClick={() => onChange(n)}
                sx={{ minWidth: 40, px: 0 }}
              >
                {n}
              </Button>
            ))}
            {question.scale_max_emoji && <Typography sx={{ ml: 1, fontSize: 20 }}>{question.scale_max_emoji}</Typography>}
          </Stack>
          {(question.scale_min_label || question.scale_max_label) && (
            <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{question.scale_min_label ?? ""}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{question.scale_max_label ?? ""}</Typography>
            </Stack>
          )}
        </Box>
      );
    }
    case "rating_matrix": {
      const min = question.scale_min ?? 1;
      const max = question.scale_max ?? 10;
      const scaleValues = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
      const rows = (question.rows ?? []).filter(Boolean);
      const filled = (value as Record<string, number> | undefined) ?? {};
      return (
        <Box>
          <FormLabel>{label}</FormLabel>
          {resolvedHelpText && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>{resolvedHelpText}</Typography>
          )}
          {(question.scale_min_label || question.scale_max_label) && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
              {min} = {question.scale_min_label ?? "lägsta"} · {max} = {question.scale_max_label ?? "högsta"}
            </Typography>
          )}
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {rows.map((row) => (
              <Box key={row}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{row}</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  {scaleValues.map((n) => (
                    <Button
                      key={n}
                      size="small"
                      variant={filled[row] === n ? "contained" : "outlined"}
                      disabled={disabled}
                      onClick={() => onChange({ ...filled, [row]: n })}
                      sx={{ minWidth: 40, px: 0 }}
                    >
                      {n}
                    </Button>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      );
    }
    case "system_picker":
      return (
        <Box>
          <FormLabel>{label}</FormLabel>
          {resolvedHelpText && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>{resolvedHelpText}</Typography>
          )}
          <SystemPicker
            nodeTypeFilter={question.node_type_filter}
            allowMultiple={question.allow_multiple ?? true}
            value={(value as string[]) ?? []}
            onChange={(ids) => onChange(ids)}
            excludeNodeId={nodeId}
          />
        </Box>
      );
    default:
      return null;
  }
};

export default QuestionField;
