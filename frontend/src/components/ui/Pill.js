import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const toneClassMap = {
  neutral: 'ds-pill--neutral',
  info: 'ds-pill--info',
  success: 'ds-pill--success',
  warning: 'ds-pill--warning',
  danger: 'ds-pill--critical',
  critical: 'ds-pill--critical',
  accent: 'ds-pill--accent',
  muted: 'ds-pill--muted',
};

const Pill = ({
  tone = 'neutral',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}) => (
  <span
    className={joinClassNames(
      'ds-pill',
      toneClassMap[tone] || toneClassMap.neutral,
      size === 'sm' && 'ds-pill--sm',
      className
    )}
    {...props}
  >
    {icon ? <span className="ds-pill__icon" aria-hidden="true">{icon}</span> : null}
    <span className="ds-pill__label">{children}</span>
  </span>
);

export default Pill;
