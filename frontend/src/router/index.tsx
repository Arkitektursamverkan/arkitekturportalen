import React, { lazy, Suspense } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Alert, Box } from "@mui/material";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useModules } from "@/api/orgSettings";
import { useRoleStore } from "@/store/roleStore";

const Home = lazy(() => import("@/pages/Home"));
const ProcessExplorer = lazy(() => import("@/pages/ProcessExplorer"));
const BusinessCalendar = lazy(() => import("@/pages/BusinessCalendar"));
const SystemView = lazy(() => import("@/pages/SystemView"));
const Landscape = lazy(() => import("@/pages/Landscape"));
const InfoObjectExplorer = lazy(() => import("@/pages/InfoObjectExplorer"));
const InfoSourceExplorer = lazy(() => import("@/pages/InfoSourceExplorer"));
const ServerView = lazy(() => import("@/pages/ServerView"));
const ServerServiceView = lazy(() => import("@/pages/ServerServiceView"));
const TechComponentExplorer = lazy(() => import("@/pages/TechComponentExplorer"));
const ReportOverlapGaps = lazy(() => import("@/pages/reports/ReportOverlapGaps"));
const TargetArchitecture = lazy(() => import("@/pages/TargetArchitecture"));
const SolutionSketchList = lazy(() => import("@/pages/SolutionSketchList"));
const SolutionSketchDetail = lazy(() => import("@/pages/SolutionSketchDetail"));
const SolutionSketchPrint = lazy(() => import("@/pages/SolutionSketchPrint"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Settings = lazy(() => import("@/pages/Settings"));
const OrgSettings = lazy(() => import("@/pages/OrgSettings"));
const ImportCSV = lazy(() => import("@/pages/ImportCSV"));
const Connections = lazy(() => import("@/pages/Connections"));
const DataManagement = lazy(() => import("@/pages/DataManagement"));
const NavigationSettings = lazy(() => import("@/pages/NavigationSettings"));
const CreateNode = lazy(() => import("@/pages/CreateNode"));
const PlatformImport = lazy(() => import("@/pages/PlatformImport"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const SyncProfiles = lazy(() => import("@/pages/SyncProfiles"));
const ArchitecturePrinciples = lazy(() => import("@/pages/ArchitecturePrinciples"));
const Glossary = lazy(() => import("@/pages/Glossary"));
const ArchitectureJourneyPage = lazy(() => import("@/pages/ArchitectureJourneyPage"));
const Nulaagesanalys = lazy(() => import("@/pages/Nulaagesanalys"));
const GapAnalys = lazy(() => import("@/pages/GapAnalys"));
const GapProgressReport = lazy(() => import("@/pages/GapProgressReport"));
const ReportChanges = lazy(() => import("@/pages/reports/ReportChanges"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const AccessManagement = lazy(() => import("@/pages/AccessManagement"));
const SurveyList = lazy(() => import("@/pages/SurveyList"));
const SurveyEdit = lazy(() => import("@/pages/SurveyEdit"));
const SurveyReview = lazy(() => import("@/pages/SurveyReview"));
const SurveyReport = lazy(() => import("@/pages/SurveyReport"));
const MySurveys = lazy(() => import("@/pages/MySurveys"));
const SurveyRespond = lazy(() => import("@/pages/SurveyRespond"));
const SurveyLinkResolver = lazy(() => import("@/pages/SurveyLinkResolver"));
const WorkspaceList = lazy(() => import("@/pages/WorkspaceList"));
const WorkspaceDetail = lazy(() => import("@/pages/WorkspaceDetail"));

// Reports
const ReportMaturity = lazy(() => import("@/pages/reports/ReportMaturity"));
const ReportProcessSupport = lazy(() => import("@/pages/reports/ReportProcessSupport"));
const ReportPortfolio = lazy(() => import("@/pages/reports/ReportPortfolio"));
const ReportRedundancy = lazy(() => import("@/pages/reports/ReportRedundancy"));
const ReportOwners = lazy(() => import("@/pages/reports/ReportOwners"));
const ReportIntegrations = lazy(() => import("@/pages/reports/ReportIntegrations"));
const ReportVendors = lazy(() => import("@/pages/reports/ReportVendors"));
const ReportClassification = lazy(() => import("@/pages/reports/ReportClassification"));
const ReportHosting = lazy(() => import("@/pages/reports/ReportHosting"));
const ReportLifecycle = lazy(() => import("@/pages/reports/ReportLifecycle"));
const ReportRisk = lazy(() => import("@/pages/reports/ReportRisk"));
const ReportBIA = lazy(() => import("@/pages/reports/ReportBIA"));
const ReportNIS2 = lazy(() => import("@/pages/reports/ReportNIS2"));
const ReportGDPR = lazy(() => import("@/pages/reports/ReportGDPR"));
const ReportAuth = lazy(() => import("@/pages/reports/ReportAuth"));
const ReportTechDebt = lazy(() => import("@/pages/reports/ReportTechDebt"));
const ReportTechVendors = lazy(() => import("@/pages/reports/ReportTechVendors"));
const ReportTechPortfolio = lazy(() => import("@/pages/reports/ReportTechPortfolio"));
const ReportCosts = lazy(() => import("@/pages/reports/ReportCosts"));
const ReportRoadmap = lazy(() => import("@/pages/reports/ReportRoadmap"));
const ReportPrinciplesDocument = lazy(() => import("@/pages/reports/ReportPrinciplesDocument"));
const ReportManualObjects = lazy(() => import("@/pages/reports/ReportManualObjects"));
const ReportFlaggedObjects = lazy(() => import("@/pages/reports/ReportFlaggedObjects"));
// A published survey report — one frozen edition, filed under "Rapporter".
const PublishedReport = lazy(() => import("@/pages/reports/PublishedReport"));

/** Redirects non-admin users to home */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useRoleStore();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/** Redirects users without editor capability (admin or superuser) to home */
const EditorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isEditor } = useRoleStore();
  if (!isEditor) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/** A page under a switched-off module (config/modules.ts) is not shown, even
 * from a bookmark or an old link. */
const ModuleGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { ready, pathEnabled } = useModules();
  if (pathEnabled(pathname)) return <>{children}</>;
  if (!ready) return <LoadingSpinner height="80vh" />;
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="info">
        Modulen är inte aktiverad i den här installationen. En administratör kan slå på den under
        Administration → Organisation.
      </Alert>
    </Box>
  );
};

const AppRouter: React.FC = () => (
  <Suspense fallback={<LoadingSpinner height="80vh" />}>
    <ModuleGate>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/processes" element={<ProcessExplorer />} />
        <Route path="/business-calendar" element={<BusinessCalendar />} />
        <Route path="/systems" element={<SystemView />} />
        <Route path="/info-objects" element={<InfoObjectExplorer />} />
        <Route path="/info-sources" element={<InfoSourceExplorer />} />
        <Route path="/tech-components" element={<TechComponentExplorer />} />
        <Route path="/servers" element={<ServerView />} />
        <Route path="/server-services" element={<ServerServiceView />} />
        <Route path="/landscape" element={<Landscape />} />
        <Route path="/architecture-principles" element={<ArchitecturePrinciples />} />
        {/* Svensk länkadress till principerna. En OMDIRIGERING och inte en andra
            route på samma sida: den engelska sökvägen är inbakad på flera håll
            som inte går att peka om i förbifarten – användarnas sparade genvägar
            (ea_users.shortcuts, alembic 0020), PDF-exportens länkar
            (services/pdf/renderer.py) och menyns markering, som jämför
            location.pathname EXAKT mot item.path. Med en redirect landar man
            alltid på den ena kanoniska adressen, så menyn markerar rätt och inga
            bokmärken pekar åt två håll. */}
        <Route
          path="/arkitekturprinciper"
          element={<Navigate to="/architecture-principles" replace />}
        />
        <Route path="/target-architecture" element={<TargetArchitecture />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/arkitekturresan" element={<ArchitectureJourneyPage />} />
        <Route path="/nulaagesanalys" element={<Nulaagesanalys />} />
        <Route path="/gap-analys" element={<GapAnalys />} />
        <Route path="/solution-sketches" element={<SolutionSketchList />} />
        <Route path="/solution-sketches/:id" element={<SolutionSketchDetail />} />
        <Route path="/solution-sketches/:id/sammanstallning" element={<SolutionSketchPrint />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/connections" element={<EditorRoute><Connections /></EditorRoute>} />
        <Route path="/create" element={<EditorRoute><CreateNode /></EditorRoute>} />
        <Route path="/import" element={<AdminRoute><ImportCSV /></AdminRoute>} />
        <Route path="/platform-import" element={<AdminRoute><PlatformImport /></AdminRoute>} />
        <Route path="/data-management" element={<AdminRoute><DataManagement /></AdminRoute>} />
        <Route path="/navigation-settings" element={<AdminRoute><NavigationSettings /></AdminRoute>} />
        <Route path="/audit-log" element={<AdminRoute><AuditLog /></AdminRoute>} />
        <Route path="/sync-profiles" element={<AdminRoute><SyncProfiles /></AdminRoute>} />
        <Route path="/org-settings" element={<AdminRoute><OrgSettings /></AdminRoute>} />
        <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
        <Route path="/access" element={<AdminRoute><AccessManagement /></AdminRoute>} />
        <Route path="/notifications" element={<EditorRoute><Notifications /></EditorRoute>} />
        <Route path="/surveys" element={<EditorRoute><SurveyList /></EditorRoute>} />
        <Route path="/surveys/:id" element={<EditorRoute><SurveyEdit /></EditorRoute>} />
        <Route path="/surveys/:id/review" element={<EditorRoute><SurveyReview /></EditorRoute>} />
        <Route path="/surveys/:id/reports/:number" element={<EditorRoute><SurveyReport /></EditorRoute>} />
        <Route path="/my-surveys" element={<MySurveys />} />
        <Route path="/my-surveys/:responseId" element={<SurveyRespond />} />
        <Route path="/s/:token" element={<SurveyLinkResolver />} />
        {/* Samarbete — access is decided per workspace by the backend */}
        <Route path="/uppdrag" element={<WorkspaceList kind="uppdrag" />} />
        <Route path="/uppdrag/:id" element={<WorkspaceDetail />} />
        <Route path="/arbetsgrupper" element={<WorkspaceList kind="arbetsgrupp" />} />
        <Route path="/arbetsgrupper/:id" element={<WorkspaceDetail />} />
        <Route path="/reports/maturity" element={<ReportMaturity />} />
        <Route path="/reports/process-support" element={<ReportProcessSupport />} />
        <Route path="/reports/portfolio" element={<ReportPortfolio />} />
        <Route path="/reports/redundancy" element={<ReportRedundancy />} />
        <Route path="/reports/overlap-gaps" element={<ReportOverlapGaps />} />
        <Route path="/reports/owners" element={<ReportOwners />} />
        <Route path="/reports/integrations" element={<ReportIntegrations />} />
        <Route path="/reports/vendors" element={<ReportVendors />} />
        <Route path="/reports/classification" element={<ReportClassification />} />
        <Route path="/reports/hosting" element={<ReportHosting />} />
        <Route path="/reports/lifecycle" element={<ReportLifecycle />} />
        <Route path="/reports/risk" element={<ReportRisk />} />
        <Route path="/reports/bia" element={<ReportBIA />} />
        <Route path="/reports/nis2" element={<ReportNIS2 />} />
        <Route path="/reports/gdpr" element={<ReportGDPR />} />
        <Route path="/reports/auth" element={<ReportAuth />} />
        <Route path="/reports/tech-debt" element={<ReportTechDebt />} />
        <Route path="/reports/tech-vendors" element={<ReportTechVendors />} />
        <Route path="/reports/tech-portfolio" element={<ReportTechPortfolio />} />
        <Route path="/reports/costs" element={<ReportCosts />} />
        <Route path="/reports/roadmap" element={<ReportRoadmap />} />
        <Route path="/reports/principles" element={<ReportPrinciplesDocument />} />
        <Route path="/reports/gap-progress" element={<GapProgressReport />} />
        <Route path="/reports/changes" element={<ReportChanges />} />
        <Route path="/reports/manual-objects" element={<ReportManualObjects />} />
        <Route path="/reports/flagged-objects" element={<ReportFlaggedObjects />} />
        <Route path="/reports/published/:id" element={<EditorRoute><PublishedReport /></EditorRoute>} />
        <Route path="*" element={
          <div style={{ padding: 32, textAlign: "center" }}>
            <h2>404 — Page not found</h2>
          </div>
        } />
      </Routes>
    </ModuleGate>
  </Suspense>
);

export default AppRouter;
