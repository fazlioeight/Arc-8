import React from 'react';
import { Button } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalHero from '../../components/PortalHero';

const NAV_GROUPS = [
  {
    label: 'admin',
    items: [
      { label: 'Assignments', href: '/admin/coding-assignments', match: (path) => path.startsWith('/admin/coding-assignments') },
    ],
  },
  {
    label: 'coders',
    items: [
      { label: 'Overview', href: '/coding', match: (path) => path === '/coding' },
      { label: 'Coder platform', href: '/coding/platform', match: (path) => path.startsWith('/coding/platform') },
      { label: 'Review dashboard', href: '/coding/review-dashboard', match: (path) => path.startsWith('/coding/review-dashboard') },
      { label: 'Group dashboard', href: '/coding/group-dashboard', match: (path) => path.startsWith('/coding/group-dashboard') },
    ],
  },
  {
    label: 'members',
    items: [
      {
        label: 'Members',
        href: '/coding/members',
        match: (path) => path === '/coding/members' || path.startsWith('/coding/members/'),
      },
      { label: 'Member details', href: '/coding/member-details', match: (path) => path.startsWith('/coding/member-details') },
    ],
  },
  {
    label: 'providers',
    items: [
      {
        label: 'Providers',
        href: '/coding/providers',
        match: (path) => path === '/coding/providers' || path.startsWith('/coding/providers/'),
      },
      { label: 'Provider management', href: '/coding/provider-management', match: (path) => path.startsWith('/coding/provider-management') },
    ],
  },
];

const RIBBON_CONTAINER_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'linear-gradient(180deg, #f8f9fb 0%, #e2e6ef 100%)',
  borderRadius: '10px',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
  padding: '0.9rem 1.2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const RIBBON_TAB_ROW_STYLE = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '0.35rem',
  paddingBottom: '0.35rem',
  borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
  justifyContent: 'center',
};

const RIBBON_GROUP_AREA_STYLE = {
  display: 'flex',
  gap: '1.25rem',
  flexDirection: 'column',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: '0.65rem',
};

const RIBBON_GROUP_CARD_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  borderRadius: '6px',
  padding: '0.6rem 0.9rem',
  flex: '1 1 100%',
  minWidth: '220px',
  width: '100%',
  maxWidth: '720px',
  boxSizing: 'border-box',
};

const RIBBON_GROUP_TITLE_STYLE = {
  fontSize: '0.8rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#5f6b7a',
  marginBottom: '0.6rem',
  textAlign: 'center',
};

const RIBBON_BUTTON_ROW_STYLE = {
  display: 'flex',
  gap: '0.4rem',
  flexWrap: 'wrap',
  alignItems: 'stretch',
  justifyContent: 'center',
};

const getRibbonTabStyle = (isActive) => ({
  fontSize: '0.875rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  background: isActive ? '#ffffff' : 'transparent',
  border: 'none',
  borderBottom: isActive ? '3px solid #0078d4' : '3px solid transparent',
  color: isActive ? '#1a1a1a' : '#4a4a4a',
  padding: '0.45rem 0.9rem',
  borderRadius: '6px 6px 0 0',
  cursor: 'pointer',
  transition: 'all 0.15s ease-in-out',
});

const getRibbonItemButtonStyle = (isActive) => ({
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  justifyContent: 'flex-start',
  backgroundColor: isActive ? '#0078d4' : '#f3f6fb',
  borderColor: isActive ? '#0078d4' : 'rgba(0, 120, 212, 0.35)',
  color: isActive ? '#ffffff' : '#0b5394',
  fontWeight: 600,
  boxShadow: isActive ? '0 1px 3px rgba(0, 120, 212, 0.4)' : 'none',
  minWidth: '170px',
  flex: '0 0 auto',
});

const CodingPortalHeader = ({
  title,
  subtitle,
  align = 'center',
  additionalActions = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const matchedGroup = React.useMemo(() => {
    const group = NAV_GROUPS.find((candidate) =>
      candidate.items.some((item) =>
        item.match ? item.match(location.pathname) : location.pathname === item.href
      )
    );
    return group ? group.label : null;
  }, [location.pathname]);

  const matchedGroupRef = React.useRef(matchedGroup);

  const [activeGroup, setActiveGroup] = React.useState(() => matchedGroup || NAV_GROUPS[0].label);

  React.useEffect(() => {
    if (matchedGroup !== matchedGroupRef.current) {
      matchedGroupRef.current = matchedGroup;
      if (matchedGroup) {
        setActiveGroup(matchedGroup);
      }
    }
  }, [matchedGroup]);

  const activeGroupConfig =
    NAV_GROUPS.find((group) => group.label === activeGroup) ?? NAV_GROUPS[0];

  const actions = (
    <div className="w-100 d-flex justify-content-center">
      <div style={RIBBON_CONTAINER_STYLE}>
        <div style={RIBBON_TAB_ROW_STYLE} role="tablist" aria-label="Coding portal sections">
          {NAV_GROUPS.map((group) => {
            const isActiveTab = group.label === activeGroup;
            return (
              <button
                key={group.label}
                type="button"
                style={getRibbonTabStyle(isActiveTab)}
                aria-selected={isActiveTab}
                role="tab"
                onClick={() => setActiveGroup(group.label)}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        <div style={RIBBON_GROUP_AREA_STYLE}>
          <div style={RIBBON_GROUP_CARD_STYLE}>
            <div style={RIBBON_GROUP_TITLE_STYLE}>{activeGroup}</div>
            <div style={RIBBON_BUTTON_ROW_STYLE}>
              {activeGroupConfig.items.map((item) => {
                const isActiveItem = item.match
                  ? item.match(location.pathname)
                  : location.pathname === item.href;

                return (
                  <Button
                    key={item.href}
                    size="sm"
                    variant={isActiveItem ? 'primary' : 'outline-primary'}
                    aria-current={isActiveItem ? 'page' : undefined}
                    onClick={() => {
                      setActiveGroup(activeGroupConfig.label);
                      navigate(item.href, { state: { breadcrumb: item.label } });
                    }}
                    style={getRibbonItemButtonStyle(isActiveItem)}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
          {additionalActions ? (
            <div className="d-flex align-items-start justify-content-center">
              {additionalActions}
            </div>
          ) : null}
        </div>
      </div>
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
