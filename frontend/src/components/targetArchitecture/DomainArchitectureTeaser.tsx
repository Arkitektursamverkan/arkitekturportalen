import React from "react";
import { Box, Button, Grid, Paper, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useModules } from "@/api/orgSettings";
import LaunchIcon from "@mui/icons-material/Launch";
import { useTargetArchitecture, type DomainKey, type DomainSection } from "@/api/targetArchitecture";
import { DomainPyramid } from "./DomainPyramid";
import { DescribesBox, AnswersBox } from "./Callouts";

const DOMAIN_ACCENTS: Record<DomainKey, string> = {
  business: "#4CAF50",
  data: "#FF9800",
  application: "#2196F3",
  technology: "#9C27B0",
};

interface Props {
  domainKey: DomainKey;
}

/**
 * Compact preview of a domain's target architecture: small pyramid +
 * Svarar på / Beskriver + a "Läs mer" link.
 * Used as an empty-state header on each domain explorer page.
 *
 * Picks the first DomainSection with matching domain_key from the
 * target-architecture sections list.
 */
export const DomainArchitectureTeaser: React.FC<Props> = ({ domainKey }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Nothing to show without Arkitekturstyrning, whose document this is.
  const { data } = useTargetArchitecture(useModules().enabled("governance"));
  const domain = data?.content.sections.find(
    (s): s is DomainSection => s.kind === "domain" && s.domain_key === domainKey,
  );
  if (!domain) return null;
  const accent = DOMAIN_ACCENTS[domainKey];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderLeft: `4px solid ${accent}`,
        maxWidth: 900,
        width: "100%",
        mx: "auto",
        my: 2,
      }}
    >
      <Grid container spacing={2} sx={{ alignItems: "center" }}>
        <Grid size={{ xs: 12, sm: 5 }}>
          <DomainPyramid highlight={domainKey} height={200} />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Stack spacing={1.5}>
            {domain.answers && <AnswersBox text={domain.answers} accent={accent} />}
            {domain.describes && <DescribesBox text={domain.describes} accent={accent} />}
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                variant="text"
                endIcon={<LaunchIcon fontSize="small" />}
                onClick={() => navigate(`/target-architecture#section-${domain.id}`)}
              >
                {t("targetArchitecture.readMore", { defaultValue: "Läs mer" })}
              </Button>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default DomainArchitectureTeaser;
