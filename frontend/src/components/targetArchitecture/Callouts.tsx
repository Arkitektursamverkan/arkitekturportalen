import React from "react";
import { Box, Typography } from "@mui/material";

interface Props {
  text: string;
  accent?: string;
}

/**
 * The "Beskriver" rounded box that sits below the pyramid in each domain page.
 */
export const DescribesBox: React.FC<Props> = ({ text, accent = "#5C6BC0" }) => (
  <Box
    sx={{
      p: 2,
      borderRadius: 2,
      border: "1px solid",
      borderColor: `${accent}66`,
      bgcolor: `${accent}10`,
    }}
  >
    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: accent }}>
      Beskriver
    </Typography>
    <Typography variant="body2">{text}</Typography>
  </Box>
);

/**
 * The "Svarar på" pointer next to the pyramid.
 */
export const AnswersBox: React.FC<Props> = ({ text, accent }) => (
  <Box>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: accent }}>
      Svarar på
    </Typography>
    <Typography
      variant="body2"
      component="div"
      sx={{ whiteSpace: "pre-line", color: "text.secondary" }}
    >
      {text}
    </Typography>
  </Box>
);
