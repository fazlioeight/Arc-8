import React, { useMemo } from 'react';
import { Breadcrumb, Container } from 'react-bootstrap';
import { NavLink, useLocation } from 'react-router-dom';

const SEGMENT_LABELS = {
  '': 'Home',
  home: 'Home',
  dashboard: 'Analytics Dashboard',
  portal_page: 'Workspace',
  portalpage: 'Workspace',
  'member-360': 'Member 360',
  members: 'Members',
  member: 'Member',
  providers: 'Provider Directory',
  admin: 'Administration',
  jobs: 'Operations Center',
  'status-center': 'Job Status',
  'import-data': 'Data Imports',
  settings: 'Preferences',
  docs: 'Resource Library',
  contact: 'Contact',
  products: 'Products',
  about: 'About',
  insights: 'Insights',
  pricing: 'Pricing',
  login: 'Sign In',
};

const titleCase = (value) => value.replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const resolveLabel = (segment, index, segments, stateLabel) => {
  if (index === segments.length - 1 && stateLabel) {
    return stateLabel;
  }
  const key = segment.toLowerCase();
  if (SEGMENT_LABELS[key]) {
    return SEGMENT_LABELS[key];
  }
  if (/^\d+$/.test(segment)) {
    return `Record ${segment}`;
  }
  return titleCase(segment);
};

const AppBreadcrumbs = () => {
  const location = useLocation();
  const pathSegments = useMemo(() => (
    location.pathname.split('/').filter(Boolean)
  ), [location.pathname]);

  const stateBreadcrumb = location.state?.breadcrumb;

  if (pathSegments.length === 0) {
    return null;
  }

  const items = [];
  let cumulativePath = '';

  pathSegments.forEach((segment, index) => {
    cumulativePath += `/${segment}`;
    const label = resolveLabel(segment, index, pathSegments, stateBreadcrumb);
    items.push({
      label,
      path: cumulativePath,
      isLast: index === pathSegments.length - 1,
    });
  });

  return (
    <div className="global-breadcrumbs border-bottom bg-light">
      <Container fluid="lg" className="py-2">
        <Breadcrumb className="mb-0" aria-label="Breadcrumb">
          <Breadcrumb.Item linkAs={NavLink} linkProps={{ to: '/', end: true }}>
            Home
          </Breadcrumb.Item>
          {items.map((item, index) => (
            <Breadcrumb.Item
              key={item.path}
              linkAs={item.isLast ? 'span' : NavLink}
              linkProps={item.isLast ? undefined : { to: item.path, state: location.state }}
              active={item.isLast}
            >
              {item.label}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      </Container>
    </div>
  );
};

export default AppBreadcrumbs;
