import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from './components/Navbar';
import DarkModeToggle from './components/DarkModeToggle';
import Home from './pages/Home';
import About from './pages/About';
import Products from './pages/Products';
import Insights from './pages/Insights';
import Contact from './pages/Contact';
import Signup from './pages/Signup';
import Login from './pages/Login';
import PortalPage from './pages/portal_page/portalPage'; // adjust path as needed
import RideBooking from './pages/RideBooking';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    // Read initial value from localStorage
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  useEffect(() => {
    // Persist darkMode to localStorage whenever it changes
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  return (
    <div className={darkMode ? 'dark-mode' : ''}>
      <AuthProvider>
        <Router>
          <Navbar />
          <div className="container mt-2 mb-2 d-flex justify-content-end">
            <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
          </div>
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
          </Routes>
        </Router>
      </AuthProvider>
    </div>
  );
}

export default App;


