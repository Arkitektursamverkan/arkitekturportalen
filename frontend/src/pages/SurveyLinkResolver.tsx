import React from "react";
import { Alert, Box, CircularProgress, Container } from "@mui/material";
import { Navigate, useParams } from "react-router-dom";
import { useResolveSurveyToken } from "@/api/mySurveys";

const SurveyLinkResolver: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, error } = useResolveSurveyToken(token);

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}><CircularProgress /></Box>
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : "Länken är ogiltig eller inte kopplad till ditt konto."}
        </Alert>
      </Container>
    );
  }

  return <Navigate to={`/my-surveys/${data.id}`} replace />;
};

export default SurveyLinkResolver;
