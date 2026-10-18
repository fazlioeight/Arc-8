import React from 'react';

const joinClassNames = (...parts) =>
  parts.filter(Boolean).join(' ');

const Skeleton = ({
  width = '100%',
  height,
  variant = 'text',
  className = '',
  style,
  ...rest
}) => {
  const inlineStyle = {
    width,
    ...(height ? { height } : null),
    ...style,
  };

  return (
    <span
      className={joinClassNames('ds-skeleton', variant ? `ds-skeleton--${variant}` : '', className)}
      style={inlineStyle}
      aria-hidden="true"
      {...rest}
    />
  );
};

export const SkeletonGroup = ({
  lines = 3,
  width = '100%',
  className = '',
  gap = 'var(--space-xs)',
  style,
}) => (
  <div
    className={joinClassNames('ds-skeleton-group', className)}
    style={{ gap, ...style }}
    aria-hidden="true"
  >
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} width={width} variant="text" />
    ))}
  </div>
);

export default Skeleton;
