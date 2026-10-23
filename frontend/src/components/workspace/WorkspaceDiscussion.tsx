import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Divider, IconButton, Paper, Stack, Tooltip, Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ReplyIcon from "@mui/icons-material/Reply";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MarkdownView from "@/components/common/MarkdownView";
import MarkdownEditor from "@/components/common/MarkdownEditor";
import {
  useCreatePost, useDeletePost, useUpdatePost, useWorkspacePosts, type Post,
} from "@/api/workspaces";
import { useCurrentUser } from "@/api/me";

interface Props {
  workspaceId: string;
  canWrite: boolean;
  isOwner: boolean;
}

const PostCard: React.FC<{
  post: Post;
  mine: boolean;
  isOwner: boolean;
  canWrite: boolean;
  onReply?: () => void;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
  indented?: boolean;
}> = ({ post, mine, isOwner, canWrite, onReply, onEdit, onDelete, indented }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const mayTouch = canWrite && (mine || isOwner);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, ml: indented ? { xs: 2, sm: 5 } : 0, bgcolor: indented ? "action.hover" : undefined }}
    >
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {post.author_name || post.created_by || "Okänd"}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {new Date(post.created_at).toLocaleString("sv-SE")}
            {post.edited_at ? " · redigerad" : ""}
          </Typography>
          {mayTouch && (
            <>
              <Tooltip title="Redigera">
                <IconButton size="small" onClick={() => { setDraft(post.body); setEditing(true); }}>
                  <EditIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Ta bort">
                <IconButton size="small" onClick={() => onDelete()}>
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </Stack>

      {editing ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <MarkdownEditor value={draft} onChange={setDraft} minRows={3} />
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              disabled={!draft.trim()}
              onClick={async () => { await onEdit(draft.trim()); setEditing(false); }}
            >
              Spara
            </Button>
            <Button size="small" onClick={() => setEditing(false)}>Avbryt</Button>
          </Stack>
        </Stack>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          <MarkdownView text={post.body} />
        </Box>
      )}

      {onReply && canWrite && !editing && (
        <Button size="small" startIcon={<ReplyIcon />} onClick={onReply} sx={{ mt: 1 }}>
          Svara
        </Button>
      )}
    </Paper>
  );
};

const WorkspaceDiscussion: React.FC<Props> = ({ workspaceId, canWrite, isOwner }) => {
  const { data: posts = [] } = useWorkspacePosts(workspaceId);
  const { data: me } = useCurrentUser();
  const create = useCreatePost(workspaceId);
  const update = useUpdatePost(workspaceId);
  const del = useDeletePost(workspaceId);

  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const threads = useMemo(() => {
    const roots = posts.filter((p) => p.parent_id === null);
    const byParent = new Map<string, Post[]>();
    posts
      .filter((p) => p.parent_id !== null)
      .forEach((p) => {
        const list = byParent.get(p.parent_id!) ?? [];
        list.push(p);
        byParent.set(p.parent_id!, list);
      });
    return roots
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((root) => ({ root, replies: byParent.get(root.id) ?? [] }));
  }, [posts]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  };

  const isMine = (p: Post) => Boolean(me?.email && p.created_by === me.email);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {canWrite && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            label="Skriv ett inlägg"
            placeholder="Dela information, ställ en fråga…"
            minRows={3}
          />
          <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 1 }}>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              disabled={!body.trim() || create.isPending}
              onClick={() =>
                run(async () => {
                  await create.mutateAsync({ body: body.trim() });
                  setBody("");
                })
              }
            >
              Publicera
            </Button>
          </Stack>
        </Paper>
      )}

      <Stack spacing={2}>
        {threads.map(({ root, replies }) => (
          <Box key={root.id}>
            <PostCard
              post={root}
              mine={isMine(root)}
              isOwner={isOwner}
              canWrite={canWrite}
              onReply={() => { setReplyTo(root.id); setReplyBody(""); }}
              onEdit={(b) => run(() => update.mutateAsync({ postId: root.id, body: b }))}
              onDelete={() => run(() => del.mutateAsync(root.id))}
            />
            <Stack spacing={1} sx={{ mt: 1 }}>
              {replies
                .slice()
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((r) => (
                  <PostCard
                    key={r.id}
                    post={r}
                    mine={isMine(r)}
                    isOwner={isOwner}
                    canWrite={canWrite}
                    indented
                    onEdit={(b) => run(() => update.mutateAsync({ postId: r.id, body: b }))}
                    onDelete={() => run(() => del.mutateAsync(r.id))}
                  />
                ))}
            </Stack>
            {replyTo === root.id && (
              <Box sx={{ ml: { xs: 2, sm: 5 }, mt: 1 }}>
                <MarkdownEditor value={replyBody} onChange={setReplyBody} label="Svar" minRows={2} />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!replyBody.trim()}
                    onClick={() =>
                      run(async () => {
                        await create.mutateAsync({ body: replyBody.trim(), parent_id: root.id });
                        setReplyTo(null);
                        setReplyBody("");
                      })
                    }
                  >
                    Skicka svar
                  </Button>
                  <Button size="small" onClick={() => setReplyTo(null)}>Avbryt</Button>
                </Stack>
              </Box>
            )}
            <Divider sx={{ mt: 2 }} />
          </Box>
        ))}
        {threads.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
            Inga inlägg ännu.
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

export default WorkspaceDiscussion;
