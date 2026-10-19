import React from "react";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { DIRECTION_GLYPHS, INTEGRATION_DIRECTIONS } from "@/config/graphConfig";
import type { IntegrationDirection } from "@/types/graph";

interface Props {
  value: IntegrationDirection;
  onChange: (direction: IntegrationDirection) => void;
  /** Names of the two ends, used so the options read as real sentences. */
  sourceName?: string;
  targetName?: string;
  disabled?: boolean;
  /**
   * "compact" — three glyph buttons (→ ↔ ←) for rows and panels that already
   * show which end is which. "verbose" — spelled-out options naming both
   * systems, for the create forms where nothing else gives that away.
   */
  variant?: "compact" | "verbose";
}

/** Picker for which way an integration flows. */
const IntegrationDirectionSelect: React.FC<Props> = ({
  value,
  onChange,
  sourceName,
  targetName,
  disabled = false,
  variant = "compact",
}) => {
  const { t } = useTranslation();

  const source = sourceName || t("integrationDirection.placeholder.source");
  const target = targetName || t("integrationDirection.placeholder.target");

  /** The sentence the option makes, e.g. "Agda skickar information till Aveny". */
  const sentence = (direction: IntegrationDirection) =>
    t(`integrationDirection.sentence.${direction}`, { source, target });

  /** Ends in reading order — a "←" option is shown as "target → source", so
   *  the arrow always points the same way the words do. */
  const ends = (direction: IntegrationDirection) =>
    direction === "TARGET_TO_SOURCE"
      ? { from: target, to: source, glyph: "→" }
      : { from: source, to: target, glyph: DIRECTION_GLYPHS[direction] };

  const handleChange = (_: unknown, v: unknown) => {
    if (v) onChange(v as IntegrationDirection);
  };

  if (variant === "compact") {
    return (
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        disabled={disabled}
        onChange={handleChange}
        aria-label={t("integrationDirection.label")}
        sx={{ flexShrink: 0 }}
      >
        {INTEGRATION_DIRECTIONS.map((direction) => (
          <Tooltip key={direction} title={sentence(direction)} placement="top">
            <ToggleButton value={direction} sx={{ px: 1.25, py: 0.25, lineHeight: 1.4 }}>
              {DIRECTION_GLYPHS[direction]}
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    );
  }

  return (
    <Box>
      <Typography variant="body2" fontWeight={600} mb={0.25}>
        {t("integrationDirection.question")}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
        {t("integrationDirection.helper")}
      </Typography>
      <ToggleButtonGroup
        exclusive
        orientation="vertical"
        size="small"
        value={value}
        disabled={disabled}
        onChange={handleChange}
        aria-label={t("integrationDirection.label")}
        sx={{ width: "100%", maxWidth: 560 }}
      >
        {INTEGRATION_DIRECTIONS.map((direction) => {
          const { from, to, glyph } = ends(direction);
          return (
            <ToggleButton
              key={direction}
              value={direction}
              sx={{ justifyContent: "flex-start", textAlign: "left", textTransform: "none", py: 1 }}
            >
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600}>{from}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ fontSize: 16, lineHeight: 1 }}>
                    {glyph}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{to}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "none" }}>
                  {sentence(direction)}
                </Typography>
              </Stack>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
    </Box>
  );
};

export default IntegrationDirectionSelect;
