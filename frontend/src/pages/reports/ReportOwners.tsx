import React, { useMemo, useState } from "react";
import { Autocomplete, Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ReportTitle from "@/components/reports/ReportTitle";
import { peopleWithRoles, ROLE_FIELDS, type Person } from "@/utils/personRoles";

const TYPE_ROUTES: Record<string, string> = {
  Application: "/systems",
  Process: "/processes",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

type GroupBy = "systemägare" | "systemförvaltare" | "systemadministratör" | "avdelning";

const ReportOwners: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const [groupBy, setGroupBy] = useState<GroupBy>("systemägare");
  // A chosen person replaces the grouped overview with that person's roles.
  const [person, setPerson] = useState<Person | null>(null);
  const people = useMemo(() => peopleWithRoles(nodes), [nodes]);
  const roleName = (f: string) => t(`attributes.${f}`, { defaultValue: f });
  const typeName = (type: string) => t(`nodeTypes.${type}`, { defaultValue: type });

  const { groups, unowned } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, typeof apps>();
    const noOwner: typeof apps = [];
    for (const app of apps) {
      const value = String(app.attributes?.[groupBy] || app.attributes?.["avdelning/enhet"] || "").trim();
      if (!value) { noOwner.push(app); continue; }
      const list = map.get(value) || [];
      list.push(app);
      map.set(value, list);
    }
    const sorted = Array.from(map.entries())
      .map(([owner, appList]) => ({ owner, apps: appList.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.apps.length - a.apps.length);
    return { groups: sorted, unowned: noOwner.sort((a, b) => a.name.localeCompare(b.name)) };
  }, [nodes, groupBy]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.owners.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.owners.description")}</Typography>

      <Autocomplete
        sx={{ mb: 2, maxWidth: 420 }} size="small" options={people} value={person}
        getOptionLabel={(p) => p.name} isOptionEqualToValue={(a, b) => a.name === b.name}
        onChange={(_, v) => setPerson(v)} noOptionsText={t("reports.owners.noPerson")}
        renderOption={(props, p) => (
          <li {...props} key={p.name}>
            <Box sx={{ flex: 1 }}>{p.name}</Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>{p.objects.length}</Typography>
          </li>
        )}
        renderInput={(params) => (
          <TextField {...params} label={t("reports.owners.searchPerson")} helperText={t("reports.owners.searchPersonHint")} />
        )}
      />

      {person && (
        <Card sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ p: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>{person.name}</Typography>
            {ROLE_FIELDS.filter((f) => person.perRole[f]).map((f) => (
              <Chip key={f} size="small" label={`${roleName(f)}: ${person.perRole[f]}`} />
            ))}
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell>{t("reports.owners.object")}</TableCell>
                  <TableCell>{t("reports.owners.type")}</TableCell>
                  <TableCell>{t("reports.owners.roles")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {person.objects.map((o) => {
                  const route = TYPE_ROUTES[o.node_type];
                  return (
                    <TableRow key={o.node_id} hover={!!route} sx={route ? { cursor: "pointer" } : undefined}
                      onClick={() => route && navigate(`${route}?id=${o.node_id}`)}>
                      <TableCell><Typography variant="body2">{o.node_name}</Typography></TableCell>
                      <TableCell><Typography variant="caption" sx={{ color: "text.secondary" }}>{typeName(o.node_type)}</Typography></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                          {o.roles.map((f) => <Chip key={f} size="small" variant="outlined" label={roleName(f)} />)}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {!person && (<>
      <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: "center" }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{t("reports.owners.groupBy")}</InputLabel>
          <Select value={groupBy} label={t("reports.owners.groupBy")} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <MenuItem value="systemägare">{t("reports.owners.systemOwner")}</MenuItem>
            <MenuItem value="systemförvaltare">{t("reports.owners.systemManager")}</MenuItem>
            <MenuItem value="systemadministratör">{t("reports.owners.systemAdmin")}</MenuItem>
            <MenuItem value="avdelning">{t("reports.owners.department")}</MenuItem>
          </Select>
        </FormControl>
        <Chip label={`${groups.length}`} variant="outlined" />
        {unowned.length > 0 && <Chip icon={<WarningAmberIcon />} label={`${unowned.length} ${t("reports.owners.unassigned").toLowerCase()}`} color="warning" size="small" />}
      </Stack>

      {groups.map((g) => (
        <Card key={g.owner} sx={{ mb: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell colSpan={3}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{g.owner}</Typography>
                      <Chip label={g.apps.length} size="small" />
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {g.apps.map((app) => (
                  <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                    <TableCell><Typography variant="body2">{app.name}</Typography></TableCell>
                    <TableCell><Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>{String(app.attributes?.kategori || "")}</Typography></TableCell>
                    <TableCell><Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>{String(app.attributes?.status || "")}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ))}

      {unowned.length > 0 && (
        <Card sx={{ border: "2px solid", borderColor: "warning.main" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "warning.50" }}>
                  <TableCell colSpan={3}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <WarningAmberIcon color="warning" fontSize="small" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "warning.dark" }}>
                        {t("reports.owners.unassigned")} ({t("reports.owners.unassignedDesc")})
                      </Typography>
                      <Chip label={unowned.length} size="small" color="warning" />
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unowned.map((app) => (
                  <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                    <TableCell><Typography variant="body2">{app.name}</Typography></TableCell>
                    <TableCell><Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>{String(app.attributes?.kategori || "")}</Typography></TableCell>
                    <TableCell><Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>{String(app.attributes?.status || "")}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
      </>)}
    </Box>
  );
};

export default ReportOwners;
