import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { MemberAuthProvider } from './context/MemberAuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';

import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Eligibility from './pages/Eligibility';
import Claims from './pages/Claims';
import ClaimDetail from './pages/ClaimDetail';
import Accumulators from './pages/Accumulators';
import Documents from './pages/Documents';
import Providers from './pages/Providers';
import Account from './pages/Account';

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <MemberAuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/resend-verification" element={<ResendVerification />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Authenticated */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/coverage" element={<Eligibility />} />
                <Route path="/claims" element={<Claims />} />
                <Route path="/claims/:id" element={<ClaimDetail />} />
                <Route path="/spending" element={<Accumulators />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/providers" element={<Providers />} />
                <Route path="/account" element={<Account />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </MemberAuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
