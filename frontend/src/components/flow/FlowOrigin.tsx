/**
 * Where a process diagram comes from, and whether it is still kept in step.
 *
 * A diagram that an integration reads into Arkitekten from another system is
 * not drawn by anyone here: it is generated from the source, and it is in the
 * source that the process is changed. The reader should see that at the
 * diagram – and whether the sync that keeps it current is still running.
 */
import { Chip, Stack, Tooltip, Typography } from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import SyncDisabledIcon from "@mui/icons-material/SyncDisabled";
import { useTranslation } from "react-i18next";
import type { ArkflowSummary } from "@/api/arkflows";
import { useArkflowSynk } from "@/api/arkflows";

function tid(iso: string | null, språk: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const idag = new Date().toDateString() === d.toDateString();
  return d.toLocaleString(språk, idag ? { hour: "2-digit", minute: "2-digit" } : { dateStyle: "short", timeStyle: "short" });
}

export default function FlowOrigin({ flow }: { flow: ArkflowSummary }) {
  const { t, i18n } = useTranslation();
  const ursprung = flow.ursprung;
  const synk = useArkflowSynk(flow.id, Boolean(ursprung?.automatisk)).data;
  if (!ursprung) return null;

  const system = ursprung.system;
  const senast = tid(synk?.senast ?? null, i18n.language);
  const nästa = tid(synk?.nästa ?? null, i18n.language);
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {t(ursprung.automatisk ? "flowScene.originAuto" : "flowScene.origin", { system })}
      </Typography>
      {synk?.känd && (
        <Tooltip title={t(synk.aktiv ? "flowScene.syncActiveHelp" : "flowScene.syncOffHelp", { system })}>
          <Chip
            size="small"
            variant="outlined"
            color={synk.aktiv ? "success" : "warning"}
            icon={synk.aktiv ? <SyncIcon /> : <SyncDisabledIcon />}
            label={[
              t(synk.aktiv ? "flowScene.syncActive" : "flowScene.syncOff"),
              senast ? t("flowScene.syncLast", { when: senast }) : null,
              synk.aktiv && nästa ? t("flowScene.syncNext", { when: nästa }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            sx={{ height: 22 }}
          />
        </Tooltip>
      )}
    </Stack>
  );
}
