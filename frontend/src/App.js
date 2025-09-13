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


