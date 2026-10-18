import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const toneClassMap = {
  info: 'ds-alert--info',
  neutral: 'ds-alert--neutral',
  success: 'ds-alert--success',
  warning: 'ds-alert--warning',
  danger: 'ds-alert--danger',
  critical: 'ds-alert--danger',
};

const AlertShell = ({
  tone = 'info',
  title,
  description,
  icon,
  actions,
  className = '',
  children,
  ...props
}) => (
  <div
    role="alert"
    className={joinClassNames('ds-alert', toneClassMap[tone] || toneClassMap.info, className)}
    {...props}
  >
    {icon ? <span className="ds-alert__icon" aria-hidden="true">{icon}</span> : null}
    <div className="ds-alert__content">
      {title ? <div className="ds-alert__title">{title}</div> : null}
      {description ? <div className="ds-alert__description">{description}</div> : null}
      {children}
      {actions ? <div className="ds-alert__actions">{actions}</div> : null}
    </div>
  </div>
);

export default AlertShell;
