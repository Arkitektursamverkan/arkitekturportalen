import DirectoryPanel from "@/components/users/DirectoryPanel";
import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import KeyIcon from "@mui/icons-material/Key";
import { useCurrentUser } from "@/api/me";
import { useGroups } from "@/api/access";
import { useNavigate } from "react-router-dom";
import ProvisionUsersDialog from "@/components/users/ProvisionUsersDialog";
import {
  useCreateLocalUser,
  useResetUserPassword,
  useUpdateUserRole,
  useUsers,
  type AppUser,
  type LocalUserCreate,
  type UserRole,
} from "@/api/users";

const UserManagement: React.FC = () => {
  const { data: me } = useCurrentUser();
  const { data: users, isLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const { data: groups = [] } = useGroups();
  const navigate = useNavigate();
  const createLocal = useCreateLocalUser();
  const resetPwd = useResetUserPassword();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [pwdResetUser, setPwdResetUser] = useState<AppUser | null>(null);

  const adminCount = (users ?? []).filter((u) => u.role === "admin").length;

  const changeRole = async (u: AppUser, newRole: UserRole) => {
    if (newRole === u.role) return;
    setError(null);
    try {
      await updateRole.mutateAsync({ id: u.id, role: newRole });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ändra roll");
    }
  };

  const groupsOf = (userId: string) => groups.filter((g) => g.members.some((m) => m.id === userId));

  const ROLE_LABEL: Record<UserRole, string> = {
    user: "Användare",
    superuser: "Superanvändare",
    admin: "Administratör",
  };
  const ROLE_COLOR: Record<UserRole, "default" | "primary" | "secondary"> = {
    user: "default",
    superuser: "secondary",
    admin: "primary",
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Användare
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<PlaylistAddCheckIcon />}
            variant="outlined"
            onClick={() => setProvisionOpen(true)}
          >
            Förbered användare
          </Button>
          <Button startIcon={<PersonAddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
            Lägg till lokalt konto
          </Button>
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Lista över personer som loggat in i appen, konton som förberetts från systemrollerna,
        samt lokala konton som skapats här.
        Välj roll i menyn: Användare (läsa), Superanvändare (skapa/redigera objekt och kopplingar),
        eller Administratör (alla rättigheter). Den sista administratören kan inte degraderas.
      </Typography>
      <DirectoryPanel />
      <Alert
        severity="info"
        variant="outlined"
        sx={{ mb: 3 }}
        action={<Button size="small" onClick={() => navigate("/access")}>Behörigheter</Button>}
      >
        Vem som ser och får göra vad med objekten – till exempel Servrar, eller vem som förvaltar en viss
        process eller applikation – bestäms under Behörigheter, med grupper och tilldelningar.
      </Alert>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Namn</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>E-post</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Typ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Roll</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <Tooltip title="Behörighetsgrupper användaren är med i. Hanteras under Behörigheter.">
                    <span>Grupper</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Senaste inloggning</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(users ?? []).map((u) => {
                const isMe = me?.id === u.id;
                const isLastAdmin = u.role === "admin" && adminCount <= 1;
                const role = (u.role === "system" ? "admin" : u.role) as UserRole;
                const disabled = updateRole.isPending || isLastAdmin;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2">{u.name}</Typography>
                        {isMe && (
                          <Chip label="Du" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {u.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.is_provisioned ? "Inväntar inloggning" : u.is_local ? "Lokalt konto" : "Microsoft"}
                        size="small"
                        variant="outlined"
                        color={u.is_provisioned ? "warning" : u.is_local ? "default" : "info"}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={isLastAdmin ? "Sista administratören kan inte degraderas" : ""}>
                        <span>
                          <Select
                            size="small"
                            value={role}
                            disabled={disabled}
                            onChange={(e) => changeRole(u, e.target.value as UserRole)}
                            sx={{
                              minWidth: 160,
                              "& .MuiSelect-select": { py: 0.5 },
                            }}
                            renderValue={(v) => (
                              <Chip
                                label={ROLE_LABEL[v as UserRole]}
                                size="small"
                                color={ROLE_COLOR[v as UserRole]}
                                variant={v === "user" ? "outlined" : "filled"}
                              />
                            )}
                          >
                            <MenuItem value="user">Användare</MenuItem>
                            <MenuItem value="superuser">Superanvändare</MenuItem>
                            <MenuItem value="admin">Administratör</MenuItem>
                          </Select>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {role === "admin" ? (
                        <Chip label="Full åtkomst" size="small" variant="outlined" />
                      ) : (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {groupsOf(u.id).map((g) => <Chip key={g.id} label={g.name} size="small" variant="outlined" />)}
                          {groupsOf(u.id).length === 0 && <Typography variant="body2" color="text.secondary">–</Typography>}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString("sv-SE") : "–"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {u.is_local && (
                        <Tooltip title="Återställ lösenord">
                          <IconButton size="small" onClick={() => setPwdResetUser(u)}>
                            <KeyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(users ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    Inga användare än.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ProvisionUsersDialog open={provisionOpen} onClose={() => setProvisionOpen(false)} />

      <CreateLocalUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (data) => {
          setError(null);
          try {
            await createLocal.mutateAsync(data);
            setCreateOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte skapa kontot");
          }
        }}
        submitting={createLocal.isPending}
      />

      <PasswordResetDialog
        user={pwdResetUser}
        onClose={() => setPwdResetUser(null)}
        onSubmit={async (password) => {
          if (!pwdResetUser) return;
          setError(null);
          try {
            await resetPwd.mutateAsync({ id: pwdResetUser.id, password });
            setPwdResetUser(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte återställa lösenordet");
          }
        }}
        submitting={resetPwd.isPending}
      />
    </Box>
  );
};

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: LocalUserCreate) => Promise<void>;
  submitting: boolean;
}

const CreateLocalUserDialog: React.FC<CreateProps> = ({ open, onClose, onSubmit, submitting }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("user");
  };

  const valid = name.trim() && email.trim() && password.length >= 8;

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Lägg till lokalt konto</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Namn" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <TextField label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField
            label="Lösenord"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText="Minst 8 tecken"
          />
          <TextField select label="Roll" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <MenuItem value="user">Användare</MenuItem>
            <MenuItem value="superuser">Superanvändare</MenuItem>
            <MenuItem value="admin">Administratör</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={!valid || submitting}
          onClick={async () => {
            await onSubmit({ name, email, password, role });
            reset();
          }}
        >
          {submitting ? "Sparar…" : "Skapa"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface PwdProps {
  user: AppUser | null;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  submitting: boolean;
}

const PasswordResetDialog: React.FC<PwdProps> = ({ user, onClose, onSubmit, submitting }) => {
  const [password, setPassword] = useState("");

  return (
    <Dialog
      open={user !== null}
      onClose={() => {
        setPassword("");
        onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Återställ lösenord</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Ange ett nytt lösenord för <strong>{user?.name}</strong> ({user?.email}).
        </Typography>
        <TextField
          label="Nytt lösenord"
          type="password"
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          helperText="Minst 8 tecken"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setPassword(""); onClose(); }}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={password.length < 8 || submitting}
          onClick={async () => {
            await onSubmit(password);
            setPassword("");
          }}
        >
          {submitting ? "Sparar…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserManagement;
