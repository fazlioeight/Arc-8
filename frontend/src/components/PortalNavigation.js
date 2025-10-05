import React from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

/**
 * Lightweight navigation bar for portal sections.
 * Renders a horizontal list of buttons and highlights the current section.
 */
const PortalNavigation = ({ items = [], currentSection, className = '' }) => {
  const navigate = useNavigate();

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div
      className={`portal-navigation bg-light border rounded px-3 py-2 mb-3 d-flex flex-wrap align-items-center ${className}`.trim()}
    >
      {items.map((item) => {
        const key = item.key || item.href || item.label;
        const isActive = currentSection && key === currentSection;
        const variant = isActive ? 'primary' : 'outline-primary';

        const handleClick = () => {
          if (typeof item.onClick === 'function') {
            item.onClick();
            return;
          }
          if (item.href) {
            navigate(item.href);
          }
        };

        return (
          <Button
            key={key}
            variant={variant}
            size="sm"
            className="me-2 mb-2"
            onClick={handleClick}
            disabled={Boolean(item.disabled)}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
};

export default PortalNavigation;
