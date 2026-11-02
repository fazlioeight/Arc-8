import React, { useContext, useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { AuthContext, AuthProvider } from './context/AuthContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';
import { GuidedTourProvider } from './context/GuidedTourContext';
import { NotificationsProvider } from './context/NotificationsContext';
import './styles/commandPalette.css';
import './styles/memberWorkspace.css';
import Navbar from './components/Navbar';
import AppBreadcrumbs from './components/AppBreadcrumbs';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import SessionLockOverlay from './components/SessionLockOverlay';
import StaffImpersonationBanner from './components/StaffImpersonationBanner';
import GuidedTourOverlay from './components/GuidedTourOverlay';
import { LoadingState } from './components/ehr/Primitives';
import { ROUTES } from './constants/routes';

const Home = lazy(() => import('./pages/website/Home'));
const About = lazy(() => import('./pages/website/about/About'));
const Products = lazy(() => import('./pages/website/products/Products'));
const Insights = lazy(() => import('./pages/website/insights/Insights'));
const Contact = lazy(() => import('./pages/website/contact/Contact'));
const Pricing = lazy(() => import('./pages/website/Pricing'));
const Login = lazy(() => import('./pages/website/Login'));
const ChangePassword = lazy(() => import('./pages/website/ChangePassword'));
const PortalPage = lazy(() => import('./pages/platform/portal_page/portalPage'));
const Member360LandingPage = lazy(() => import('./pages/platform/Member-360/Member360LandingPage'));
const Member360LabDashboard = lazy(() => import('./pages/platform/member360-lab/Member360LabDashboard'));
const Member360LabMembersPage = lazy(() => import('./pages/platform/member360-lab/Member360LabMembersPage'));
const Member360LabWorkspace = lazy(() => import('./pages/platform/member360-lab/Member360LabWorkspace'));
const Member360LabTasksPage = lazy(() => import('./pages/platform/member360-lab/Member360LabTasksPage'));
const Member360LabCareJourneysPage = lazy(() => import('./pages/platform/member360-lab/Member360LabCareJourneysPage'));
const Member360LabRiskIntelligencePage = lazy(() => import('./pages/platform/member360-lab/Member360LabRiskIntelligencePage'));
const Member360LabCareOptionsPage = lazy(() => import('./pages/platform/member360-lab/Member360LabCareOptionsPage'));
const Member360LabMessagesPage = lazy(() => import('./pages/platform/member360-lab/Member360LabMessagesPage'));
const Member360LabDocumentsPage = lazy(() => import('./pages/platform/member360-lab/Member360LabDocumentsPage'));
const Member360LabAdminPage = lazy(() => import('./pages/platform/member360-lab/Member360LabAdminPage'));
const Settings = lazy(() => import('./pages/platform/settings/Settings'));
const ChatPage = lazy(() => import('./pages/platform/chat/ChatPage'));
const Docs = lazy(() => import('./pages/docs/Docs'));
const ProvidersPage = lazy(() => import('./pages/platform/providers/ProvidersPage'));
const ProviderDetailPage = lazy(() => import('./pages/platform/providers/ProviderDetailPage'));
const RideBookingPage = lazy(() => import('./pages/platform/ride-booking/RideBookingPage'));
const DashboardPage = lazy(() => import('./pages/platform/dashboard/DashboardPage'));
const MasterAdminPage = lazy(() => import('./pages/platform/admin/MasterAdminPage'));
const StaffLogin = lazy(() => import('./pages/platform/staff/StaffLogin'));
const StaffBootstrap = lazy(() => import('./pages/platform/staff/StaffBootstrap'));
const StaffConsole = lazy(() => import('./pages/platform/staff/StaffConsole'));
const StaffUsers = lazy(() => import('./pages/platform/staff/StaffUsers'));
const JobStatusCenter = lazy(() => import('./pages/platform/jobs/JobStatusCenter'));
const ImportDataPage = lazy(() => import('./pages/platform/jobs/ImportDataPage'));
const CodingWorklistPage = lazy(() => import('./pages/platform/coding/CodingWorklistPage'));
const CodingChasePage = lazy(() => import('./pages/platform/coding/CodingChasePage'));
const WorkbenchPage = lazy(() => import('./pages/platform/coding/WorkbenchPage'));
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

const RouteFallback = () => (
  <div className="py-12">
    <LoadingState
      title="Loading"
      description="Preparing your Arc-8 workspace..."
      className="mx-auto max-w-md"
    />
  </div>
);

const LoginOnlySessionLockOverlay = () => {
  const location = useLocation();
  return location.pathname === '/login' ? <SessionLockOverlay /> : null;
};

// Forces users whose token carries must_change_password=true onto the
// rotation page until they finish. Skipping the redirect on /login keeps the
// re-authentication flow from bouncing during initial sign-in; skipping it
// on the page itself avoids a redirect loop.
const ForcePasswordRotation = () => {
  const { mustChangePassword } = useContext(AuthContext);
  const location = useLocation();
  if (!mustChangePassword) return null;
  if (location.pathname === ROUTES.AUTH.CHANGE_PASSWORD) return null;
  if (location.pathname === '/login') return null;
  return <Navigate to={ROUTES.AUTH.CHANGE_PASSWORD} replace />;
};

// When the inactivity timer locks the session, bounce users off whatever
// route they were on so LoginOnlySessionLockOverlay can show the re-auth
// modal on /login. Token stays valid, so drafts are preserved.
const RedirectWhenLocked = () => {
  const { sessionLocked } = useContext(AuthContext);
  const location = useLocation();
  if (!sessionLocked) return null;
  if (location.pathname === '/login') return null;
  return <Navigate to="/login" replace />;
};

const Shell = ({ themePreference, setThemePreference }) => {
  const location = useLocation();
  const hideNavbarOn = [
    ROUTES.PORTAL.LANDING,
    "/portalPage",
    ROUTES.MEMBER_360.LANDING,
    ROUTES.MEMBER360_LAB.DASHBOARD,
    ROUTES.PROVIDERS.LANDING,
    ROUTES.RIDE_BOOKING,
    ROUTES.DASHBOARD,
    ROUTES.SETTINGS,
    "/admin",
    "/jobs",
    ROUTES.CHAT,
    ROUTES.CODING.WORKLIST,
    "/staff",
    "/login",
  ];
  const hideNavbar = hideNavbarOn.some((p) => location.pathname.startsWith(p));

  return (
    <div className="coding-member-workspace min-h-screen">
      <StaffImpersonationBanner />
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
          <Route path={ROUTES.AUTH.CHANGE_PASSWORD} element={<ChangePassword />} />
          <Route path={ROUTES.PORTAL.LANDING} element={<PortalPage />} />
          <Route path="/portalPage" element={<Navigate to={ROUTES.PORTAL.LANDING} replace />} />
          <Route path={ROUTES.MEMBER_360.LANDING} element={<Member360LandingPage />} />
          <Route path={ROUTES.MEMBER360_LAB.DASHBOARD} element={(
            <ErrorBoundary title="Arc-8 Member360 failed to load" description="Try again to reload the care intelligence workspace.">
              <Member360LabDashboard />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.MEMBERS} element={(
            <ErrorBoundary title="Member360 members failed to load">
              <Member360LabMembersPage />
            </ErrorBoundary>
          )} />
          <Route path={`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/:memberId`} element={(
            <ErrorBoundary title="Member360 workspace failed to load">
              <Member360LabWorkspace />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.TASKS} element={(
            <ErrorBoundary title="Tasks queue failed to load">
              <Member360LabTasksPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.CARE_JOURNEYS} element={(
            <ErrorBoundary title="Care Journeys failed to load">
              <Member360LabCareJourneysPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.RISK_INTELLIGENCE} element={(
            <ErrorBoundary title="Risk Intelligence failed to load">
              <Member360LabRiskIntelligencePage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.CARE_OPTIONS} element={(
            <ErrorBoundary title="Care Options failed to load">
              <Member360LabCareOptionsPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.MESSAGES} element={(
            <ErrorBoundary title="Messages failed to load">
              <Member360LabMessagesPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.DOCUMENTS} element={(
            <ErrorBoundary title="Documents failed to load">
              <Member360LabDocumentsPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.MEMBER360_LAB.ADMIN} element={(
            <ErrorBoundary title="Admin failed to load">
              <Member360LabAdminPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.SETTINGS} element={<Settings themePreference={themePreference} setThemePreference={setThemePreference} />} />
          <Route path={ROUTES.CHAT} element={(
            <ErrorBoundary title="Chat workspace failed to load" description="We couldn't open the chat workspace. Retry to attempt loading again.">
              <ChatPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.DOCS} element={<Docs />} />
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
          <Route path={ROUTES.PROVIDERS.LANDING} element={(
            <ErrorBoundary title="Provider list failed to load">
              <ProvidersPage />
            </ErrorBoundary>
          )} />
          <Route path={`${ROUTES.PROVIDERS.LANDING}/:providerId`} element={(
            <ErrorBoundary title="Provider details unavailable">
              <ProviderDetailPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.RIDE_BOOKING} element={(
            <ErrorBoundary title="Ride booking failed to load">
              <RideBookingPage />
            </ErrorBoundary>
          )} />
          <Route path={ROUTES.DASHBOARD} element={(
            <ErrorBoundary title="Dashboard failed to load">
              <DashboardPage />
            </ErrorBoundary>
          )} />
          <Route path="/admin/master" element={<MasterAdminPage />} />
          <Route path={ROUTES.STAFF.LOGIN} element={<StaffLogin />} />
          <Route path={ROUTES.STAFF.BOOTSTRAP} element={<StaffBootstrap />} />
          <Route path={ROUTES.STAFF.CONSOLE} element={<StaffConsole />} />
          <Route path={ROUTES.STAFF.USERS} element={<StaffUsers />} />
          <Route path="/jobs/import-data" element={<ImportDataPage />} />
          <Route path="/jobs/status-center" element={<JobStatusCenter />} />
          <Route path={ROUTES.CODING.WORKLIST} element={(
            <ErrorBoundary title="Coding worklist failed to load">
              <CodingWorklistPage />
            </ErrorBoundary>
          )} />
          <Route path={`${ROUTES.CODING.CHASE_ROOT}/:chaseId`} element={(
            <ErrorBoundary title="Chase failed to load">
              <CodingChasePage />
            </ErrorBoundary>
          )} />
          <Route path={`${ROUTES.CODING.WORKBENCH_ROOT}/:memberId`} element={(
            <ErrorBoundary title="Workbench failed to load">
              <WorkbenchPage />
            </ErrorBoundary>
          )} />
        </Routes>
      </Suspense>
    </div>
  );
};

function App() {
  const [themePreference, setThemePreference] = useState(() => {
    const saved = localStorage.getItem('themePreference');
    return saved || 'dark';
  });

  const handleThemeToggle = useCallback(() => {
    setThemePreference((prev) => {
      if (prev === 'dark') return 'light';
      return 'dark';
    });
  }, []);

  // Compute effective theme and apply class
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const applyTheme = (pref) => {
      const systemDark = mql ? mql.matches : true;
      const useDark = pref === 'dark' || (pref === 'system' && systemDark);
      const resolvedTheme = useDark ? 'dark' : 'light';

      root.classList.toggle('dark-mode', useDark);
      root.classList.toggle('light-mode', !useDark);
      root.classList.toggle('dark', useDark); // Tailwind dark mode
      root.dataset.theme = resolvedTheme;

      if (document.body) {
        document.body.classList.toggle('dark-mode', useDark);
        document.body.classList.toggle('light-mode', !useDark);
        document.body.classList.toggle('dark', useDark);
        document.body.dataset.theme = resolvedTheme;
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
                <RedirectWhenLocked />
                <ForcePasswordRotation />
                <Shell themePreference={themePreference} setThemePreference={setThemePreference} />
                <CommandPalette onThemeToggle={handleThemeToggle} />
                <GuidedTourOverlay />
                <LoginOnlySessionLockOverlay />
              </Router>
            </NotificationsProvider>
          </GuidedTourProvider>
        </CommandPaletteProvider>
      </UserPreferencesProvider>
    </AuthProvider>
  );
}

export default App;
