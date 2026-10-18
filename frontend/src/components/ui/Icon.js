import React from 'react';

const ICON_PATHS = {
  arrowRight: 'M9 5l7 7-7 7-1.5-1.5L12.5 12 7.5 7z',
  check: 'M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z',
  info: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  search: 'M10 2a8 8 0 015.29 13.71l4 4L18.9 21l-4-4A8 8 0 1110 2zm0 2a6 6 0 100 12 6 6 0 000-12z',
  clock: 'M12 2a10 10 0 1010 10A10.011 10.011 0 0012 2zm1 11h4v-2h-3V7h-2v6z',
  spark: 'M11.24 2l1.52 4.68h4.92l-3.98 2.9 1.52 4.68-3.98-2.9-3.98 2.9 1.52-4.68-3.98-2.9h4.92z',
  star: 'M12 17.27L18.18 21 16.54 13.97 22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z',
  starFilled: 'M12 17.27L18.18 21 16.54 13.97 22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z',
};

const joinClassNames = (...parts) =>
  parts.filter(Boolean).join(' ');

const Icon = ({ name, size = 16, title, className = '', ...rest }) => {
  const path = ICON_PATHS[name];

  if (!path) {
    return null;
  }

  const labelledProps = title
    ? { role: 'img', 'aria-hidden': false }
    : { 'aria-hidden': true };

  return (
    <svg
      className={joinClassNames('ds-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      focusable="false"
      {...labelledProps}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d={path} />
    </svg>
  );
};

export default Icon;
