import React from "react";
import { Box, Stack, Typography } from "@mui/material";

export interface FactBoxData {
  subject: string;
  bullets: string[];
  instead_of: string;
  we_say: string;
  implications: string[];
}

interface Props {
  data: FactBoxData;
  accent?: string;  // border / heading color
}

/**
 * The PDF's recurring "X är något som… / Inte / Utan / Innebär att" callout.
 */
export const FactBox: React.FC<Props> = ({ data, accent = "#5C6BC0" }) => {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderLeft: `4px solid ${accent}`,
        borderRadius: 1,
        p: 2.5,
        bgcolor: "background.paper",
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} sx={{ color: accent, mb: 1 }}>
        {data.subject} är något som:
      </Typography>
      <Box component="ul" sx={{ pl: 3, my: 0 }}>
        {data.bullets.map((b, i) => (
          <Box component="li" key={i} sx={{ mb: 0.5 }}>
            <Typography variant="body2">{b}</Typography>
          </Box>
        ))}
      </Box>

      {(data.instead_of || data.we_say) && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
          {data.instead_of && (
            <Box flex={1} sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(229,57,53,0.06)", borderLeft: "3px solid #E53935" }}>
              <Typography variant="caption" fontWeight={700} color="#C62828">Inte</Typography>
              <Typography variant="body2" sx={{ fontStyle: "italic", mt: 0.5 }}>
                "{data.instead_of}"
              </Typography>
            </Box>
          )}
          {data.we_say && (
            <Box flex={1} sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(67,160,71,0.08)", borderLeft: "3px solid #43A047" }}>
              <Typography variant="caption" fontWeight={700} color="#2E7D32">Utan</Typography>
              <Typography variant="body2" sx={{ fontStyle: "italic", mt: 0.5 }}>
                "{data.we_say}"
              </Typography>
            </Box>
          )}
        </Stack>
      )}

      {data.implications.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Innebär att
          </Typography>
          <Box component="ul" sx={{ pl: 3, my: 0 }}>
            {data.implications.map((b, i) => (
              <Box component="li" key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2">{b}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default FactBox;
