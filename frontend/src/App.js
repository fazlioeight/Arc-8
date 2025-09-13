import React, { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import About from './pages/About';
import Products from './pages/Products';
import Insights from './pages/Insights';
import Contact from './pages/Contact';
import Signup from './pages/Signup';
import Login from './pages/Login';
import PortalPage from './pages/portal_page/portalPage'; // adjust path as needed
import RideBooking from './pages/RideBooking';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Docs from './pages/Docs';
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
  const { isAuthenticated, loading } = useContext(AuthContext) || {};
  return (
    <Router>
      {(!loading && !isAuthenticated) && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/products" element={<Products />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/portal_page/portalPage" element={<PortalPage />} />
        <Route path="/RideBooking" element={<RideBooking />} />
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
      </Routes>
    </Router>
  );
};

function App() {
  const [themePreference, setThemePreference] = useState(() => {
    const saved = localStorage.getItem('themePreference');
    return saved || 'system';
  });

  // Compute effective theme and apply class
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (pref) => {
      const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark-mode', !!isDark);
      root.classList.toggle('light-mode', !isDark);
    };
    applyTheme(themePreference);
    localStorage.setItem('themePreference', themePreference);
    // Listen to system changes when in system mode
    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const handler = () => themePreference === 'system' && applyTheme('system');
    if (mql && mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql && mql.addListener) mql.addListener(handler);
    return () => {
      if (mql && mql.removeEventListener) mql.removeEventListener('change', handler);
      else if (mql && mql.removeListener) mql.removeListener(handler);
    };
  }, [themePreference]);

  return (
    <div>
      <AuthProvider>
        <Shell themePreference={themePreference} setThemePreference={setThemePreference} />
      </AuthProvider>
    </div>
  );
}

export default App;


