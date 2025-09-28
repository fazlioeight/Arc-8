import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/commandPalette.css';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import SessionLockOverlay from './components/SessionLockOverlay';
import Home from './pages/Home';
import About from './pages/About';
import Products from './pages/Products';
import Insights from './pages/Insights';
import Contact from './pages/Contact';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import PortalPage from './pages/portal_page/portalPage';
import RideBookingLandingPage from './pages/ride_booking/RideBookingLandingPage';
import RideBooking from './pages/ride_booking/RideBooking';
import RidePartnerManagementPage from './pages/ride_booking/RidePartnerManagementPage';
import Settings from './pages/settings/Settings';
import Dashboard from './pages/dashboard/Dashboard';
import Docs from './pages/docs/Docs';
import CodingMembersPage from './pages/coding/CodingMembersPage';
import CodingMemberDetailPage from './pages/coding/CodingMemberDetailPage';
import CodingProvidersPage from './pages/coding/CodingProvidersPage';
import CodingLandingPage from './pages/coding/CodingLandingPage';
import CodingProviderDetailPage from './pages/coding/CodingProviderDetailPage';
import MasterAdminPage from './pages/admin/MasterAdminPage';
import JobStatusCenter from './pages/jobs/JobStatusCenter';
// Section pages
import Mission from './pages/about/Mission';
import Values from './pages/about/Values';
import Team from './pages/about/Team';
import RiskAnalysis from './pages/products/RiskAnalysis';
import CapitationAnalyzer from './pages/products/CapitationAnalyzer';
import MemberHealthInsights from './pages/products/MemberHealthInsights';
import IntegrationSuite from './pages/products/IntegrationSuite';
import FutureCapitation from './pages/insights/FutureCapitation';
import PredictiveModeling from './pages/insights/PredictiveModeling';
import CostSavings from './pages/insights/CostSavings';
import ContactFormPage from './pages/contact/ContactFormPage';
import CompanyInfo from './pages/contact/CompanyInfo';

const Shell = ({ themePreference, setThemePreference }) => {
  const location = useLocation();
  const hideNavbarOn = ['/portal_page/portalPage', '/RideBooking', '/dashboard', '/settings', '/coding', '/admin', '/jobs'];
  const hideNavbar = hideNavbarOn.some((p) => location.pathname.startsWith(p));

  return (
    <>
      {!hideNavbar && <Navbar />}
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
        <Route path="/coding/members/:memberId" element={(
            <ErrorBoundary title="Member detail unavailable" description="We couldn't open this member's chart details. Reload to try again.">
              <CodingMemberDetailPage />
            </ErrorBoundary>
          )} />
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
        <Route path="/admin/master" element={<MasterAdminPage />} />
        <Route path="/jobs/status-center" element={<JobStatusCenter />} />
      </Routes>
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
      <CommandPaletteProvider>
        <Router>
          <Shell themePreference={themePreference} setThemePreference={setThemePreference} />
          <CommandPalette onThemeToggle={handleThemeToggle} />
          <SessionLockOverlay />
        </Router>
      </CommandPaletteProvider>
    </AuthProvider>
  );
}

export default App;


