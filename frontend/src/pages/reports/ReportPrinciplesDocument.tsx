import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import {
  PRINCIPLE_DOMAINS,
  type Principle,
  type PrincipleDomain,
  type PrincipleStatus,
  usePrinciples,
} from "@/api/principles";
import {
  type PrincipleDocumentSectionKey,
  type PrincipleDocumentSections,
  usePrincipleDocument,
  useUpdatePrincipleDocument,
  usePrincipleDocumentVersions,
  downloadPrincipleDocumentPdf,
  downloadPrincipleDocumentVersionPdf,
} from "@/api/principleDocument";
import { useRoleStore } from "@/store/roleStore";
import { genitive, useOrgName } from "@/api/orgSettings";
import DocumentExportPanel from "@/components/common/DocumentExportPanel";

const STATUS_COLORS: Record<PrincipleStatus, "default" | "primary" | "success" | "warning"> = {
  "Förslag": "default",
  "Beslutad": "warning",
  "Infört": "success",
  "Avvecklad": "default",
};

const SUB_DOMAINS: PrincipleDomain[] = ["Verksamhet", "Information", "Applikation", "Teknik"];

const ReportPrinciplesDocument: React.FC = () => {
  const orgName = useOrgName();
  const { isEditor: isAdmin } = useRoleStore();
  const { data: principles, isLoading: loadingPrinciples } = usePrinciples();
  const { data: document, isLoading: loadingDoc } = usePrincipleDocument();
  const updateDoc = useUpdatePrincipleDocument();
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } =
    usePrincipleDocumentVersions();

  const [editing, setEditing] = useState<{
    key: PrincipleDocumentSectionKey;
    title: string;
    value: string;
  } | null>(null);

  if (loadingPrinciples || loadingDoc) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const sections = document?.sections ?? {
    introduction: "",
    decision_forum: "",
    deviation_handling: "",
    target_arch_alignment: "",
  };

  const visiblePrinciples = (principles ?? []).filter((p) => p.status !== "Avvecklad");
  const overarching = visiblePrinciples
    .filter((p) => p.domain === "Övergripande")
    .sort((a, b) => a.identifier.localeCompare(b.identifier, "sv"));

  const principlesByDomain = (domain: PrincipleDomain): Principle[] =>
    visiblePrinciples
      .filter((p) => p.domain === domain)
      .sort((a, b) => a.identifier.localeCompare(b.identifier, "sv"));

  const openEdit = (key: PrincipleDocumentSectionKey, title: string) => {
    setEditing({ key, title, value: sections[key] ?? "" });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateDoc.mutateAsync({ [editing.key]: editing.value } as Partial<PrincipleDocumentSections>);
    setEditing(null);
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, sm: 4 } }} className="print-document">
      <Box
        className="no-print"
        sx={{ mb: 2 }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
          Senast uppdaterad: {document ? new Date(document.updated_at).toLocaleString("sv-SE") : "—"}
        </Typography>
        <DocumentExportPanel
          title="Arkitekturprinciper"
          documentType="principle_document"
          versions={versions}
          isLoading={versionsLoading}
          isAdmin={isAdmin}
          onDownload={(opts) => downloadPrincipleDocumentPdf(opts)}
          onDownloadVersion={(id) => downloadPrincipleDocumentVersionPdf(id)}
          onVersionsRefresh={() => { void refetchVersions(); }}
          availableStatuses={["Förslag", "Beslutad", "Infört"]}
        />
      </Box>

      <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        {orgName ? `Principer – ${genitive(orgName)} IT-arkitektur` : "Principer för IT-arkitekturen"}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 4 }}>
        Styrande principer för arkitekturarbetet
      </Typography>

      {/* 1. Inledning */}
      <SectionHeading number="1" title="Inledning" isAdmin={isAdmin} onEdit={() => openEdit("introduction", "Inledning")} />
      <PreText text={sections.introduction} placeholder="(inledning ej ifylld)" />

      {/* 2. Övergripande principer */}
      <SectionHeading number="2" title="Övergripande principer" />
      {overarching.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic", mb: 2 }}>
          (Inga övergripande principer registrerade)
        </Typography>
      ) : (
        overarching.map((p, i) => <PrincipleBlock key={p.id} principle={p} ordinal={i + 1} />)
      )}

      {/* 3. Principer per arkitekturområde */}
      <SectionHeading number="3" title="Principer per arkitekturområde" />
      {SUB_DOMAINS.map((domain, idx) => {
        const list = principlesByDomain(domain);
        return (
          <Box key={domain} sx={{ mb: 3 }}>
            <Typography variant="h5" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1.5 }}>
              3.{idx + 1} {domain}
            </Typography>
            {list.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                (Inga principer registrerade)
              </Typography>
            ) : (
              list.map((p, i) => <PrincipleBlock key={p.id} principle={p} ordinal={i + 1} />)
            )}
          </Box>
        );
      })}

      {/* 4. Beslutsordning och undantag */}
      <SectionHeading number="4" title="Beslutsordning och undantag" />
      <SubsectionHeading
        number="4.1"
        title="Forum för arkitekturfrågor"
        isAdmin={isAdmin}
        onEdit={() => openEdit("decision_forum", "Forum för arkitekturfrågor")}
      />
      <PreText text={sections.decision_forum} placeholder="(ej ifyllt)" />

      <SubsectionHeading
        number="4.2"
        title="Avvikelsehantering"
        isAdmin={isAdmin}
        onEdit={() => openEdit("deviation_handling", "Avvikelsehantering")}
      />
      <PreText text={sections.deviation_handling} placeholder="(ej ifyllt)" />

      {/* 5. Koppling till målarkitektur */}
      <SectionHeading number="5" title="Koppling till målarkitektur" />
      <SubsectionHeading
        number="5.1"
        title="Hur principerna stödjer önskat läge"
        isAdmin={isAdmin}
        onEdit={() => openEdit("target_arch_alignment", "Hur principerna stödjer önskat läge")}
      />
      <PreText text={sections.target_arch_alignment} placeholder="(ej ifyllt)" />

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="md">
        <DialogTitle>Redigera: {editing?.title}</DialogTitle>
        <DialogContent>
          <TextField
            value={editing?.value ?? ""}
            onChange={(e) => setEditing(editing ? { ...editing, value: e.target.value } : null)}
            fullWidth
            multiline
            minRows={10}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Avbryt</Button>
          <Button onClick={saveEdit} variant="contained" disabled={updateDoc.isPending}>
            {updateDoc.isPending ? "Sparar…" : "Spara"}
          </Button>
        </DialogActions>
      </Dialog>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-document { padding: 0 !important; max-width: 100% !important; }
          aside, header, .MuiDrawer-root, .MuiAppBar-root { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
    </Box>
  );
};

interface HeadingProps {
  number: string;
  title: string;
  isAdmin?: boolean;
  onEdit?: () => void;
}

const SectionHeading: React.FC<HeadingProps> = ({ number, title, isAdmin, onEdit }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 5, mb: 2, pb: 1, borderBottom: "2px solid #ddd" }}>
    <Typography variant="h4" component="h2" sx={{ fontWeight: 700, flexGrow: 1 }}>
      {number}. {title}
    </Typography>
    {isAdmin && onEdit && (
      <Tooltip title="Redigera">
        <IconButton size="small" onClick={onEdit} className="no-print">
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    )}
  </Stack>
);

const SubsectionHeading: React.FC<HeadingProps> = ({ number, title, isAdmin, onEdit }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 3, mb: 1.5 }}>
    <Typography variant="h6" component="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>
      {number} {title}
    </Typography>
    {isAdmin && onEdit && (
      <Tooltip title="Redigera">
        <IconButton size="small" onClick={onEdit} className="no-print">
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    )}
  </Stack>
);

const PreText: React.FC<{ text: string; placeholder: string }> = ({ text, placeholder }) => (
  <Typography
    variant="body1"
    sx={{
      whiteSpace: "pre-wrap",
      mb: 2,
      lineHeight: 1.7,
      color: text ? "text.primary" : "text.disabled",
      fontStyle: text ? "normal" : "italic",
    }}
  >
    {text || placeholder}
  </Typography>
);

const PrincipleBlock: React.FC<{ principle: Principle; ordinal: number }> = ({ principle, ordinal }) => (
  <Box
    sx={{
      mb: 3,
      pb: 2,
      borderBottom: "1px solid #eee",
      pageBreakInside: "avoid",
      WebkitColumnBreakInside: "avoid",
    }}
  >
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1 }}>
      <Typography variant="h6" component="h4" sx={{ fontWeight: 600 }}>
        {ordinal}. {principle.name}
      </Typography>
      <Chip
        label={principle.identifier}
        size="small"
        variant="outlined"
        sx={{ fontWeight: 600, fontSize: 11 }}
      />
      <Chip
        label={principle.status}
        size="small"
        color={STATUS_COLORS[principle.status]}
        variant={principle.status === "Förslag" ? "outlined" : "filled"}
        sx={{ fontSize: 11 }}
      />
    </Stack>

    {principle.purpose && (
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
          Syfte
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {principle.purpose}
        </Typography>
      </Box>
    )}
    {principle.not && (
      <Box sx={{ mb: 1 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: "#c62828" }}>
          Inte:
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>
          "{principle.not}"
        </Typography>
      </Box>
    )}
    {principle.but && (
      <Box sx={{ mb: 1 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: "#2e7d32" }}>
          Utan:
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>
          "{principle.but}"
        </Typography>
      </Box>
    )}
    {principle.means && (
      <Box sx={{ mb: 1 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
          Innebär att
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {principle.means}
        </Typography>
      </Box>
    )}
  </Box>
);

export default ReportPrinciplesDocument;
