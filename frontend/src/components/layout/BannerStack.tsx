import React, { useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, FormLabel, IconButton, MenuItem,
  Radio, RadioGroup, Select, Stack, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useTranslation } from "react-i18next";
import {
  useHomeBanners, useCreateBanner, useUpdateBanner, useDeleteBanner,
  type HomeBanner, type BannerSeverity,
} from "@/api/homeBanners";
import { useRoleStore } from "@/store/roleStore";

const DISMISSED_STORAGE_KEY = "dismissed-banners";

type DismissedMap = Record<string, string>;  // banner id → updated_at it was dismissed at

function readDismissed(): DismissedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeDismissed(map: DismissedMap) {
  window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(map));
}

const BannerStack: React.FC = () => {
  const { isEditor: isAdmin } = useRoleStore();
  const { data: banners = [] } = useHomeBanners();
  const [dismissed, setDismissed] = useState<DismissedMap>(() => readDismissed());
  const [editing, setEditing] = useState<HomeBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const { t } = useTranslation();

  const visible = banners.filter((b) => {
    if (isAdmin) return true;
    if (!b.enabled) return false;
    return dismissed[b.id] !== b.updated_at;
  });

  const dismiss = (b: HomeBanner) => {
    const next = { ...dismissed, [b.id]: b.updated_at };
    writeDismissed(next);
    setDismissed(next);
  };

  if (visible.length === 0 && !isAdmin) return null;

  return (
    <Box>
      <Stack spacing={0}>
        {visible.map((b) => (
          <BannerRow
            key={b.id}
            banner={b}
            isAdmin={isAdmin}
            dismissed={dismissed[b.id] === b.updated_at}
            onDismiss={() => dismiss(b)}
            onEdit={() => setEditing(b)}
          />
        ))}
      </Stack>

      {isAdmin && (
        <Box sx={{ px: 2, py: 0.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
          <Button
            size="small"
            variant="text"
            startIcon={<AddIcon />}
            onClick={() => setCreating(true)}
          >
            {t("banners.add", { defaultValue: "Nytt driftmeddelande" })}
          </Button>
        </Box>
      )}

      {editing && (
        <BannerEditDialog banner={editing} onClose={() => setEditing(null)} />
      )}
      {creating && (
        <BannerCreateDialog onClose={() => setCreating(false)} />
      )}
    </Box>
  );
};

const BannerRow: React.FC<{
  banner: HomeBanner;
  isAdmin: boolean;
  dismissed: boolean;
  onDismiss: () => void;
  onEdit: () => void;
}> = ({ banner, isAdmin, dismissed, onDismiss, onEdit }) => {
  const { t } = useTranslation();
  const del = useDeleteBanner();

  // Admins still see the banner when it's disabled or dismissed, but greyed out
  // so they understand it's not currently visible to end-users.
  const muted = isAdmin && (!banner.enabled || dismissed);

  return (
    <Alert
      severity={banner.severity}
      icon={!banner.enabled ? <VisibilityOffIcon fontSize="small" /> : undefined}
      sx={{
        borderRadius: 0,
        alignItems: "center",
        opacity: muted ? 0.65 : 1,
        "& .MuiAlert-message": { flex: 1 },
      }}
      action={
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {isAdmin && (
            <>
              <Tooltip title={t("banners.edit", { defaultValue: "Redigera" })}>
                <IconButton size="small" color="inherit" onClick={onEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("banners.delete", { defaultValue: "Ta bort" })}>
                <IconButton
                  size="small"
                  color="inherit"
                  onClick={() => {
                    if (window.confirm(t("banners.deleteConfirm", { defaultValue: "Ta bort detta driftmeddelande?" }))) {
                      del.mutate(banner.id);
                    }
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {!muted && (
            <Tooltip title={t("banners.dismiss", { defaultValue: "Dölj" })}>
              <IconButton size="small" color="inherit" onClick={onDismiss}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      }
    >
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
        <Typography variant="body2" sx={{ whiteSpace: "pre-line", flex: 1 }}>
          {banner.body || (isAdmin ? <i>(tomt meddelande)</i> : null)}
        </Typography>
        {isAdmin && (!banner.enabled || dismissed) && (
          <Typography variant="caption" sx={{ opacity: 0.85, fontStyle: "italic", whiteSpace: "nowrap" }}>
            {!banner.enabled
              ? t("banners.disabled", { defaultValue: "Inaktiverad" })
              : t("banners.dismissedByYou", { defaultValue: "Dold av dig" })}
          </Typography>
        )}
      </Stack>
    </Alert>
  );
};

// ── Edit / create dialogs ────────────────────────────────────────────────────

interface BannerFormState {
  body: string;
  severity: BannerSeverity;
  enabled: boolean;
}

const BannerEditDialog: React.FC<{
  banner: HomeBanner;
  onClose: () => void;
}> = ({ banner, onClose }) => {
  const update = useUpdateBanner();
  return (
    <BannerFormDialog
      title="Redigera driftmeddelande"
      initial={{ body: banner.body, severity: banner.severity, enabled: banner.enabled }}
      saving={update.isPending}
      onSave={async (state) => {
        await update.mutateAsync({ id: banner.id, ...state });
        onClose();
      }}
      onClose={onClose}
    />
  );
};

const BannerCreateDialog: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const create = useCreateBanner();
  return (
    <BannerFormDialog
      title="Nytt driftmeddelande"
      initial={{ body: "", severity: "info", enabled: true }}
      saving={create.isPending}
      onSave={async (state) => {
        await create.mutateAsync(state);
        onClose();
      }}
      onClose={onClose}
    />
  );
};

const BannerFormDialog: React.FC<{
  title: string;
  initial: BannerFormState;
  saving: boolean;
  onSave: (state: BannerFormState) => Promise<void>;
  onClose: () => void;
}> = ({ title, initial, saving, onSave, onClose }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<BannerFormState>(initial);
  const set = <K extends keyof BannerFormState>(k: K, v: BannerFormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <FormControl>
            <FormLabel>Allvarlighetsgrad</FormLabel>
            <RadioGroup
              row
              value={state.severity}
              onChange={(e) => set("severity", e.target.value as BannerSeverity)}
            >
              <FormControlLabel value="info" control={<Radio />} label="Info (blå)" />
              <FormControlLabel value="warning" control={<Radio />} label="Varning (gul)" />
              <FormControlLabel value="error" control={<Radio />} label="Akut (röd)" />
            </RadioGroup>
          </FormControl>

          <TextField
            autoFocus fullWidth multiline minRows={3} maxRows={10}
            label="Meddelande"
            value={state.body}
            onChange={(e) => set("body", e.target.value)}
          />

          <FormControlLabel
            control={
              <Switch
                checked={state.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
              />
            }
            label="Visa för användare"
          />
          <Typography variant="caption" color="text.secondary">
            När du sparar nytt innehåll visas meddelandet igen för användare som tidigare dolt det.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={saving || !state.body.trim()}
          onClick={() => onSave({ ...state, body: state.body.trim() })}
        >
          {saving ? "…" : "Spara"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BannerStack;
