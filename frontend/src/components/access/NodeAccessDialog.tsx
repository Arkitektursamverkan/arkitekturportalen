import React, { useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useTranslation } from "react-i18next";
import ErrorAlert from "@/components/common/ErrorAlert";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useDeleteGrant, useNodeAccess } from "@/api/access";
import { useRoleStore } from "@/store/roleStore";
import GrantDialog from "./GrantDialog";
import { PrincipalChip, scopeLabel, viaLabel } from "./accessParts";

/** Vem har åtkomst? — every grant reaching one object, and how it gets there. */
const NodeAccessDialog: React.FC<{ nodeId: string; onClose: () => void }> = ({ nodeId, onClose }) => {
  const { t } = useTranslation();
  const isAdmin = useRoleStore((s) => s.isAdmin);
  const { data, isLoading, error } = useNodeAccess(nodeId);
  const del = useDeleteGrant();
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("access.nodeDialog.title", { name: data?.node_name ?? "" })}</DialogTitle>
      <DialogContent>
        {failure && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFailure(null)}>{failure}</Alert>}
        {isLoading && <LoadingSpinner height={160} />}
        {error && <ErrorAlert error={error as Error} />}
        {data && (
          <>
            {data.grants.length === 0 ? (
              <Typography sx={{ color: "text.secondary", py: 2 }}>{t("access.nodeDialog.empty")}</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>{t("access.principal.label")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("access.grants.role")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("access.check.because")}</TableCell>
                    {isAdmin && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.grants.map((r) => (
                    <TableRow key={r.grant.id}>
                      <TableCell><PrincipalChip grant={r.grant} /></TableCell>
                      <TableCell>
                        <Tooltip title={r.grant.permissions.map((p) => t(`access.permissions.${p}`)).join(" · ")}>
                          <Typography variant="body2" component="span">{r.grant.role_name}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{viaLabel(r, t)}</Typography>
                        {r.via !== "node" && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>{scopeLabel(r.grant, t)}</Typography>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell align="right">
                          <Tooltip title={t("access.grants.delete")}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                if (!window.confirm(t("access.grants.confirmDelete"))) return;
                                del.mutate(r.grant.id, { onError: (e) => setFailure(e instanceof Error ? e.message : t("common.error")) });
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("access.nodeDialog.admins")}:</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mt: 0.5 }}>
                {data.admins.map((a) => <Chip key={a.id} size="small" label={a.name} />)}
              </Stack>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {isAdmin && data && (
          <Button startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ mr: "auto" }}>
            {t("access.nodeDialog.addHere")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
      {adding && data && (
        <GrantDialog
          fixedNode={{ id: data.node_id, name: data.node_name, type: data.node_type }}
          onClose={() => setAdding(false)}
        />
      )}
    </Dialog>
  );
};

export default NodeAccessDialog;
