import React from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { SurveyReport } from "@/api/surveys";

/**
 * The body of a compiled report: its selection and one block per included
 * response. Shared by the live report in the survey editor and by a published
 * edition under "Rapporter" — a published report is the same payload, frozen,
 * so the two must look the same.
 */
const ReportBody: React.FC<{ report: SurveyReport }> = ({ report }) => (
  <>
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle2" gutterBottom>Urval</Typography>
      {report.conditions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Inget villkor — samtliga inkomna svar tas med.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {report.conditions.map((condition) => (
            <Chip key={condition} label={condition} size="small" />
          ))}
        </Stack>
      )}
      {report.questions.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Ingen fråga är märkt med den här rapporten ännu. Märk frågorna i enkätens
          rapportinställningar för att få med deras svar här.
        </Alert>
      )}
    </Paper>

    {report.rows.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        Inga svar uppfyller rapportens urval.
      </Typography>
    ) : (
      <Stack spacing={2}>
        {report.rows.map((row) => (
          <Paper key={row.response_id} variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {row.object_name || row.recipient || "Utan objekt"}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {/* Anonymised reports arrive with the name fields already
                  emptied by the backend — only the date is left to show. */}
              {report.anonymous
                ? row.submitted_at
                : `${row.submitted_by || row.recipient || "okänd"}${row.submitted_at ? ` · ${row.submitted_at}` : ""}`}
            </Typography>
            {report.questions.map((question) => (
              <Box key={question.id} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">{question.label}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {row.answers[question.id] || "—"}
                </Typography>
              </Box>
            ))}
          </Paper>
        ))}
      </Stack>
    )}
  </>
);

export default ReportBody;
