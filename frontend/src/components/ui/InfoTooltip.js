import React, { useId } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import Icon from './Icon';

const joinClassNames = (...parts) =>
  parts.filter(Boolean).join(' ');

const InfoTooltip = ({
  content,
  icon = 'info',
  placement = 'top',
  id,
  className = '',
  delay = { show: 120, hide: 80 },
  children,
  ...rest
}) => {
  const generatedId = useId();
  const tooltipId = id || `ds-tooltip-${generatedId}`;

  const tooltipOverlay = (
    <Tooltip id={tooltipId}>{content}</Tooltip>
  );

  if (children) {
    return (
      <OverlayTrigger placement={placement} overlay={tooltipOverlay} delay={delay}>
        {React.cloneElement(children, {
          tabIndex: children.props?.tabIndex ?? 0,
          ...rest,
        })}
      </OverlayTrigger>
    );
  }

  const fallbackLabel = rest['aria-label'] || 'More information';

  return (
    <OverlayTrigger placement={placement} overlay={tooltipOverlay} delay={delay}>
      <span
        className={joinClassNames('ds-tooltip-trigger', className)}
        tabIndex={0}
        role="button"
        aria-label={fallbackLabel}
        {...rest}
      >
        <Icon name={icon} size={16} />
      </span>
    </OverlayTrigger>
  );
};

export default InfoTooltip;
