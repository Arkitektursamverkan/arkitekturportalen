import React, { useState } from "react";
import {
  Alert, Button, CircularProgress, Collapse, Paper, Stack, Switch, Table, TableBody,
  TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SyncIcon from "@mui/icons-material/Sync";
import {
  useAllDepartments, useDirectoryStatus, useSetDepartmentHidden, useSyncDirectory,
} from "@/api/directory";

/**
 * Kopian av Entra ID-katalogen: hur många personer och avdelningar som är
 * inlästa, en knapp för att hämta på nytt, och listan där en admin döljer
 * avdelningar som inte ska gå att välja (tjänstekonton, externa …). Att stå
 * i katalogen ger ingen åtkomst – konton och roller är listan nedanför.
 */
const DirectoryPanel: React.FC = () => {
  const { data: status } = useDirectoryStatus();
  const { data: departments = [] } = useAllDepartments();
  const sync = useSyncDirectory();
  const setHidden = useSetDepartmentHidden();
  const [open, setOpen] = useState(false);
  if (!status) return null;

  const hiddenCount = departments.filter((d) => d.hidden).length;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <Stack flex={1} spacing={0.25}>
          <Typography variant="subtitle2">Katalog från Entra ID</Typography>
          {!status.configured ? (
            <Typography variant="body2" color="text.secondary">
              Inloggning med Entra ID är inte konfigurerad, så katalogen kan inte hämtas.
            </Typography>
          ) : status.last_synced_at ? (
            <Typography variant="body2" color="text.secondary">
              {status.people} personer i {status.departments} avdelningar
              {status.without_department > 0 && ` (${status.without_department} saknar avdelning i Entra ID)`}
              {" · "}senast hämtad {new Date(status.last_synced_at).toLocaleString("sv-SE")}. Hämtas bara när en administratör trycker Hämta nu.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Ingen hämtning har gjorts ännu. Hämtningen görs i ditt namn – du kan få godkänna det i ett Microsoft-fönster.
            </Typography>
          )}
        </Stack>
        {departments.length > 0 && (
          <Button endIcon={open ? <ExpandLess /> : <ExpandMore />} onClick={() => setOpen((v) => !v)}>
            Avdelningar{hiddenCount > 0 && ` (${hiddenCount} dolda)`}
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={sync.isPending ? <CircularProgress size={16} /> : <SyncIcon />}
          disabled={!status.configured || sync.isPending}
          onClick={() => sync.mutate()}
        >
          Hämta nu
        </Button>
      </Stack>
      {sync.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{(sync.error as Error).message}</Alert>}
      <Collapse in={open} unmountOnExit>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          En dold avdelning går inte att välja, t.ex. som berörd avdelning i verksamhetskalendern.
          Poster som redan pekar på den behåller den. Valet ligger kvar när katalogen hämtas på nytt.
        </Typography>
        {setHidden.isError && <Alert severity="error" sx={{ mb: 1 }}>{(setHidden.error as Error).message}</Alert>}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Avdelning</TableCell>
              <TableCell align="right">Personer</TableCell>
              <TableCell align="right">Visas</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d.name} hover>
                <TableCell sx={{ color: d.hidden ? "text.disabled" : undefined }}>{d.name}</TableCell>
                <TableCell align="right" sx={{ color: d.hidden ? "text.disabled" : undefined }}>{d.people}</TableCell>
                <TableCell align="right">
                  <Switch
                    size="small"
                    checked={!d.hidden}
                    disabled={setHidden.isPending}
                    onChange={(e) => setHidden.mutate({ name: d.name, hidden: !e.target.checked })}
                    inputProps={{ "aria-label": `Visa ${d.name}` }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Collapse>
    </Paper>
  );
};

export default DirectoryPanel;
