import React, { useState } from "react";
import {
  Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  useCreateTask, useDeleteTask, useUpdateTask, useWorkspaceTasks,
  type Member, type TaskStatus,
} from "@/api/workspaces";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Att göra",
  doing: "Pågår",
  done: "Klar",
};
const STATUS_COLOR: Record<TaskStatus, "default" | "warning" | "success"> = {
  todo: "default",
  doing: "warning",
  done: "success",
};

interface Props {
  workspaceId: string;
  members: Member[];
  canEdit: boolean;
}

const WorkspaceTasks: React.FC<Props> = ({ workspaceId, members, canEdit }) => {
  const { data: tasks = [] } = useWorkspaceTasks(workspaceId);
  const create = useCreateTask(workspaceId);
  const update = useUpdateTask(workspaceId);
  const del = useDeleteTask(workspaceId);

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {canEdit && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              label="Ny uppgift"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
            <TextField
              select
              size="small"
              label="Ansvarig"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Ingen</MenuItem>
              {members.map((m) => (
                <MenuItem key={m.user_id} value={m.user_id}>{m.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="date"
              label="Klart senast"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!title.trim() || create.isPending}
              onClick={() =>
                run(async () => {
                  await create.mutateAsync({
                    title: title.trim(),
                    assignee_user_id: assignee || null,
                    due_date: due || null,
                  });
                  setTitle("");
                  setAssignee("");
                  setDue("");
                })
              }
            >
              Lägg till
            </Button>
          </Stack>
        </Paper>
      )}

      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
        {openCount} av {tasks.length} uppgifter kvarstår
      </Typography>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Uppgift</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Ansvarig</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Klart senast</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            {canEdit && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => {
            const overdue =
              task.due_date !== null &&
              task.status !== "done" &&
              task.due_date < new Date().toISOString().slice(0, 10);
            return (
              <TableRow key={task.id} hover>
                <TableCell
                  sx={{ textDecoration: task.status === "done" ? "line-through" : undefined }}
                >
                  {task.title}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <TextField
                      select
                      size="small"
                      value={task.assignee_user_id ?? ""}
                      onChange={(e) =>
                        run(() =>
                          update.mutateAsync({
                            taskId: task.id,
                            assignee_user_id: e.target.value || null,
                          }),
                        )
                      }
                      sx={{ minWidth: 160 }}
                    >
                      <MenuItem value="">Ingen</MenuItem>
                      {members.map((m) => (
                        <MenuItem key={m.user_id} value={m.user_id}>{m.name}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {task.assignee_name ?? "—"}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: overdue ? "error.main" : "text.secondary" }}>
                    {task.due_date ?? "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <TextField
                      select
                      size="small"
                      value={task.status}
                      onChange={(e) =>
                        run(() =>
                          update.mutateAsync({
                            taskId: task.id,
                            status: e.target.value as TaskStatus,
                          }),
                        )
                      }
                      sx={{ minWidth: 130 }}
                    >
                      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                        <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Chip size="small" label={STATUS_LABEL[task.status]} color={STATUS_COLOR[task.status]} />
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <Tooltip title="Ta bort">
                      <IconButton size="small" onClick={() => run(() => del.mutateAsync(task.id))}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={canEdit ? 5 : 4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                Inga uppgifter ännu.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
};

export default WorkspaceTasks;
