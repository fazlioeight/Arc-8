import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';
import { GuidedTourProvider } from './context/GuidedTourContext';
import { NotificationsProvider } from './context/NotificationsContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/commandPalette.css';
import './pages/platform/coding/member/memberWorkspace.css';
import Navbar from './components/Navbar';
import AppBreadcrumbs from './components/AppBreadcrumbs';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import SessionLockOverlay from './components/SessionLockOverlay';
import GuidedTourOverlay from './components/GuidedTourOverlay';

const Home = lazy(() => import('./pages/website/Home'));
const About = lazy(() => import('./pages/website/about/About'));
const Products = lazy(() => import('./pages/website/products/Products'));
const Insights = lazy(() => import('./pages/website/insights/Insights'));
const Contact = lazy(() => import('./pages/website/contact/Contact'));
const Pricing = lazy(() => import('./pages/website/Pricing'));
const Login = lazy(() => import('./pages/website/Login'));
const PortalPage = lazy(() => import('./pages/platform/portal_page/portalPage'));
const Member360LandingPage = lazy(() => import('./pages/platform/Member-360/Member360LandingPage'));
const RideBookingLandingPage = lazy(() => import('./pages/platform/ride_booking/RideBookingLandingPage'));
const RideBooking = lazy(() => import('./pages/platform/ride_booking/RideBooking'));
const RidePartnerManagementPage = lazy(() => import('./pages/platform/ride_booking/RidePartnerManagementPage'));
const RideBookingPaymentsPage = lazy(() => import('./pages/platform/ride_booking/RideBookingPaymentsPage'));
const Settings = lazy(() => import('./pages/platform/settings/Settings'));
const Dashboard = lazy(() => import('./pages/platform/coding/admin/Dashboard'));
const Docs = lazy(() => import('./pages/docs/Docs'));
const CodingMembersPage = lazy(() => import('./pages/platform/coding/CodingMembersPage'));
const CodingProvidersPage = lazy(() => import('./pages/platform/coding/CodingProvidersPage'));
const CodingLandingPage = lazy(() => import('./pages/platform/coding/CodingLandingPage'));
const CodingProviderDetailPage = lazy(() => import('./pages/platform/coding/CodingProviderDetailPage'));
const MasterAdminPage = lazy(() => import('./pages/platform/admin/MasterAdminPage'));
const CodingAssignmentsPage = lazy(() => import('./pages/platform/coding/admin/CodingAssignmentsPage'));
const CodingCoderPlatformPage = lazy(() => import('./pages/platform/coding/CodingCoderPlatformPage'));
const CodingReviewDashboardPage = lazy(() => import('./pages/platform/coding/CodingReviewDashboardPage'));
const CodingProviderEducationPage = lazy(() => import('./pages/platform/coding/CodingProviderEducationPage'));
const CodingGroupDashboardPage = lazy(() => import('./pages/platform/coding/CodingGroupDashboardPage'));
const CodingMemberDetailsPage = lazy(() => import('./pages/platform/coding/CodingMemberDetailsPage'));
const CodingMemberWorkbenchPage = lazy(() => import('./pages/platform/coding/CodingMemberWorkbenchPage'));
const CodingProviderManagementPage = lazy(() => import('./pages/platform/coding/CodingProviderManagementPage'));
const CodingMemberLayout = lazy(() => import('./pages/platform/coding/member/pages/CodingMemberLayout'));
const OverviewPage = lazy(() => import('./pages/platform/coding/member/pages/OverviewPage'));
const ProblemsHCCPage = lazy(() => import('./pages/platform/coding/member/pages/ProblemsHCCPage'));
const MedicationsPage = lazy(() => import('./pages/platform/coding/member/pages/MedicationsPage'));
const EncountersPage = lazy(() => import('./pages/platform/coding/member/pages/EncountersPage'));
const LabsImagingPage = lazy(() => import('./pages/platform/coding/member/pages/LabsImagingPage'));
const NotesPage = lazy(() => import('./pages/platform/coding/member/pages/NotesPage'));
const CareGapsPage = lazy(() => import('./pages/platform/coding/member/pages/CareGapsPage'));
const TasksMessagesPage = lazy(() => import('./pages/platform/coding/member/pages/TasksMessagesPage'));
const EligibilityCoveragePage = lazy(() => import('./pages/platform/coding/member/pages/EligibilityCoveragePage'));
const DocumentsPage = lazy(() => import('./pages/platform/coding/member/pages/DocumentsPage'));
const AuditLogPage = lazy(() => import('./pages/platform/coding/member/pages/AuditLogPage'));
const SharingPage = lazy(() => import('./pages/platform/coding/member/pages/SharingPage'));
const SettingsPage = lazy(() => import('./pages/platform/coding/member/pages/SettingsPage'));
const JobStatusCenter = lazy(() => import('./pages/platform/jobs/JobStatusCenter'));
const ImportDataPage = lazy(() => import('./pages/platform/jobs/ImportDataPage'));
const Mission = lazy(() => import('./pages/website/about/Mission'));
const Values = lazy(() => import('./pages/website/about/Values'));
const Team = lazy(() => import('./pages/website/about/Team'));
const RiskAnalysis = lazy(() => import('./pages/website/products/RiskAnalysis'));
const CapitationAnalyzer = lazy(() => import('./pages/website/products/CapitationAnalyzer'));
const MemberHealthInsights = lazy(() => import('./pages/website/products/MemberHealthInsights'));
const IntegrationSuite = lazy(() => import('./pages/website/products/IntegrationSuite'));
const FutureCapitation = lazy(() => import('./pages/website/insights/FutureCapitation'));
const PredictiveModeling = lazy(() => import('./pages/website/insights/PredictiveModeling'));
const CostSavings = lazy(() => import('./pages/website/insights/CostSavings'));
const ContactFormPage = lazy(() => import('./pages/website/contact/ContactFormPage'));
const CompanyInfo = lazy(() => import('./pages/website/contact/CompanyInfo'));
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
  const hideNavbarOn = ['/portalPage', '/member-360', '/rideBooking', '/dashboard', '/settings', '/coding', '/admin', '/jobs'];
  const hideNavbar = hideNavbarOn.some((p) => location.pathname.startsWith(p));

  return (
    <div className="coding-member-workspace min-h-screen">
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
          <Route path="/portalPage" element={<PortalPage />} />
          <Route path="/member-360" element={<Member360LandingPage />} />
          <Route path="/rideBooking" element={<RideBookingLandingPage />} />
          <Route path="/rideBooking/book" element={<RideBooking />} />
          <Route path="/rideBooking/partners" element={<RidePartnerManagementPage />} />
          <Route path="/rideBooking/payments" element={<RideBookingPaymentsPage />} />
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
    </div>
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


