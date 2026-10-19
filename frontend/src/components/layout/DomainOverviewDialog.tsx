import React, { useState } from "react";
import {
  AppBar, Box, Button, Card, CardContent, Chip, Dialog, Divider, Grid,
  IconButton, Slide, Stack, Toolbar, Typography,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import CloseIcon from "@mui/icons-material/Close";
import LaunchIcon from "@mui/icons-material/Launch";
import FlagIcon from "@mui/icons-material/Flag";
import BusinessIcon from "@mui/icons-material/Business";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AppsIcon from "@mui/icons-material/Apps";
import DnsIcon from "@mui/icons-material/Dns";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useModules } from "@/api/orgSettings";
import { useNodes } from "@/api/nodes";
import { useTargetArchitecture, type DomainKey, type DomainSection } from "@/api/targetArchitecture";
import { DomainPyramid } from "@/components/targetArchitecture/DomainPyramid";
import type { NodeType } from "@/types/graph";
import { useRoleStore } from "@/store/roleStore";
import { isCountedProcess, isStructural, structuralProcessIds } from "@/utils/processStructure";

interface DomainInfo {
  key: DomainKey;
  /** Sidebar label — same wording as the nav group. */
  navKey: string;
  english: string;
  accent: string;
  icon: React.ReactNode;
  /** Node types that live in this layer, with the label used on the home page. */
  counts: Array<{ type: NodeType; labelKey: string }>;
  links: Array<{ path: string; labelKey: string }>;
}

/** The four BDAT layers, top to bottom — same order as the pyramid. */
const DOMAINS: DomainInfo[] = [
  {
    key: "business",
    navKey: "nav.domain.business",
    english: "Business",
    accent: "#4CAF50",
    icon: <BusinessIcon />,
    counts: [{ type: "Process", labelKey: "home.stats.processes" }],
    links: [{ path: "/processes", labelKey: "nav.processExplorer" }],
  },
  {
    key: "data",
    navKey: "nav.domain.information",
    english: "Data",
    accent: "#FF9800",
    icon: <FolderOpenIcon />,
    counts: [
      { type: "InformationObject", labelKey: "home.stats.infoObjects" },
      { type: "InformationSource", labelKey: "home.stats.infoSources" },
    ],
    links: [
      { path: "/info-objects", labelKey: "nav.infoObjects" },
      { path: "/info-sources", labelKey: "nav.infoSources" },
    ],
  },
  {
    key: "application",
    navKey: "nav.domain.application",
    english: "Application",
    accent: "#2196F3",
    icon: <AppsIcon />,
    counts: [{ type: "Application", labelKey: "home.stats.applications" }],
    links: [
      { path: "/systems", labelKey: "nav.systemView" },
      { path: "/landscape", labelKey: "nav.landscape" },
    ],
  },
  {
    key: "technology",
    navKey: "nav.domain.technology",
    english: "Technology",
    accent: "#9C27B0",
    icon: <DnsIcon />,
    counts: [
      { type: "TechnologyComponent", labelKey: "home.stats.techComponents" },
      { type: "Server", labelKey: "home.stats.servers" },
      { type: "ServerService", labelKey: "nav.serverServices" },
    ],
    links: [
      { path: "/tech-components", labelKey: "nav.techComponents" },
      { path: "/servers", labelKey: "nav.servers" },
      { path: "/server-services", labelKey: "nav.serverServices" },
    ],
  },
];

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const cardId = (key: DomainKey) => `domain-overview-${key}`;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen summary of the BDAT model behind the "Domän" menu: the whole
 * pyramid up top, then one card per domain with its own pyramid, what it
 * answers, how many objects the portal holds and where to explore them.
 *
 * The per-domain wording comes from Målarkitektur when that document has a
 * section for the domain, so the two never drift apart; the built-in text in
 * the translation files is the fallback for an empty document.
 */
const DomainOverviewDialog: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const serverAccess = useRoleStore((s) => s.serverAccess);
  const canSeeServers = serverAccess !== "none";
  const navigate = useNavigate();
  const governance = useModules().enabled("governance");
  const [highlight, setHighlight] = useState<DomainKey | null>(null);
  const { data: nodes } = useNodes();
  const { data: targetArchitecture } = useTargetArchitecture();

  const sectionFor = (key: DomainKey) =>
    targetArchitecture?.content.sections.find(
      (s): s is DomainSection => s.kind === "domain" && s.domain_key === key,
    );

  const structuralIds = React.useMemo(() => structuralProcessIds(nodes ?? []), [nodes]);
  const countOf = (type: NodeType) =>
    nodes
      ? nodes.filter((n) =>
          type === "Process"
            ? isCountedProcess(n, structuralIds)
            : n.type === type && !n.admin_hidden && !isStructural(n, structuralIds),
        ).length
      : null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  /** Clicking a pyramid layer highlights it and scrolls its card into view. */
  const focusDomain = (key: DomainKey) => {
    setHighlight(key);
    document.getElementById(cardId(key))?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Dialog fullScreen open={open} onClose={onClose} TransitionComponent={Transition}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>{t("domainOverview.title")}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t("domainOverview.subtitle")}
            </Typography>
          </Box>
          <IconButton edge="end" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: "auto", width: "100%" }}>
        {/* Summary: the model on the left, what it means on the right */}
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={5}>
            <DomainPyramid
              highlight={highlight}
              showSideLabels
              height={340}
              onSelect={focusDomain}
              caption={t("domainOverview.pyramidCaption")}
            />
          </Grid>
          <Grid item xs={12} md={7}>
            <Stack spacing={2}>
              <Typography variant="h5" fontWeight={700}>{t("domainOverview.heading")}</Typography>
              {["intro1", "intro2", "intro3"].map((k) => (
                <Typography key={k} variant="body1" color="text.secondary">
                  {t(`domainOverview.${k}`)}
                </Typography>
              ))}
              {governance && (
                <Box>
                  <Button
                    size="small"
                    startIcon={<FlagIcon fontSize="small" />}
                    onClick={() => go("/target-architecture")}
                  >
                    {t("domainOverview.openTargetArchitecture")}
                  </Button>
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4 }} />

        {/* One card per domain */}
        <Grid container spacing={3} alignItems="stretch">
          {DOMAINS.map((domain) => {
            const section = sectionFor(domain.key);
            const describes = section?.describes || t(`domainOverview.domains.${domain.key}.describes`);
            const answers = section?.answers || t(`domainOverview.domains.${domain.key}.answers`);
            const isHighlighted = highlight === domain.key;
            return (
              <Grid item xs={12} sm={6} lg={3} key={domain.key}>
                <Card
                  id={cardId(domain.key)}
                  variant="outlined"
                  onMouseEnter={() => setHighlight(domain.key)}
                  onMouseLeave={() => setHighlight(null)}
                  sx={{
                    height: "100%",
                    borderTop: `4px solid ${domain.accent}`,
                    boxShadow: isHighlighted ? 4 : 0,
                    transition: "box-shadow 120ms",
                  }}
                >
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ color: domain.accent, display: "flex" }}>{domain.icon}</Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {t(domain.navKey)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {domain.english}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={t(`domainOverview.domains.${domain.key}.question`)}
                          sx={{
                            bgcolor: `${domain.accent}22`,
                            color: domain.accent,
                            fontWeight: 700,
                          }}
                        />
                      </Stack>

                      <DomainPyramid highlight={domain.key} height={150} />

                      <Box>
                        <Typography variant="caption" fontWeight={700} sx={{ color: domain.accent }}>
                          {t("domainOverview.describes")}
                        </Typography>
                        <Typography variant="body2">{describes}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" fontWeight={700} sx={{ color: domain.accent }}>
                          {t("domainOverview.answers")}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ whiteSpace: "pre-line" }}
                        >
                          {answers}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {domain.counts.filter((c) => (c.type !== "Server" && c.type !== "ServerService") || canSeeServers).map(({ type, labelKey }) => {
                          const count = countOf(type);
                          return (
                            <Chip
                              key={type}
                              size="small"
                              variant="outlined"
                              label={`${count === null ? "…" : count} ${t(labelKey).toLowerCase()}`}
                            />
                          );
                        })}
                      </Stack>

                      <Stack spacing={0.5} alignItems="flex-start">
                        {domain.links.filter((l) => (l.path !== "/servers" && l.path !== "/server-services") || canSeeServers).map((link) => (
                          <Button
                            key={link.path}
                            size="small"
                            endIcon={<LaunchIcon fontSize="small" />}
                            onClick={() => go(link.path)}
                            sx={{ color: domain.accent }}
                          >
                            {t(link.labelKey)}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Dialog>
  );
};

export default DomainOverviewDialog;
