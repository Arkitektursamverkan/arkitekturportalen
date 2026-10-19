import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, ListItemText, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from "@mui/material";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  tagsByReportKey, useCreateReportTag, useDeleteReportTag, useReportTags,
  useSetReportTags, useUpdateReportTag, type ReportTag,
} from "@/api/reportTags";
import { useRenameReport, useReportNames, useResetReportName } from "@/api/reportNames";
import { usePublishedReports } from "@/api/publishedReports";
import { REPORT_CATALOG, publishedReportKey } from "@/config/reportCatalog";
import { useRoleStore } from "@/store/roleStore";

/** Readable text on a coloured chip — white on anything but the palest tags. */
export function contrastText(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "rgba(0,0,0,.82)" : "#fff";
}

/**
 * The tags of the report currently open, shown top right above it.
 *
 * Rendered once by AppShell for whichever report the route points at, rather
 * than by each of the 25 report pages — they are independent components with
 * no shared shell, and this way a new report gets its tag bar for free.
 *
 * Readers see the chips; admins can retag from here and manage the tag list
 * itself. It renders nothing for a reader on an untagged report, so an
 * ordinary page keeps its own first line.
 */
const ReportTagBar: React.FC<{ reportKey: string }> = ({ reportKey }) => {
  const { t } = useTranslation();
  const { isAdmin } = useRoleStore();
  const { data: tags } = useReportTags();
  const setReportTags = useSetReportTags();

  // Ticking boxes only changes `selected`; the save happens once, on close —
  // so a quick series of clicks can't race itself.
  const [menu, setMenu] = useState<{ anchor: HTMLElement; selected: string[] } | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const byKey = useMemo(() => tagsByReportKey(tags), [tags]);
  const current = byKey.get(reportKey) ?? [];

  if (!isAdmin && current.length === 0) return null;

  const toggle = (tagId: string) =>
    setMenu((m) =>
      m === null
        ? null
        : {
            ...m,
            selected: m.selected.includes(tagId)
              ? m.selected.filter((id) => id !== tagId)
              : [...m.selected, tagId],
          },
    );

  const closeMenu = () => {
    if (menu) {
      const before = current.map((tag) => tag.id);
      const changed =
        before.length !== menu.selected.length ||
        before.some((id) => !menu.selected.includes(id));
      if (changed) setReportTags.mutate({ reportKey, tagIds: menu.selected });
    }
    setMenu(null);
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.75, px: 3, pt: 2 }}>
      {current.map((tag) => (
        <Chip
          key={tag.id}
          label={tag.name}
          size="small"
          sx={{ bgcolor: tag.color, color: contrastText(tag.color), height: 22, fontSize: 11 }}
        />
      ))}
      {isAdmin && current.length === 0 && (
        <Typography variant="caption" color="text.disabled">
          {t("reports.tags.none", { defaultValue: "Otaggad" })}
        </Typography>
      )}
      {isAdmin && (
        <Tooltip title={t("reports.rename.action", { defaultValue: "Byt namn på rapporten" })}>
          <IconButton size="small" onClick={() => setRenameOpen(true)}>
            <EditIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      )}
      {isAdmin && (
        <Tooltip title={t("reports.overview.editTags", { defaultValue: "Ändra taggar" })}>
          <IconButton
            size="small"
            onClick={(e) => setMenu({ anchor: e.currentTarget, selected: current.map((x) => x.id) })}
          >
            <LabelOutlinedIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      )}

      <Menu open={Boolean(menu)} anchorEl={menu?.anchor ?? null} onClose={closeMenu}>
        {(tags ?? []).map((tag) => (
          <MenuItem key={tag.id} dense onClick={() => toggle(tag.id)}>
            <Checkbox
              size="small"
              checked={menu?.selected.includes(tag.id) ?? false}
              sx={{ p: 0.5, mr: 1 }}
            />
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: tag.color, mr: 1 }} />
            <ListItemText primary={tag.name} primaryTypographyProps={{ fontSize: 13 }} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          dense
          onClick={() => {
            closeMenu();
            setManagerOpen(true);
          }}
        >
          <ListItemText
            primary={t("reports.overview.manageTags", { defaultValue: "Hantera taggar" })}
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </MenuItem>
      </Menu>

      <TagManagerDialog
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        tags={tags ?? []}
      />

      <RenameReportDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        reportKey={reportKey}
      />
    </Box>
  );
};

/**
 * One editable tag. The fields are local while they are being edited and only
 * save on blur — a native colour input fires `change` continuously as the
 * picker is dragged, and one PATCH per drag frame would both hammer the API
 * and snap the swatch back to whichever response landed last.
 */
const TagRow: React.FC<{
  tag: ReportTag;
  onSave: (patch: { name?: string; color?: string; sort_order?: number }) => void;
  onDelete: () => void;
}> = ({ tag, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [color, setColor] = useState(tag.color);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        type="color"
        size="small"
        value={color}
        onChange={(e) => setColor(e.target.value.toUpperCase())}
        onBlur={() => {
          if (color !== tag.color) onSave({ color });
        }}
        sx={{ width: 56 }}
      />
      <TextField
        size="small"
        defaultValue={tag.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== tag.name) onSave({ name });
        }}
        sx={{ flex: 1 }}
      />
      <TextField
        size="small"
        type="number"
        defaultValue={tag.sort_order}
        onBlur={(e) => {
          const order = Number(e.target.value);
          if (Number.isFinite(order) && order >= 0 && order <= 9999 && order !== tag.sort_order) {
            onSave({ sort_order: order });
          }
        }}
        sx={{ width: 80 }}
        inputProps={{ min: 0, max: 9999 }}
      />
      <Typography variant="caption" color="text.disabled" sx={{ width: 64 }}>
        {t("reports.tags.count", { defaultValue: "{{count}} rapp.", count: tag.report_keys.length })}
      </Typography>
      <Tooltip title={t("common.delete", { defaultValue: "Ta bort" })}>
        <IconButton size="small" onClick={onDelete}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

const TagManagerDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  tags: ReportTag[];
}> = ({ open, onClose, tags }) => {
  const { t } = useTranslation();
  const createTag = useCreateReportTag();
  const updateTag = useUpdateReportTag();
  const deleteTag = useDeleteReportTag();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#607D8B");
  const [error, setError] = useState<string | null>(null);

  // sort_order is capped at 9999 server-side — clamp rather than 422 on save.
  const nextOrder =
    tags.length === 0 ? 10 : Math.min(9999, Math.max(...tags.map((x) => x.sort_order)) + 10);

  const handleCreate = () => {
    setError(null);
    createTag.mutate(
      { name: newName.trim(), color: newColor.toUpperCase(), sort_order: nextOrder },
      {
        onSuccess: () => setNewName(""),
        onError: (e: unknown) => {
          const detail = axios.isAxiosError(e)
            ? (e.response?.data as { detail?: string } | undefined)?.detail
            : undefined;
          setError(detail ?? t("common.error", { defaultValue: "Fel" }));
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("reports.overview.manageTags", { defaultValue: "Hantera taggar" })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("reports.tags.help", {
            defaultValue:
              "Ordningen styr var taggen hamnar i menyn — lägre tal först. Tar du bort en tagg blir rapporterna under den otaggade, inget annat händer.",
          })}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack spacing={1}>
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onSave={(patch) => updateTag.mutate({ id: tag.id, ...patch })}
              onDelete={() => deleteTag.mutate(tag.id)}
            />
          ))}
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            type="color"
            size="small"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            sx={{ width: 56 }}
          />
          <TextField
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("reports.tags.newName", { defaultValue: "Ny tagg…" })}
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={!newName.trim() || createTag.isPending}
            onClick={handleCreate}
          >
            {t("common.add", { defaultValue: "Lägg till" })}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close", { defaultValue: "Stäng" })}</Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Rename the report. One name for both languages: what the organisation calls a report is
 * an editorial decision, not a translation.
 *
 * A built-in report keeps its translated name underneath, so it can be handed
 * back with "Återställ". A published edition owns its name — its CSV and PDF
 * filenames read it — so renaming one changes the edition itself, and there is
 * no original to restore.
 */
const RenameReportDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  reportKey: string;
}> = ({ open, onClose, reportKey }) => {
  const { t } = useTranslation();
  const { data: names } = useReportNames();
  // Admin-only dialog, so the editor-gated listing is always available here.
  const { data: published } = usePublishedReports(true);
  const rename = useRenameReport();
  const reset = useResetReportName();

  const isPublished = reportKey.startsWith("published:");
  const override = names?.get(reportKey);
  const builtIn = REPORT_CATALOG.find((r) => r.key === reportKey);
  const original = builtIn
    ? t(builtIn.labelKey)
    : published?.find((p) => publishedReportKey(p.id) === reportKey)?.name ?? "";
  const currentName = override ?? original;

  const [draft, setDraft] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the field each time the dialog opens, and whenever the name it is
  // editing changes underneath it.
  React.useEffect(() => {
    if (open) {
      setDraft(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const save = () => {
    const name = draft.trim();
    if (!name) return;
    setError(null);
    rename.mutate(
      { reportKey, name },
      {
        onSuccess: onClose,
        onError: (e: unknown) => {
          const detail = axios.isAxiosError(e)
            ? (e.response?.data as { detail?: string } | undefined)?.detail
            : undefined;
          setError(detail ?? t("common.error", { defaultValue: "Fel" }));
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("reports.rename.action", { defaultValue: "Byt namn på rapporten" })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("reports.rename.help", {
            defaultValue:
              "Namnet visas i menyn och som rubrik på rapporten, på både svenska och engelska.",
          })}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          inputProps={{ maxLength: 200 }}
        />
        {override && (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
            {t("reports.rename.original", {
              defaultValue: "Ursprungligt namn: {{name}}",
              name: original,
            })}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {override && !isPublished && (
          <Button
            color="inherit"
            onClick={() => reset.mutate(reportKey, { onSuccess: onClose })}
            sx={{ mr: "auto" }}
          >
            {t("reports.rename.reset", { defaultValue: "Återställ" })}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel", { defaultValue: "Avbryt" })}</Button>
        <Button
          variant="contained"
          disabled={!draft.trim() || draft.trim() === currentName || rename.isPending}
          onClick={save}
        >
          {t("common.save", { defaultValue: "Spara" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportTagBar;
