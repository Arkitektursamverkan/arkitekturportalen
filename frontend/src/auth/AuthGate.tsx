import React, { useEffect, useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import MicrosoftIcon from "@mui/icons-material/Microsoft";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthConfigured, loginRequest } from "./msalConfig";
import { hasValidLocalToken, setLocalToken } from "./localSession";
import { apiClient } from "@/api/client";
import { orgLogoUrl, usePublicOrgSettings } from "@/api/orgSettings";

interface Props {
  children: React.ReactNode;
}

const AuthGate: React.FC<Props> = ({ children }) => {
  const isMsalAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  const [error, setError] = useState<string | null>(null);
  const [hasLocal, setHasLocal] = useState<boolean>(hasValidLocalToken());

  useEffect(() => {
    instance.handleRedirectPromise().catch((e) => setError(e?.message ?? "Login failed"));
  }, [instance]);

  useEffect(() => {
    const refresh = () => setHasLocal(hasValidLocalToken());
    window.addEventListener("ea-local-token-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ea-local-token-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const isAuthenticated = isMsalAuthenticated || hasLocal;
  const { data: org } = usePublicOrgSettings();
  const logoSrc = orgLogoUrl(org?.logo_version ?? null);
  // The organisation's colour on the sign-in button; the app keeps its theme.
  const brandSx = org?.brand_color
    ? { bgcolor: org.brand_color, "&:hover": { bgcolor: org.brand_color, filter: "brightness(0.9)" } }
    : {};

  if (inProgress !== InteractionStatus.None) {
    return (
      <CenterBox>
        <CircularProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Loggar in…
        </Typography>
      </CenterBox>
    );
  }

  if (!isAuthenticated) {
    return (
      <CenterBox>
        {logoSrc && (
          <Box component="img" src={logoSrc} alt={org?.org_name ?? ""} sx={{ maxHeight: 72, maxWidth: 240, objectFit: "contain", mb: 3 }} />
        )}
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          EA-portalen
        </Typography>
        {org?.org_name && (
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {org.org_name}
          </Typography>
        )}
        <Typography variant="body1" sx={{ mb: 4, color: "text.secondary" }}>
          Logga in för att fortsätta.
        </Typography>

        {isAuthConfigured && (
          <>
            <Button
              variant="contained"
              size="large"
              startIcon={<MicrosoftIcon />}
              onClick={() => {
                setError(null);
                instance.loginRedirect(loginRequest).catch((e) =>
                  setError(e?.message ?? "Login failed"),
                );
              }}
              sx={{ minWidth: 280, ...brandSx }}
            >
              Logga in med Microsoft
            </Button>
            <Divider sx={{ width: 280, my: 3 }}>eller</Divider>
          </>
        )}

        <LocalLoginForm onSuccess={() => setHasLocal(true)} onError={setError} />

        {error && (
          <Alert severity="error" sx={{ mt: 2, maxWidth: 400 }}>
            {error}
          </Alert>
        )}
      </CenterBox>
    );
  }

  return <>{children}</>;
};

interface LocalLoginFormProps {
  onSuccess: () => void;
  onError: (e: string) => void;
}

const LocalLoginForm: React.FC<LocalLoginFormProps> = ({ onSuccess, onError }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    onError("");
    try {
      const { data } = await apiClient.post<{ token: string }>("/auth/login", {
        email,
        password,
      });
      setLocalToken(data.token);
      qc.invalidateQueries();
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Inloggning misslyckades");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: 280 }}>
      <Typography variant="overline" sx={{ color: "text.secondary", textAlign: "center" }}>
        Lokalt konto
      </Typography>
      <TextField
        label="E-post"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        size="small"
        required
        autoComplete="email"
      />
      <TextField
        label="Lösenord"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        size="small"
        required
        autoComplete="current-password"
      />
      <Button
        type="submit"
        variant="outlined"
        startIcon={<LoginIcon />}
        disabled={submitting || !email || !password}
      >
        {submitting ? "Loggar in…" : "Logga in"}
      </Button>
    </Box>
  );
};

const CenterBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      p: 3,
    }}
  >
    <Stack spacing={1} sx={{ alignItems: "center" }}>
      {children}
    </Stack>
  </Box>
);

export default AuthGate;
