import React, { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { isAxiosError } from "axios";
import { usePublicOrgSettings } from "@/api/orgSettings";
import { ownFieldsFor, type ExtraField, type OwnFieldKind } from "@/config/domainLists";

/**
 * The fields an admin added to an object type or a connection type
 * (Administration → Listor → Egna fält), shown and filled in on one object or
 * connection. Each field saves on its own: a choice when it is picked, a text
 * when the field is left. An empty value clears the field.
 */
const OwnFields: React.FC<{
  kind: OwnFieldKind;
  /** The object type or connection type the fields belong to. */
  type: string;
  /** Changes with the object or connection shown, so the values start over. */
  ownerId: string;
  attributes: Record<string, unknown> | undefined;
  canEdit: boolean;
  /** Admins get a link to where the fields are defined. */
  isAdmin?: boolean;
  onSave: (values: Record<string, string | null>) => Promise<unknown>;
}> = ({ kind, type, ownerId, attributes, canEdit, isAdmin, onSave }) => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const { data: org } = usePublicOrgSettings();
  const fields = ownFieldsFor(org?.domain_lists, kind, type);
  const read = (f: ExtraField) => (typeof attributes?.[f.key] === "string" ? (attributes[f.key] as string) : "");
  const [values, setValues] = useState<Record<string, string>>({});
  // What is saved, so a text field left unchanged sends nothing.
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const stored = fields.map((f) => `${f.key}=${read(f)}`).join("\n");
  useEffect(() => {
    const now = Object.fromEntries(fields.map((f) => [f.key, read(f)]));
    setValues(now);
    setSaved(now);
    // The stored values, as one string, are what the effect follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, stored]);

  const save = async (field: ExtraField, value: string) => {
    const next = value.trim();
    if (next === (saved[field.key] ?? "")) return;
    setSaving(field.key);
    try {
      await onSave({ [field.key]: next || null });
      setSaved((s) => ({ ...s, [field.key]: next }));
      setValues((v) => ({ ...v, [field.key]: next }));
    } catch (e) {
      setValues((v) => ({ ...v, [field.key]: saved[field.key] ?? "" }));
      const detail = isAxiosError(e) && typeof e.response?.data?.detail === "string" ? e.response.data.detail : null;
      enqueueSnackbar(detail ?? t("ownFields.saveError"), { variant: "error" });
    } finally {
      setSaving(null);
    }
  };

  if (fields.length === 0 && !isAdmin) return null;

  return (
    <Box sx={{ mt: 1 }}>
      {fields.map((f) => {
        const value = values[f.key] ?? "";
        // A value saved before the choice was taken away is still shown.
        const options = f.type === "choice" && value && !f.options.includes(value) ? [...f.options, value] : f.options;
        return (
          <Stack key={f.key} direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.75 }}>
            <Typography variant="caption" sx={{ color: "text.secondary", width: 96, flexShrink: 0, overflowWrap: "anywhere" }}>
              {f.label}
            </Typography>
            {!canEdit ? (
              <Typography variant="body2" sx={{ color: value ? "text.primary" : "text.disabled", overflowWrap: "anywhere" }}>
                {value || "—"}
              </Typography>
            ) : f.type === "choice" ? (
              <TextField
                select fullWidth size="small" variant="standard" value={value} disabled={saving === f.key}
                slotProps={{ htmlInput: { "aria-label": f.label }, select: { displayEmpty: true } }}
                onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); void save(f, e.target.value); }}
              >
                <MenuItem value=""><em>{t("ownFields.none")}</em></MenuItem>
                {options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            ) : (
              <TextField
                fullWidth size="small" variant="standard" value={value} disabled={saving === f.key}
                slotProps={{ htmlInput: { "aria-label": f.label, maxLength: 500 } }}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                onBlur={(e) => void save(f, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            )}
          </Stack>
        );
      })}
      {isAdmin && (
        <Link component={RouterLink} to="/domain-lists" variant="caption" underline="hover">
          {fields.length ? t("ownFields.manage") : t("ownFields.add")}
        </Link>
      )}
    </Box>
  );
};

export default OwnFields;
