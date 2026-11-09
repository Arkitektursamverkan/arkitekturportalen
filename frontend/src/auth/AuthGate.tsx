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
import { useTranslation } from "react-i18next";
import MicrosoftIcon from "@mui/icons-material/Microsoft";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loginRequest } from "./msalConfig";
import { describeAuthError } from "./msal";
import { hasValidLocalToken, setLocalToken } from "./localSession";
import { apiClient } from "@/api/client";
import { orgLogoUrl, usePublicOrgSettings } from "@/api/orgSettings";

interface Props {
  children: React.ReactNode;
  /** Sant när MSAL är initierad och MsalProvider finns ovanför (Entra inställt). */
  msalEnabled: boolean;
  /** Fel från inloggningssvaret eller MSAL:s start (se initMsal). */
  initialError?: unknown;
}

const AuthGate: React.FC<Props> = ({ children, msalEnabled, initialError }) => {
  const { t } = useTranslation();
  // Utan MsalProvider ger hookarna MSAL:s tomma standardkontext (ingen
  // inloggning, inget pågår); instansen anropas bara när msalEnabled är sant.
  const isMsalAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  const [error, setError] = useState<string | null>(
    initialError ? describeAuthError(initialError) : null,
  );
  const [hasLocal, setHasLocal] = useState<boolean>(hasValidLocalToken());

  useEffect(() => {
    const refresh = () => setHasLocal(hasValidLocalToken());
    window.addEventListener("ea-local-token-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ea-local-token-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const isAuthenticated = (msalEnabled && isMsalAuthenticated) || hasLocal;
  const { data: org } = usePublicOrgSettings();
  // A new installation has no accounts: the first visit creates the administrator.
  const { data: setup } = useQuery({
    queryKey: ["auth-setup"],
    queryFn: () => apiClient.get<{ needed: boolean }>("/auth/setup").then((r) => r.data),
    enabled: !isAuthenticated,
    retry: false,
  });
  const logoSrc = orgLogoUrl(org?.logo_version ?? null);
  // The organisation's colour on the sign-in button; the app keeps its theme.
  const brandSx = org?.brand_color
    ? { bgcolor: org.brand_color, "&:hover": { bgcolor: org.brand_color, filter: "brightness(0.9)" } }
    : {};

  if (msalEnabled && inProgress !== InteractionStatus.None) {
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
          {t("app.title")}
        </Typography>
        {org?.org_name && (
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {org.org_name}
          </Typography>
        )}
        <Typography variant="body1" sx={{ mb: 4, color: "text.secondary" }}>
          Logga in för att fortsätta.
        </Typography>

        {msalEnabled && (
          <>
            <Button
              variant="contained"
              size="large"
              startIcon={<MicrosoftIcon />}
              onClick={() => {
                setError(null);
                instance.loginRedirect(loginRequest).catch((e) => setError(describeAuthError(e)));
              }}
              sx={{ minWidth: 280, ...brandSx }}
            >
              Logga in med Microsoft
            </Button>
            <Divider sx={{ width: 280, my: 3 }}>eller</Divider>
          </>
        )}

        {setup?.needed ? (
          <FirstAdminForm onSuccess={() => setHasLocal(true)} onError={(e) => setError(e || null)} />
        ) : (
          <LocalLoginForm onSuccess={() => setHasLocal(true)} onError={(e) => setError(e || null)} />
        )}

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

const FirstAdminForm: React.FC<LocalLoginFormProps> = ({ onSuccess, onError }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    onError("");
    try {
      const { data } = await apiClient.post<{ token: string }>("/auth/setup", { name, email, password });
      setLocalToken(data.token);
      qc.invalidateQueries();
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Kontot kunde inte skapas");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: 280 }}>
      <Typography variant="overline" sx={{ color: "text.secondary", textAlign: "center" }}>
        Första administratören
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Portalen har inga konton än. Skapa administratörskontot – du loggar sedan in med e-posten.
      </Typography>
      <TextField label="Namn" value={name} onChange={(e) => setName(e.target.value)} size="small" required autoComplete="name" />
      <TextField label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} size="small" required autoComplete="email" />
      <TextField
        label="Lösenord"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        size="small"
        required
        autoComplete="new-password"
        helperText="Minst 8 tecken"
      />
      <Button type="submit" variant="contained" disabled={submitting || !name || !email || password.length < 8}>
        {submitting ? "Skapar kontot…" : "Skapa administratörskontot"}
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
