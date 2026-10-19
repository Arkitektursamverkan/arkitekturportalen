import React, { useState } from "react";
import {
  Alert, Badge, Box, Button, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import CommentIcon from "@mui/icons-material/Comment";
import DeleteIcon from "@mui/icons-material/Delete";
import RateReviewIcon from "@mui/icons-material/RateReview";
import {
  useComments, useCreateComment, useDeleteComment, useReviewComment,
  type Comment, type CommentSubjectType,
} from "@/api/comments";
import { useRoleStore } from "@/store/roleStore";
import { useCurrentUser } from "@/api/me";

interface Props {
  subjectType: CommentSubjectType;
  subjectId: string;
  /** Subtle label shown on the toggle button, e.g. "Verksamhetsarkitektur". Optional. */
  contextLabel?: string;
}

const STATUS_CHIP: Record<Comment["status"], { label: string; color: "default" | "warning" | "success" | "error" }> = {
  pending: { label: "Avvaktar granskning", color: "warning" },
  approved: { label: "Godkänd", color: "success" },
  rejected: { label: "Avvisad", color: "error" },
};

export const CommentsThread: React.FC<Props> = ({ subjectType, subjectId, contextLabel }) => {
  const { isAdmin, isEditor } = useRoleStore();
  const { data: me } = useCurrentUser();
  const { data: comments = [], isLoading } = useComments(subjectType, subjectId);
  const create = useCreateComment();
  const review = useReviewComment();
  const del = useDeleteComment();

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [reviewing, setReviewing] = useState<Comment | null>(null);

  const visibleCount = comments.filter((c) => c.status === "approved" || (isEditor && c.status !== "rejected")).length;
  const pendingCount = comments.filter((c) => c.status === "pending").length;

  const submit = async () => {
    if (!body.trim()) return;
    await create.mutateAsync({ subject_type: subjectType, subject_id: subjectId, body: body.trim() });
    setBody("");
  };

  return (
    <Box>
      <Button
        startIcon={
          isEditor && pendingCount > 0 ? (
            <Badge color="warning" badgeContent={pendingCount}><CommentIcon /></Badge>
          ) : (
            <CommentIcon />
          )
        }
        size="small"
        variant="text"
        onClick={() => setOpen((o) => !o)}
      >
        Kommentarer ({visibleCount})
      </Button>

      <Collapse in={open}>
        <Box sx={{ mt: 1, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          {contextLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              {contextLabel}
            </Typography>
          )}
          {isLoading ? (
            <Typography variant="caption" color="text.secondary">Hämtar kommentarer…</Typography>
          ) : comments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Inga kommentarer ännu.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  isAdmin={isEditor}
                  isAuthor={Boolean(me?.email && c.created_by === me.email)}
                  onReview={() => setReviewing(c)}
                  onDelete={() => del.mutateAsync({ id: c.id, subject_type: subjectType, subject_id: subjectId })}
                />
              ))}
            </Stack>
          )}

          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              placeholder="Skriv en kommentar…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Kommentaren publiceras efter att en admin godkänt den.
              </Typography>
              <Button
                size="small"
                variant="contained"
                disabled={!body.trim() || create.isPending}
                onClick={submit}
              >
                {create.isPending ? "Sparar…" : "Skicka för granskning"}
              </Button>
            </Stack>
          </Box>
        </Box>
      </Collapse>

      {reviewing && (
        <ReviewDialog
          comment={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={async (status, reply) => {
            await review.mutateAsync({ id: reviewing.id, status, reply });
            setReviewing(null);
          }}
        />
      )}
    </Box>
  );
};

const CommentItem: React.FC<{
  comment: Comment;
  isAdmin: boolean;
  isAuthor: boolean;
  onReview: () => void;
  onDelete: () => Promise<unknown>;
}> = ({ comment: c, isAdmin, isAuthor, onReview, onDelete }) => {
  const status = STATUS_CHIP[c.status];
  return (
    <Box sx={{ p: 1.5, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
        <Typography variant="caption" fontWeight={600}>{c.created_by ?? "Anonym"}</Typography>
        <Typography variant="caption" color="text.secondary">
          {new Date(c.created_at).toLocaleString("sv-SE")}
        </Typography>
        <Box flex={1} />
        <Chip size="small" label={status.label} color={status.color} variant={c.status === "approved" ? "outlined" : "filled"} sx={{ height: 18, fontSize: 10 }} />
        {isAdmin && c.status === "pending" && (
          <Tooltip title="Granska & godkänn">
            <IconButton size="small" onClick={onReview}><RateReviewIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        {(isAdmin || (isAuthor && c.status === "pending")) && (
          <Tooltip title="Ta bort">
            <IconButton size="small" onClick={() => onDelete()}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{c.body}</Typography>
      {c.reply && (
        <Box sx={{ mt: 1, ml: 2, p: 1, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: "2px" }}>
          <Typography variant="caption" fontWeight={600} color="primary.main">
            Svar från {c.reviewed_by ?? "admin"} · {c.reviewed_at && new Date(c.reviewed_at).toLocaleString("sv-SE")}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.25 }}>{c.reply}</Typography>
        </Box>
      )}
      {isAdmin && c.reviewed_at && !c.reply && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Läst av {c.reviewed_by} · {new Date(c.reviewed_at).toLocaleString("sv-SE")}
        </Typography>
      )}
    </Box>
  );
};

const ReviewDialog: React.FC<{
  comment: Comment;
  onClose: () => void;
  onSubmit: (status: "approved" | "rejected", reply?: string) => Promise<void>;
}> = ({ comment, onClose, onSubmit }) => {
  const [reply, setReply] = useState(comment.reply ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Granska kommentar</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Att godkänna eller avvisa stämplar att du läst kommentaren.
        </Alert>
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, mb: 2 }}>
          <Typography variant="caption" fontWeight={600}>{comment.created_by} · {new Date(comment.created_at).toLocaleString("sv-SE")}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.5 }}>{comment.body}</Typography>
        </Box>
        <TextField
          autoFocus fullWidth multiline minRows={3}
          label="Svar (valfritt)"
          placeholder="Skriv ett kort svar som visas tillsammans med kommentaren…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button color="error" disabled={saving} onClick={async () => { setSaving(true); try { await onSubmit("rejected", reply.trim() || undefined); } finally { setSaving(false); } }}>
          Avvisa
        </Button>
        <Button variant="contained" color="success" disabled={saving} onClick={async () => { setSaving(true); try { await onSubmit("approved", reply.trim() || undefined); } finally { setSaving(false); } }}>
          {saving ? "Sparar…" : "Godkänn"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommentsThread;
