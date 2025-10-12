// components/Navbar.js - Common navigation component
import React from 'react';
import {
  Navbar as BSNavbar,
  Nav,
  NavDropdown,
  Container,
  Button,
} from 'react-bootstrap';
import { NavLink, useLocation } from 'react-router-dom';
import { useCommandPalette } from '../context/CommandPaletteContext';
import Icon from './ui/Icon';

const NAV_ITEMS = [
  {
    label: 'Home',
    to: '/',
    exact: true,
  },
  {
    label: 'Analytics',
    to: '/dashboard',
    matcher: (path) => path.startsWith('/dashboard') || path.startsWith('/portal_page'),
  },
  {
    label: 'Coding Workbench',
    to: '/coding',
    matcher: (path) => path.startsWith('/coding'),
  },
  {
    label: 'Care Operations',
    children: [
      { label: 'Ride Coordination', to: '/RideBooking', matcher: (path) => path.startsWith('/RideBooking') },
      { label: 'Operations Center', to: '/jobs/status-center', matcher: (path) => path.startsWith('/jobs') && path.includes('status-center') },
      { label: 'Data Imports', to: '/jobs/import-data', matcher: (path) => path.startsWith('/jobs') && path.includes('import-data') },
    ],
  },
  {
    label: 'Resource Library',
    to: '/docs',
    matcher: (path) => path.startsWith('/docs'),
  },
  {
    label: 'Administration',
    children: [
      { label: 'User & Roles', to: '/admin/master', matcher: (path) => path.startsWith('/admin/master') },
      { label: 'Work Distribution', to: '/admin/coding-assignments', matcher: (path) => path.startsWith('/admin/coding-assignments') },
      { label: 'Preferences', to: '/settings', matcher: (path) => path.startsWith('/settings') },
    ],
  },
];

const isItemActive = (item, pathname) => {
  if (item.children) {
    return item.children.some((child) => isItemActive(child, pathname));
  }
  if (item.exact) {
    return pathname === item.to;
  }
  if (item.matcher) {
    return item.matcher(pathname);
  }
  return pathname.startsWith(item.to);
};

const GlobalNavbar = () => {
  const location = useLocation();
  const { openPalette } = useCommandPalette();

  return (
    <BSNavbar bg="light" variant="light" expand="lg" className="ds-navbar">
      <Container fluid="lg">
        <BSNavbar.Brand as={NavLink} to="/" className="d-flex align-items-center gap-2">
          <img
            src="/images/nexoraanalyticsNavBarlogo.png"
            alt="Nexora Analytics logo"
            height="28"
          />
          <span className="fw-semibold">Nexora Platform</span>
        </BSNavbar.Brand>
        <div className="d-flex align-items-center gap-2 order-lg-2">
          <Button
            variant="outline-primary"
            size="sm"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={() => openPalette()}
            aria-label="Open search and command palette"
          >
            <Icon name="search" size={16} aria-hidden="true" />
            <span>Search</span>
          </Button>
        </div>
        <BSNavbar.Toggle aria-controls="global-navbar" className="order-lg-3" />
        <BSNavbar.Collapse id="global-navbar" className="order-lg-1">
          <Nav className="me-auto gap-lg-2">
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                const active = isItemActive(item, location.pathname);
                return (
                  <NavDropdown
                    key={item.label}
                    title={item.label}
                    id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    active={active}
                  >
                    {item.children.map((child) => (
                      <NavDropdown.Item
                        as={NavLink}
                        to={child.to}
                        key={child.label}
                        className={({ isActive }) => (isActive ? 'active dropdown-item' : 'dropdown-item')}
                        state={{ breadcrumb: child.label }}
                      >
                        {child.label}
                      </NavDropdown.Item>
                    ))}
                  </NavDropdown>
                );
              }
              return (
                <Nav.Link
                  as={NavLink}
                  to={item.to}
                  key={item.label}
                  end={item.exact}
                  className={({ isActive }) => (isActive ? 'active nav-link' : 'nav-link')}
                  state={{ breadcrumb: item.label }}
                >
                  {item.label}
                </Nav.Link>
              );
            })}
            <Nav.Link
              as={NavLink}
              to="/login"
              className={({ isActive }) => (isActive ? 'active nav-link' : 'nav-link')}
              state={{ breadcrumb: 'Sign In' }}
            >
              Sign In
            </Nav.Link>
          </Nav>
        </BSNavbar.Collapse>
      </Container>
    </BSNavbar>
  );
};

export default GlobalNavbar;
