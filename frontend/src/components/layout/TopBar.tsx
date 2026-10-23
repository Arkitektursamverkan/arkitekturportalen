import React, { useState } from "react";
import {
  AppBar, Badge, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, InputBase, Stack, Toolbar,
  Tooltip, Typography, Paper, List, TextField,
  ListItemButton, ListItemText, CircularProgress,
  Menu, MenuItem, Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import NotificationsIcon from "@mui/icons-material/Notifications";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import SchemaIcon from "@mui/icons-material/Schema";
import { useAdminNotifications, useSubmitGlossaryRequest } from "@/api/adminNotifications";
import { useMySurveys } from "@/api/mySurveys";
import { useModules } from "@/api/orgSettings";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { useUiStore } from "@/store/uiStore";
import { useThemeStore } from "@/store/themeStore";
import { useRoleStore } from "@/store/roleStore";
import { useSearch } from "@/api/search";
import { NODE_COLORS } from "@/config/graphConfig";
import { ARKITEKTEN_URL } from "@/config/modules";
import { isAuthConfigured } from "@/auth/msalConfig";
import { clearLocalToken, hasValidLocalToken } from "@/auth/localSession";
import AboutDialog from "./AboutDialog";

const TopBar: React.FC = () => {
  const { t } = useTranslation();
  const { toggleSidebar } = useUiStore();
  const { logoBase64, logoUrl } = useThemeStore();
  const { role, name, email, isAdmin, isEditor } = useRoleStore();
  const { enabled: moduleOn } = useModules();
  const { data: notifications } = useAdminNotifications(isEditor);
  const notificationCount =
    (notifications?.pending_comments.length ?? 0) +
    (notifications?.help_requests.length ?? 0) +
    (moduleOn("glossary") ? notifications?.glossary_requests.length ?? 0 : 0) +
    (notifications?.node_deletions.length ?? 0) +
    (notifications?.change_proposals?.length ?? 0) +
    (moduleOn("calendar") ? notifications?.calendar_proposals?.length ?? 0 : 0);
  const { data: mySurveys } = useMySurveys(moduleOn("surveys"));
  const pendingSurveyCount = (mySurveys ?? []).filter((r) => r.status === "pending" && r.survey_status === "open").length;
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);

  // Glossary request dialog
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossTerm, setGlossTerm] = useState("");
  const [glossContext, setGlossContext] = useState("");
  const [glossSubmitted, setGlossSubmitted] = useState(false);
  const submitRequest = useSubmitGlossaryRequest();

  const handleOpenGlossary = () => {
    setGlossTerm("");
    setGlossContext("");
    setGlossSubmitted(false);
    setGlossaryOpen(true);
  };

  const handleSubmitRequest = async () => {
    await submitRequest.mutateAsync({ term: glossTerm.trim(), context: glossContext.trim() || undefined });
    setGlossSubmitted(true);
  };

  const { data: searchResults, isLoading: searching } = useSearch(searchQ);
  const logoSrc = logoBase64 || logoUrl || "";

  const handleSearchSelect = (id: string, type: string) => {
    setSearchQ("");
    setSearchOpen(false);
    if (type === "Process") navigate(`/processes?id=${id}`);
    else if (type === "Application") navigate(`/systems?id=${id}`);
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton color="inherit" edge="start" onClick={toggleSidebar} sx={{ mr: 1 }}>
          <MenuIcon />
        </IconButton>

        {/* Logo or title */}
        {logoSrc ? (
          <Box
            component="img"
            src={logoSrc}
            alt="Logo"
            sx={{ height: 36, maxWidth: 140, objectFit: "contain", mr: 2, cursor: "pointer" }}
            onClick={() => navigate("/")}
          />
        ) : (
          <Typography
            variant="h6"
            onClick={() => navigate("/")}
            sx={{ fontWeight: 700, mr: 3, cursor: "pointer" }}>
            {t("app.title")}
          </Typography>
        )}

        {/* Search */}
        <Box sx={{ position: "relative", flexGrow: 1, maxWidth: 400 }}>
          <Box sx={{
            display: "flex", alignItems: "center", bgcolor: "rgba(255,255,255,0.15)",
            borderRadius: 1, px: 1.5, py: 0.5,
          }}>
            <SearchIcon fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
            <InputBase
              placeholder={t("common.search")}
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              sx={{ color: "inherit", fontSize: 14, width: "100%" }}
            />
            {searching && <CircularProgress size={14} sx={{ color: "inherit" }} />}
          </Box>
          {searchOpen && searchResults && searchResults.length > 0 && (
            <Paper sx={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1300, maxHeight: 240, overflow: "auto" }}>
              <List dense>
                {searchResults.map((n) => (
                  <ListItemButton key={n.id} onMouseDown={() => handleSearchSelect(n.id, n.type)}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[n.type], mr: 1, flexShrink: 0 }} />
                    <ListItemText primary={n.name} secondary={t(`nodeTypes.${n.type}`)} />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* About the EA Portal */}
        <AboutDialog />

        {/* Arkitekten (processritaren) — its own service, opened in a new tab */}
        {moduleOn("arkitekten") && ARKITEKTEN_URL && (
          <Tooltip title={t("flowScene.openArkitekten")}>
            <IconButton
              color="inherit"
              component="a"
              href={ARKITEKTEN_URL}
              target="_blank"
              rel="noopener"
              aria-label={t("flowScene.openArkitekten")}
              sx={{ mr: 0.5 }}
            >
              <SchemaIcon />
            </IconButton>
          </Tooltip>
        )}

        {/* Glossary request — all authenticated users */}
        {moduleOn("glossary") && (
        <Tooltip title="Saknar du ett begrepp i ordlistan?">
          <IconButton color="inherit" onClick={handleOpenGlossary} sx={{ mr: 0.5 }}>
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        )}

        {/* My surveys — all authenticated users */}
        {moduleOn("surveys") && (
        <Tooltip title={pendingSurveyCount > 0 ? `${pendingSurveyCount} enkät${pendingSurveyCount > 1 ? "er" : ""} att svara på` : "Inga enkäter att svara på"}>
          <IconButton color="inherit" onClick={() => navigate("/my-surveys")} sx={{ mr: 0.5 }}>
            <Badge badgeContent={pendingSurveyCount} color="warning">
              {pendingSurveyCount > 0 ? <AssignmentLateIcon /> : <AssignmentTurnedInIcon />}
            </Badge>
          </IconButton>
        </Tooltip>
        )}

        {/* Notifications (editor+) */}
        {isEditor && (
          <Tooltip title={notificationCount > 0 ? `${notificationCount} ärende${notificationCount > 1 ? "n" : ""}` : "Inga ärenden"}>
            <IconButton color="inherit" onClick={() => navigate("/notifications")} sx={{ mr: 0.5 }}>
              <Badge badgeContent={notificationCount} color="warning">
                {notificationCount > 0 ? <NotificationsIcon /> : <NotificationsNoneIcon />}
              </Badge>
            </IconButton>
          </Tooltip>
        )}

        {/* Role badge */}
        <Box sx={{
          bgcolor:
            role === "admin"
              ? "rgba(255,255,255,0.2)"
              : role === "superuser"
              ? "rgba(255,255,255,0.15)"
              : "rgba(255,255,255,0.1)",
          borderRadius: 1, px: 1.5, py: 0.5, mr: 1,
        }}>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {role === "admin"
              ? "Administratör"
              : role === "superuser"
              ? "Superanvändare"
              : role === "system"
              ? "System"
              : "Användare"}
          </Typography>
        </Box>

        {/* User menu */}
        <Tooltip title={name || "Konto"}>
          <IconButton color="inherit" onClick={(e) => setUserMenuAnchor(e.currentTarget)}>
            <AccountCircleIcon />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={userMenuAnchor}
          open={Boolean(userMenuAnchor)}
          onClose={() => setUserMenuAnchor(null)}
        >
          {(name || email) && [
            <Box key="info" sx={{ px: 2, py: 1 }}>
              {name && <Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography>}
              {email && <Typography variant="caption" sx={{ color: "text.secondary" }}>{email}</Typography>}
            </Box>,
            <Divider key="div" />,
          ]}
          <MenuItem
            onClick={() => {
              setUserMenuAnchor(null);
              navigate("/settings");
            }}
          >
            <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
            {t("nav.settings")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setUserMenuAnchor(null);
              if (hasValidLocalToken()) {
                clearLocalToken();
                window.location.reload();
              } else if (isAuthConfigured) {
                instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
              } else {
                window.location.reload();
              }
            }}
          >
            <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
            Logga ut
          </MenuItem>
        </Menu>
      </Toolbar>

      {/* Glossary request dialog */}
      <Dialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Saknar du ett begrepp?</DialogTitle>
        <DialogContent>
          {glossSubmitted ? (
            <Typography sx={{ py: 1 }}>
              Tack! Din förfrågan har skickats och granskas av en administratör.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Begrepp"
                value={glossTerm}
                onChange={(e) => setGlossTerm(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <TextField
                label="Sammanhang (valfritt)"
                value={glossContext}
                onChange={(e) => setGlossContext(e.target.value)}
                multiline
                rows={3}
                fullWidth
                placeholder="Beskriv i vilket sammanhang du stöter på begreppet"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {glossSubmitted ? (
            <Button onClick={() => setGlossaryOpen(false)}>Stäng</Button>
          ) : (
            <>
              <Button onClick={() => setGlossaryOpen(false)}>Avbryt</Button>
              <Button
                variant="contained"
                onClick={handleSubmitRequest}
                disabled={!glossTerm.trim() || submitRequest.isPending}
              >
                Skicka
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </AppBar>
  );
};

export default TopBar;
