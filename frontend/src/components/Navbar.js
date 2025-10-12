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
import { useUserPreferences } from '../context/UserPreferencesContext';
import Icon from './ui/Icon';

const NAV_ITEMS = [
  {
    key: 'home',
    label: 'Home',
    to: '/',
    exact: true,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    to: '/dashboard',
    matcher: (path) => path.startsWith('/dashboard') || path.startsWith('/portal_page'),
  },
  {
    key: 'coding',
    label: 'Coding Workbench',
    to: '/coding',
    matcher: (path) => path.startsWith('/coding'),
  },
  {
    key: 'care',
    label: 'Care Operations',
    children: [
      { key: 'rideBooking', label: 'Ride Coordination', to: '/RideBooking', matcher: (path) => path.startsWith('/RideBooking') },
      { key: 'jobCenter', label: 'Operations Center', to: '/jobs/status-center', matcher: (path) => path.startsWith('/jobs') && path.includes('status-center') },
      { key: 'importData', label: 'Data Imports', to: '/jobs/import-data', matcher: (path) => path.startsWith('/jobs') && path.includes('import-data') },
    ],
  },
  {
    key: 'resources',
    label: 'Resource Library',
    to: '/docs',
    matcher: (path) => path.startsWith('/docs'),
  },
  {
    key: 'admin',
    label: 'Administration',
    children: [
      { key: 'adminConsole', label: 'User & Roles', to: '/admin/master', matcher: (path) => path.startsWith('/admin/master') },
      { key: 'assignments', label: 'Work Distribution', to: '/admin/coding-assignments', matcher: (path) => path.startsWith('/admin/coding-assignments') },
      { key: 'settings', label: 'Preferences', to: '/settings', matcher: (path) => path.startsWith('/settings') },
    ],
  },
  {
    key: 'pricing',
    label: 'Pricing',
    to: '/pricing',
    matcher: (path) => path.startsWith('/pricing'),
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
  const { isNavItemEnabled, favorites } = useUserPreferences();

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
            {NAV_ITEMS.filter((item) => {
              if (item.children) {
                const visibleChildren = item.children.filter((child) => isNavItemEnabled(child.key));
                return visibleChildren.length > 0 && isNavItemEnabled(item.key);
              }
              return isNavItemEnabled(item.key);
            }).map((item) => {
              if (item.children) {
                const visibleChildren = item.children.filter((child) => isNavItemEnabled(child.key));
                if (visibleChildren.length === 0) {
                  return null;
                }
                const active = visibleChildren.some((child) => isItemActive(child, location.pathname));
                return (
                  <NavDropdown
                    key={item.label}
                    title={item.label}
                    id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    active={active}
                  >
                    {visibleChildren.map((child) => (
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
            {isNavItemEnabled('login') && (
              <Nav.Link
                as={NavLink}
                to="/login"
                className={({ isActive }) => (isActive ? 'active nav-link' : 'nav-link')}
                state={{ breadcrumb: 'Sign In' }}
              >
                Sign In
              </Nav.Link>
            )}
          </Nav>
          {favorites?.length ? (
            <div className="navbar-favorites d-flex align-items-center gap-2 mt-3 mt-lg-0">
              <span className="navbar-favorites__label text-muted small">Pinned</span>
              <div className="d-flex flex-wrap gap-2">
                {favorites.slice(0, 5).map((fav) => (
                  <NavLink key={fav.path} to={fav.path} className="navbar-favorite-link ds-btn ds-btn--ghost ds-btn--sm">
                    {fav.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null}
        </BSNavbar.Collapse>
      </Container>
    </BSNavbar>
  );
};

export default GlobalNavbar;
