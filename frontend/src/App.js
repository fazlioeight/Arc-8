import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';
import { GuidedTourProvider } from './context/GuidedTourContext';
import { NotificationsProvider } from './context/NotificationsContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/commandPalette.css';
import Navbar from './components/Navbar';
import AppBreadcrumbs from './components/AppBreadcrumbs';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import SessionLockOverlay from './components/SessionLockOverlay';
import GuidedTourOverlay from './components/GuidedTourOverlay';

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Products = lazy(() => import('./pages/Products'));
const Insights = lazy(() => import('./pages/Insights'));
const Contact = lazy(() => import('./pages/Contact'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Login = lazy(() => import('./pages/Login'));
const PortalPage = lazy(() => import('./pages/portal_page/portalPage'));
const RideBookingLandingPage = lazy(() => import('./pages/ride_booking/RideBookingLandingPage'));
const RideBooking = lazy(() => import('./pages/ride_booking/RideBooking'));
const RidePartnerManagementPage = lazy(() => import('./pages/ride_booking/RidePartnerManagementPage'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Docs = lazy(() => import('./pages/docs/Docs'));
const CodingMembersPage = lazy(() => import('./pages/coding/CodingMembersPage'));
const CodingProvidersPage = lazy(() => import('./pages/coding/CodingProvidersPage'));
const CodingLandingPage = lazy(() => import('./pages/coding/CodingLandingPage'));
const CodingProviderDetailPage = lazy(() => import('./pages/coding/CodingProviderDetailPage'));
const MasterAdminPage = lazy(() => import('./pages/admin/MasterAdminPage'));
const CodingAssignmentsPage = lazy(() => import('./pages/admin/CodingAssignmentsPage'));
const CodingCoderPlatformPage = lazy(() => import('./pages/coding/CodingCoderPlatformPage'));
const CodingReviewDashboardPage = lazy(() => import('./pages/coding/CodingReviewDashboardPage'));
const CodingProviderEducationPage = lazy(() => import('./pages/coding/CodingProviderEducationPage'));
const CodingGroupDashboardPage = lazy(() => import('./pages/coding/CodingGroupDashboardPage'));
const CodingMemberDetailsPage = lazy(() => import('./pages/coding/CodingMemberDetailsPage'));
const CodingMemberWorkbenchPage = lazy(() => import('./pages/coding/CodingMemberWorkbenchPage'));
const CodingProviderManagementPage = lazy(() => import('./pages/coding/CodingProviderManagementPage'));
const CodingMemberLayout = lazy(() => import('./pages/coding/member/pages/CodingMemberLayout'));
const OverviewPage = lazy(() => import('./pages/coding/member/pages/OverviewPage'));
const ProblemsHCCPage = lazy(() => import('./pages/coding/member/pages/ProblemsHCCPage'));
const MedicationsPage = lazy(() => import('./pages/coding/member/pages/MedicationsPage'));
const EncountersPage = lazy(() => import('./pages/coding/member/pages/EncountersPage'));
const LabsImagingPage = lazy(() => import('./pages/coding/member/pages/LabsImagingPage'));
const NotesPage = lazy(() => import('./pages/coding/member/pages/NotesPage'));
const CareGapsPage = lazy(() => import('./pages/coding/member/pages/CareGapsPage'));
const TasksMessagesPage = lazy(() => import('./pages/coding/member/pages/TasksMessagesPage'));
const EligibilityCoveragePage = lazy(() => import('./pages/coding/member/pages/EligibilityCoveragePage'));
const DocumentsPage = lazy(() => import('./pages/coding/member/pages/DocumentsPage'));
const AuditLogPage = lazy(() => import('./pages/coding/member/pages/AuditLogPage'));
const SharingPage = lazy(() => import('./pages/coding/member/pages/SharingPage'));
const SettingsPage = lazy(() => import('./pages/coding/member/pages/SettingsPage'));
const JobStatusCenter = lazy(() => import('./pages/jobs/JobStatusCenter'));
const ImportDataPage = lazy(() => import('./pages/jobs/ImportDataPage'));
const Mission = lazy(() => import('./pages/about/Mission'));
const Values = lazy(() => import('./pages/about/Values'));
const Team = lazy(() => import('./pages/about/Team'));
const RiskAnalysis = lazy(() => import('./pages/products/RiskAnalysis'));
const CapitationAnalyzer = lazy(() => import('./pages/products/CapitationAnalyzer'));
const MemberHealthInsights = lazy(() => import('./pages/products/MemberHealthInsights'));
const IntegrationSuite = lazy(() => import('./pages/products/IntegrationSuite'));
const FutureCapitation = lazy(() => import('./pages/insights/FutureCapitation'));
const PredictiveModeling = lazy(() => import('./pages/insights/PredictiveModeling'));
const CostSavings = lazy(() => import('./pages/insights/CostSavings'));
const ContactFormPage = lazy(() => import('./pages/contact/ContactFormPage'));
const CompanyInfo = lazy(() => import('./pages/contact/CompanyInfo'));
// Section pages

const RouteFallback = () => <div className="loading">Loading...</div>;

const LegacyMemberDetailRedirect = () => {
  const { memberId } = useParams();
  if (!memberId) {
    return <Navigate to="/coding/members" replace />;
  }
  return <Navigate to={`/coding/member/${memberId}/chart`} replace />;
};

const Shell = ({ themePreference, setThemePreference }) => {
  const location = useLocation();
  const hideNavbarOn = ['/portal_page/portalPage', '/RideBooking', '/dashboard', '/settings', '/coding', '/admin', '/jobs'];
  const hideNavbar = hideNavbarOn.some((p) => location.pathname.startsWith(p));

  return (
    <>
      {!hideNavbar && (
        <>
          <Navbar />
          <AppBreadcrumbs />
        </>
      )}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/products" element={<Products />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/portal_page/portalPage" element={<PortalPage />} />
          <Route path="/RideBooking" element={<RideBookingLandingPage />} />
          <Route path="/RideBooking/book" element={<RideBooking />} />
          <Route path="/RideBooking/partners" element={<RidePartnerManagementPage />} />
          <Route path="/settings" element={<Settings themePreference={themePreference} setThemePreference={setThemePreference} />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/docs" element={<Docs />} />
          {/* Section routes */}
          <Route path="/about/mission" element={<Mission />} />
          <Route path="/about/values" element={<Values />} />
          <Route path="/about/team" element={<Team />} />
          <Route path="/products/risk-analysis" element={<RiskAnalysis />} />
          <Route path="/products/capitation-analyzer" element={<CapitationAnalyzer />} />
          <Route path="/products/member-health-insights" element={<MemberHealthInsights />} />
          <Route path="/products/integration-suite" element={<IntegrationSuite />} />
          <Route path="/insights/future-capitation" element={<FutureCapitation />} />
          <Route path="/insights/predictive-modeling" element={<PredictiveModeling />} />
          <Route path="/insights/cost-savings" element={<CostSavings />} />
          <Route path="/contact/form" element={<ContactFormPage />} />
          <Route path="/contact/info" element={<CompanyInfo />} />
          <Route path="/coding" element={(
            <ErrorBoundary title="Coding workspace failed to load" description="We couldn't open the coding workspace. Retry to attempt loading again.">
              <CodingLandingPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/members" element={(
            <ErrorBoundary title="Coding members failed to load" description="Try again to reload member worklists or return home.">
              <CodingMembersPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/members/:memberId/*" element={<LegacyMemberDetailRedirect />} />
          <Route path="/coding/providers" element={(
            <ErrorBoundary title="Provider list failed to load">
              <CodingProvidersPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/providers/:providerId" element={(
            <ErrorBoundary title="Provider details unavailable">
              <CodingProviderDetailPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/platform" element={(
            <ErrorBoundary title="Coder platform unavailable" description="We couldn't load the coder platform workspace. Try refreshing the page.">
              <CodingCoderPlatformPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/review-dashboard" element={(
            <ErrorBoundary title="Review dashboard unavailable" description="An error occurred while loading review metrics.">
              <CodingReviewDashboardPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/provider-education" element={(
            <ErrorBoundary title="Provider education dashboard unavailable">
              <CodingProviderEducationPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/group-dashboard" element={(
            <ErrorBoundary title="Group dashboard unavailable">
              <CodingGroupDashboardPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/member-details" element={(
            <ErrorBoundary title="Member details unavailable">
              <CodingMemberDetailsPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/member/:memberId" element={(
            <ErrorBoundary title="Coder workbench unavailable" description="We could not load the member workbench. Try refreshing or return to the queue.">
              <CodingMemberWorkbenchPage />
            </ErrorBoundary>
          )} />
          <Route path="/coding/member/:memberId/chart" element={<CodingMemberLayout />}>
            {/* Chart pages */}
            <Route index element={<OverviewPage />} />
            <Route path="problems" element={<ProblemsHCCPage />} />
            <Route path="medications" element={<MedicationsPage />} />
            <Route path="encounters" element={<EncountersPage />} />
            <Route path="labs-imaging" element={<LabsImagingPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="care-gaps" element={<CareGapsPage />} />
            <Route path="tasks-messages" element={<TasksMessagesPage />} />
            <Route path="eligibility-coverage" element={<EligibilityCoveragePage />} />
            <Route path="documents" element={<DocumentsPage />} />

            {/* Utilities */}
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="sharing" element={<SharingPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/coding/provider-management" element={(
            <ErrorBoundary title="Provider management unavailable">
              <CodingProviderManagementPage />
            </ErrorBoundary>
          )} />
          <Route path="/admin/master" element={<MasterAdminPage />} />
        <Route path="/admin/coding-assignments" element={<CodingAssignmentsPage />} />
          <Route path="/jobs/import-data" element={<ImportDataPage />} />
          <Route path="/jobs/status-center" element={<JobStatusCenter />} />
        </Routes>
      </Suspense>
    </>
  );
};

function App() {
  const [themePreference, setThemePreference] = useState(() => {
    const saved = localStorage.getItem('themePreference');
    return saved || 'system';
  });

  const handleThemeToggle = useCallback(() => {
    setThemePreference((prev) => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'system';
      return 'dark';
    });
  }, []);

  // Compute effective theme and apply class
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const applyTheme = (pref) => {
      const useDark = pref === 'dark' || (pref === 'system' && Boolean(mql?.matches));
      const resolvedTheme = useDark ? 'dark' : 'light';

      root.classList.toggle('dark-mode', useDark);
      root.classList.toggle('light-mode', !useDark);
      root.dataset.theme = resolvedTheme;
      root.setAttribute('data-bs-theme', resolvedTheme);

      if (document.body) {
        document.body.classList.toggle('dark-mode', useDark);
        document.body.classList.toggle('light-mode', !useDark);
        document.body.dataset.theme = resolvedTheme;
        document.body.setAttribute('data-bs-theme', resolvedTheme);
      }
    };

    applyTheme(themePreference);
    localStorage.setItem('themePreference', themePreference);
    // Listen to system changes when in system mode
    const handler = () => {
      if (themePreference === 'system') {
        applyTheme('system');
      }
    };
    if (mql && mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql && mql.addListener) mql.addListener(handler);
    return () => {
      if (mql && mql.removeEventListener) mql.removeEventListener('change', handler);
      else if (mql && mql.removeListener) mql.removeListener(handler);
    };
  }, [themePreference]);

  return (
    <AuthProvider>
      <UserPreferencesProvider>
        <CommandPaletteProvider>
          <GuidedTourProvider>
            <NotificationsProvider>
              <Router>
                <Shell themePreference={themePreference} setThemePreference={setThemePreference} />
                <CommandPalette onThemeToggle={handleThemeToggle} />
                <GuidedTourOverlay />
                <SessionLockOverlay />
              </Router>
            </NotificationsProvider>
          </GuidedTourProvider>
        </CommandPaletteProvider>
      </UserPreferencesProvider>
    </AuthProvider>
  );
}

export default App;


