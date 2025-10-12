import React from 'react';
import { Button } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalHero from '../../components/PortalHero';

const NAV_ITEMS = [
  { label: 'Overview', href: '/coding', match: (path) => path === '/coding' },
  { label: 'Coder platform', href: '/coding/platform', match: (path) => path.startsWith('/coding/platform') },
  { label: 'Review dashboard', href: '/coding/review-dashboard', match: (path) => path.startsWith('/coding/review-dashboard') },
  { label: 'Provider education', href: '/coding/provider-education', match: (path) => path.startsWith('/coding/provider-education') },
  { label: 'Group dashboard', href: '/coding/group-dashboard', match: (path) => path.startsWith('/coding/group-dashboard') },
  { label: 'Member details', href: '/coding/member-details', match: (path) => path.startsWith('/coding/member-details') },
  {
    label: 'Members',
    href: '/coding/members',
    match: (path) => path === '/coding/members' || path.startsWith('/coding/members/'),
  },
  {
    label: 'Providers',
    href: '/coding/providers',
    match: (path) => path === '/coding/providers' || path.startsWith('/coding/providers/'),
  },
  { label: 'Provider management', href: '/coding/provider-management', match: (path) => path.startsWith('/coding/provider-management') },
  { label: 'Assignments', href: '/admin/coding-assignments', match: (path) => path.startsWith('/admin/coding-assignments') },
];

const CodingPortalHeader = ({
  title,
  subtitle,
  align = 'left',
  additionalActions = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const actions = (
    <div className="d-flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => {
        const isActive = item.match ? item.match(location.pathname) : location.pathname === item.href;
        return (
          <Button
            key={item.href}
            variant={isActive ? 'light' : 'outline-light'}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(item.href, { state: { breadcrumb: item.label } })}
          >
            {item.label}
          </Button>
        );
      })}
      {additionalActions}
    </div>
  );

  return (
    <PortalHero
      align={align}
      title={title}
      subtitle={subtitle}
      actions={actions}
      wave={false}
    />
  );
};

export default CodingPortalHeader;
