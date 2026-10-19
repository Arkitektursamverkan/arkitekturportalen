import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, Divider, IconButton, List, ListItemButton, ListItemText, Paper,
  Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import MarkdownView from "@/components/common/MarkdownView";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import {
  useCreatePage, useDeletePage, useUpdatePage, useWorkspacePage, useWorkspacePages,
} from "@/api/workspaces";

interface Props {
  workspaceId: string;
  canEdit: boolean;
}

const WorkspacePages: React.FC<Props> = ({ workspaceId, canEdit }) => {
  const { data: pages = [], isLoading } = useWorkspacePages(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: page } = useWorkspacePage(workspaceId, selectedId ?? undefined);
  const create = useCreatePage(workspaceId);
  const update = useUpdatePage(workspaceId);
  const del = useDeletePage(workspaceId);

  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Follow the list: pick the first page, and drop the selection if it's gone.
  useEffect(() => {
    if (pages.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !pages.some((p) => p.id === selectedId)) {
      setSelectedId(pages[0].id);
    }
  }, [pages, selectedId]);

  useEffect(() => {
    if (page) {
      setDraftTitle(page.title);
      setDraftBody(page.body);
      setMode("read");
    }
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  const addPage = () =>
    run(async () => {
      const created = await create.mutateAsync({ title: "Ny sida", body: "" });
      setSelectedId(created.id);
      setDraftTitle(created.title);
      setDraftBody(created.body);
      setMode("edit");
    });

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ width: { xs: "100%", md: 260 }, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>Sidor</Typography>
            {canEdit && (
              <Tooltip title="Ny sida">
                <IconButton size="small" onClick={addPage}><AddIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
          </Stack>
          <Divider />
          <List dense disablePadding>
            {pages.map((p) => (
              <ListItemButton
                key={p.id}
                selected={p.id === selectedId}
                onClick={() => setSelectedId(p.id)}
              >
                <ListItemText
                  primary={p.title}
                  secondary={`Uppdaterad ${new Date(p.updated_at).toLocaleDateString("sv-SE")}`}
                  primaryTypographyProps={{ fontSize: 13 }}
                  secondaryTypographyProps={{ fontSize: 11 }}
                />
              </ListItemButton>
            ))}
            {!isLoading && pages.length === 0 && (
              <Box sx={{ px: 2, py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Inga sidor ännu.
                </Typography>
              </Box>
            )}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ flex: 1, p: 3, minHeight: 320, width: "100%" }}>
          {!page ? (
            <Typography variant="body2" color="text.secondary">
              {canEdit
                ? "Skapa en sida för instruktioner, mötesanteckningar eller metodbeskrivningar."
                : "Det finns inga dokumentsidor i uppdraget ännu."}
            </Typography>
          ) : mode === "edit" ? (
            <Stack spacing={2}>
              <TextField
                label="Rubrik"
                size="small"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                fullWidth
              />
              <MarkdownEditor
                value={draftBody}
                onChange={setDraftBody}
                placeholder="Skriv innehållet här. Markera text och använd knapparna för rubrik, fetstil eller listor."
                minRows={14}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={!draftTitle.trim() || update.isPending}
                  onClick={() =>
                    run(async () => {
                      await update.mutateAsync({
                        pageId: page.id,
                        title: draftTitle.trim(),
                        body: draftBody,
                      });
                      setMode("read");
                    })
                  }
                >
                  Spara
                </Button>
                <Button
                  onClick={() => {
                    setDraftTitle(page.title);
                    setDraftBody(page.body);
                    setMode("read");
                  }}
                >
                  Avbryt
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Box>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>{page.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Senast uppdaterad {new Date(page.updated_at).toLocaleString("sv-SE")}
                    {page.updated_by ? ` av ${page.updated_by}` : ""}
                  </Typography>
                </Box>
                {canEdit && (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Redigera">
                      <IconButton size="small" onClick={() => setMode("edit")}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Ta bort sidan">
                      <IconButton
                        size="small"
                        onClick={() => run(() => del.mutateAsync(page.id))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <MarkdownView text={page.body} emptyText="Sidan är tom." />
            </Box>
          )}
        </Paper>
      </Stack>
    </Box>
  );
};

export default WorkspacePages;
