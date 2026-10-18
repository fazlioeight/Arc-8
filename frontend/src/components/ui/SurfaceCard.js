import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const SurfaceCard = ({
  title,
  subtitle,
  eyebrow,
  actions,
  footer,
  padding = 'default',
  interactive = false,
  className = '',
  bodyClassName = '',
  children,
  ...props
}) => {
  const actionItems = Array.isArray(actions) ? actions : actions ? [actions] : [];

  return (
    <section
      className={joinClassNames(
        'ds-card',
        padding === 'compact' && 'ds-card--compact',
        interactive && 'ds-card--interactive',
        className
      )}
      {...props}
    >
      {(eyebrow || title || subtitle || actionItems.length > 0) && (
        <header className="ds-card__header">
          <div className="ds-card__heading">
            {eyebrow ? <div className="ds-eyebrow">{eyebrow}</div> : null}
            {title ? <div className="ds-card__title">{title}</div> : null}
            {subtitle ? <div className="ds-card__meta">{subtitle}</div> : null}
          </div>
          {actionItems.length > 0 ? (
            <div className="ds-card__actions ds-action-row ds-action-row--end">
              {actionItems.map((action, index) => (
                <span key={action?.key || index} className="ds-card__action">
                  {action}
                </span>
              ))}
            </div>
          ) : null}
        </header>
      )}

      <div className={joinClassNames('ds-card__body', bodyClassName)}>
        {children}
      </div>

      {footer ? <footer className="ds-card__footer">{footer}</footer> : null}
    </section>
  );
};

export default SurfaceCard;
