import { useEffect, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useArkflow, type ArkflowSummary } from "@/api/arkflows";
import FlowSceneView from "./FlowSceneView";

/**
 * The Systemprocesser tab on an application: the flowcharts published onto it
 * from Arkitekten's Systemprocess tool.
 *
 * An application can have several. They are listed as chips above the canvas
 * and one is drawn at a time — each scene is fetched only when it is shown,
 * since one can be ~100 kB.
 */
export default function SystemProcessesTab({ flows }: { flows: ArkflowSummary[] }) {
  const { t } = useTranslation();
  const [valdId, setValdId] = useState<string | null>(flows[0]?.id ?? null);

  // Another application selected: start on its first systemprocess.
  useEffect(() => {
    if (!flows.some((f) => f.id === valdId)) setValdId(flows[0]?.id ?? null);
  }, [flows, valdId]);

  const flöde = useArkflow(valdId);
  const f = flöde.data;

  if (flows.length === 0) {
    return (
      <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ color: "text.secondary" }}>{t("flowScene.systemProcessesNone")}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {flows.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, flexWrap: "wrap", rowGap: 1, borderBottom: 1, borderColor: "divider" }}>
          {flows.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              size="small"
              color={s.id === valdId ? "primary" : "default"}
              variant={s.id === valdId ? "filled" : "outlined"}
              onClick={() => setValdId(s.id)}
            />
          ))}
        </Stack>
      )}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {f?.scen ? (
          <FlowSceneView
            scen={f.scen}
            caption={`${f.name}${f.beteckning ? ` · ${t("flowScene.version")} ${f.beteckning}` : ""}${f.status ? ` (${f.status})` : ""}${f.ägare ? ` · ${t("flowScene.ownerSystem")}: ${f.ägare}` : ""}`}
            beskrivning={f.beskrivning ?? undefined}
          />
        ) : (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "text.secondary" }}>
              {flöde.isLoading ? t("flowScene.loading") : t("flowScene.none")}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
