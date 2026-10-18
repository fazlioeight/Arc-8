import React from 'react';
import Icon from './Icon';

const EmptyState = ({
  icon = 'info',
  title,
  description,
  children,
  className = '',
}) => (
  <div className={`ds-empty ${className}`.trim()}>
    <span className="ds-empty__icon" aria-hidden="true">
      <Icon name={icon} size={28} />
    </span>
    {title ? <h3 className="ds-empty__title">{title}</h3> : null}
    {description ? <p className="ds-empty__description">{description}</p> : null}
    {children ? <div className="ds-empty__actions">{children}</div> : null}
  </div>
);

export default EmptyState;
