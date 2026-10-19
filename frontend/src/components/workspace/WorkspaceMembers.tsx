import React, { useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, IconButton, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  useAddMember, useDirectory, useRemoveMember, useSetMemberRole,
  type Member, type MemberRole, type Workspace,
} from "@/api/workspaces";
import { kindCopy } from "@/config/workspaceKinds";

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Ägare",
  member: "Medlem",
  reader: "Läsare",
};

const ROLE_HELP: Record<MemberRole, string> = {
  owner: "Hanterar medlemmar, inställningar och allt innehåll",
  member: "Skriver och läser innehåll",
  reader: "Läser endast",
};

interface Props {
  workspace: Workspace;
}

const WorkspaceMembers: React.FC<Props> = ({ workspace }) => {
  const isOwner = workspace.my_role === "owner";
  const copy = kindCopy(workspace.kind);
  const { data: directory = [] } = useDirectory(isOwner);
  const add = useAddMember(workspace.id);
  const setRole = useSetMemberRole(workspace.id);
  const remove = useRemoveMember(workspace.id);

  const [pick, setPick] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newRole, setNewRole] = useState<MemberRole>("member");
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(workspace.members.map((m) => m.user_id)),
    [workspace.members],
  );
  const candidates = directory.filter((u) => !memberIds.has(u.id));

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {isOwner && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }} alignItems="flex-start">
          <Autocomplete
            sx={{ minWidth: 320 }}
            size="small"
            options={candidates}
            value={pick}
            onChange={(_, v) => setPick(v)}
            getOptionLabel={(o) => `${o.name} (${o.email})`}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => <TextField {...params} label={copy.addMemberLabel} />}
          />
          <TextField
            select
            size="small"
            label="Roll"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as MemberRole)}
            sx={{ minWidth: 140 }}
          >
            {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
              <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            disabled={!pick || add.isPending}
            onClick={() =>
              run(async () => {
                if (!pick) return;
                await add.mutateAsync({ user_id: pick.id, role: newRole });
                setPick(null);
                setNewRole("member");
              })
            }
          >
            Lägg till
          </Button>
        </Stack>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Namn</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>E-post</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Roll</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Tillagd</TableCell>
            {isOwner && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {workspace.members.map((m: Member) => (
            <TableRow key={m.user_id} hover>
              <TableCell>{m.name}</TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">{m.email}</Typography>
              </TableCell>
              <TableCell>
                {isOwner ? (
                  <TextField
                    select
                    size="small"
                    value={m.role}
                    onChange={(e) =>
                      run(() =>
                        setRole.mutateAsync({ userId: m.user_id, role: e.target.value as MemberRole }),
                      )
                    }
                    sx={{ minWidth: 130 }}
                  >
                    {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
                      <MenuItem key={r} value={r}>
                        <Tooltip title={ROLE_HELP[r]} placement="right">
                          <span>{ROLE_LABEL[r]}</span>
                        </Tooltip>
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Chip size="small" label={ROLE_LABEL[m.role]} />
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {new Date(m.added_at).toLocaleDateString("sv-SE")}
                </Typography>
              </TableCell>
              {isOwner && (
                <TableCell align="right">
                  <Tooltip title={`Ta bort från ${copy.definite}`}>
                    <IconButton size="small" onClick={() => run(() => remove.mutateAsync(m.user_id))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
          {workspace.members.length === 0 && (
            <TableRow>
              <TableCell colSpan={isOwner ? 5 : 4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                Inga {copy.membersNoun} ännu.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Ägare hanterar {copy.membersNoun} och innehåll · Medlem skriver och läser · Läsare läser
        endast. Rollen gäller bara i {copy.definite}.
      </Typography>
    </Box>
  );
};

export default WorkspaceMembers;
