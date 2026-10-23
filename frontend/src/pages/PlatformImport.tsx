import { useState, useMemo } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, FormControl,
  InputLabel, MenuItem, Select, Step, StepContent, StepLabel,
  Stepper, Table, TableBody, TableCell, TableRow,
  TextField, Typography,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useSnackbar } from "notistack";
import SaveIcon from "@mui/icons-material/Save";
import {
  usePlatformSources,
  useSourceFields,
  useNodeTypes,
  useExecutePlatformImport,
  type FieldMapping,
  type PlatformImportResult,
} from "@/api/platformImport";
import { useSaveSyncProfile } from "@/api/sync";
import MappingTable, { autoMatchFields, type EaField, type FieldMap } from "@/components/sync/MappingTable";

export default function PlatformImport() {
  const { enqueueSnackbar } = useSnackbar();
  const [activeStep, setActiveStep] = useState(0);
  const [platformUrl, setPlatformUrl] = useState("");
  const [platformApiKey, setPlatformApiKey] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [selectedNodeType, setSelectedNodeType] = useState("");
  const [importResult, setImportResult] = useState<PlatformImportResult | null>(null);

  // Mapping: EA target → platform source field (empty = not mapped)
  const [fieldMap, setFieldMap] = useState<FieldMap>({});

  const { data: sources, error: sourcesError } = usePlatformSources(platformUrl, platformApiKey);
  const { data: fieldsData } = useSourceFields(selectedFlowId, platformUrl, platformApiKey);
  const { data: nodeTypesData } = useNodeTypes();
  const executeMutation = useExecutePlatformImport();
  const saveSyncProfile = useSaveSyncProfile();
  const [profileSaved, setProfileSaved] = useState(false);

  const sourceFields = fieldsData?.fields || [];
  const nodeTypes = nodeTypesData?.node_types || [];
  const selectedSource = sources?.find((s) => s.flow_id === selectedFlowId);
  const selectedNodeTypeInfo = nodeTypes.find((nt) => nt.type === selectedNodeType);

  // All EA fields for the selected node type
  const eaFields = useMemo<EaField[]>(() => {
    if (!selectedNodeTypeInfo) return [];
    return [
      ...selectedNodeTypeInfo.core_fields.map((f) => ({ ...f, group: "Core" as const })),
      ...selectedNodeTypeInfo.suggested_attributes.map((f) => ({ ...f, group: "Attribute" as const })),
    ];
  }, [selectedNodeTypeInfo]);

  // Convert fieldMap to FieldMapping[] for the API
  const getMappings = (): FieldMapping[] => {
    return Object.entries(fieldMap)
      .filter(([, source]) => source)
      .map(([target, source]) => ({ source_field: source, target }));
  };

  const hasNameMapping = !!fieldMap["name"];

  const handleImport = async () => {
    const mappings = getMappings();
    if (!mappings.some((m) => m.target === "name")) {
      enqueueSnackbar("Name must be mapped", { variant: "error" });
      return;
    }
    try {
      const result = await executeMutation.mutateAsync({
        platform_url: platformUrl,
        platform_api_key: platformApiKey,
        flow_id: selectedFlowId,
        node_type: selectedNodeType,
        external_source_label: selectedSource?.connector_type?.toUpperCase() || "PLATFORM",
        mappings,
      });
      setImportResult(result);
      setActiveStep(4);
      enqueueSnackbar(`Import complete: ${result.created} created, ${result.updated} updated`, { variant: "success" });
    } catch (err: any) {
      enqueueSnackbar(err.message || "Import failed", { variant: "error" });
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Import from Integration Platform</Typography>
      <Typography variant="body2" gutterBottom sx={{ color: "text.secondary" }}>
        Connect to the Integration Platform, select a data source, and map fields to EA node attributes.
      </Typography>

      <Stepper activeStep={activeStep} orientation="vertical" sx={{ mt: 3 }}>
        {/* Step 1: Connect */}
        <Step>
          <StepLabel>Connect to Integration Platform</StepLabel>
          <StepContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Platform API URL" fullWidth value={platformUrl}
                onChange={(e) => setPlatformUrl(e.target.value)}
                placeholder="https://integration.example.org/api/v1"
                helperText="The Integration Platform's API base URL. Leave empty to use the installation's INTEGRATION_PLATFORM_URL."
              />
              <TextField label="Platform API Key" fullWidth type="password" autoComplete="new-password"
                value={platformApiKey} onChange={(e) => setPlatformApiKey(e.target.value)}
                helperText="Consumer API key from the Integration Platform (Settings > Consumer API Keys)"
              />
              {sourcesError && <Alert severity="error">Cannot connect. Check the URL and API key.</Alert>}
              {sources && sources.length > 0 && (
                <Alert severity="success">Connected! Found {sources.length} data source{sources.length !== 1 ? "s" : ""}.</Alert>
              )}
              <Button variant="contained" onClick={() => setActiveStep(1)} disabled={!sources || sources.length === 0}>Continue</Button>
            </Box>
          </StepContent>
        </Step>

        {/* Step 2: Select source + node type */}
        <Step>
          <StepLabel>Select data source and node type</StepLabel>
          <StepContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Data Source</InputLabel>
                <Select value={selectedFlowId} label="Data Source"
                  onChange={(e) => { setSelectedFlowId(e.target.value); setFieldMap({}); }}>
                  {sources?.map((s) => (
                    <MenuItem key={s.flow_id} value={s.flow_id}>
                      {s.flow_name} ({s.connector_type}) — {s.record_count} records
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>EA Node Type</InputLabel>
                <Select value={selectedNodeType} label="EA Node Type"
                  onChange={(e) => { setSelectedNodeType(e.target.value); setFieldMap({}); }}>
                  {nodeTypes.map((nt) => <MenuItem key={nt.type} value={nt.type}>{nt.type}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button onClick={() => setActiveStep(0)}>Back</Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    const map = autoMatchFields(eaFields, sourceFields);
                    setFieldMap(map);
                    enqueueSnackbar(`Auto-matched ${Object.keys(map).length} of ${eaFields.length} fields`, { variant: "info" });
                    setActiveStep(2);
                  }}
                  disabled={!selectedFlowId || !selectedNodeType}
                >
                  Continue
                </Button>
              </Box>
            </Box>
          </StepContent>
        </Step>

        {/* Step 3: Map fields — EA fields on the left */}
        <Step>
          <StepLabel>Map fields</StepLabel>
          <StepContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <MappingTable
                sourceFields={sourceFields}
                eaFields={eaFields}
                value={fieldMap}
                onChange={setFieldMap}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button onClick={() => setActiveStep(1)}>Back</Button>
                <Button variant="contained" onClick={() => setActiveStep(3)} disabled={!hasNameMapping}>
                  Continue
                </Button>
              </Box>
            </Box>
          </StepContent>
        </Step>

        {/* Step 4: Review */}
        <Step>
          <StepLabel>Review and import</StepLabel>
          <StepContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>Source</Typography>
                  <Typography gutterBottom>{selectedSource?.flow_name} — {selectedSource?.record_count} records</Typography>
                  <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>Node Type</Typography>
                  <Typography gutterBottom>{selectedNodeType}</Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
                    Field Mappings ({getMappings().length})
                  </Typography>
                  <Table size="small">
                    <TableBody>
                      {getMappings().map((m, i) => {
                        const eaField = eaFields.find((f) => f.target === m.target);
                        return (
                          <TableRow key={i}>
                            <TableCell sx={{ fontWeight: 500, border: 0, py: 0.3 }}>{eaField?.label || m.target}</TableCell>
                            <TableCell sx={{ border: 0, py: 0.3, color: "text.secondary" }}>&larr;</TableCell>
                            <TableCell sx={{ border: 0, py: 0.3, fontFamily: "monospace", fontSize: 13 }}>{m.source_field}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button onClick={() => setActiveStep(2)}>Back</Button>
                <Button variant="contained" color="success" startIcon={<SyncIcon />}
                  onClick={handleImport} disabled={executeMutation.isPending}>
                  {executeMutation.isPending ? "Importing..." : `Import ${selectedSource?.record_count || 0} records`}
                </Button>
              </Box>
            </Box>
          </StepContent>
        </Step>

        {/* Step 5: Result */}
        <Step>
          <StepLabel>Done</StepLabel>
          <StepContent>
            {importResult && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Alert severity={importResult.errors.length > 0 ? "warning" : "success"} icon={<CheckCircleIcon />}>
                  Import complete: {importResult.total} records processed
                </Alert>
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Chip label={`${importResult.created} created`} color="success" />
                  <Chip label={`${importResult.updated} updated`} color="info" />
                  {importResult.errors.length > 0 && <Chip label={`${importResult.errors.length} errors`} color="error" />}
                </Box>
                {importResult.errors.length > 0 && (
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="error">Errors:</Typography>
                      {importResult.errors.slice(0, 10).map((e, i) => (
                        <Typography key={i} variant="body2" sx={{ color: "text.secondary" }}>{e}</Typography>
                      ))}
                    </CardContent>
                  </Card>
                )}
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" gutterBottom>Automatic sync</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
                  Save this configuration as a sync profile so the Integration Platform can automatically push updates to the EA Application whenever the flow runs.
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    disabled={profileSaved || saveSyncProfile.isPending}
                    onClick={async () => {
                      try {
                        await saveSyncProfile.mutateAsync({
                          flow_id: selectedFlowId,
                          flow_name: selectedSource?.flow_name || "",
                          node_type: selectedNodeType,
                          external_source_label: selectedSource?.connector_type?.toUpperCase() || "PLATFORM",
                          platform_url: platformUrl,
                          platform_api_key: platformApiKey,
                          mappings: getMappings(),
                          enabled: true,
                        });
                        setProfileSaved(true);
                        enqueueSnackbar("Sync profile saved! Configure the webhook URL in the Integration Platform.", { variant: "success" });
                      } catch {
                        enqueueSnackbar("Failed to save sync profile", { variant: "error" });
                      }
                    }}
                  >
                    {profileSaved ? "Profile saved" : "Save as sync profile"}
                  </Button>
                  <Button variant="outlined" onClick={() => { setActiveStep(0); setImportResult(null); setFieldMap({}); setProfileSaved(false); }}>
                    Import more data
                  </Button>
                </Box>
              </Box>
            )}
          </StepContent>
        </Step>
      </Stepper>
    </Box>
  );
}
