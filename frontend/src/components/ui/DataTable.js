import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const DataTable = React.forwardRef(({
  children,
  density = 'regular',
  bleed = false,
  className = '',
  header,
  footer,
  ...props
}, ref) => (
  <div className={joinClassNames('ds-table__wrapper', bleed && 'ds-table__wrapper--bleed')}>
    {header}
    <table
      ref={ref}
      className={joinClassNames(
        'ds-table',
        density === 'compact' && 'ds-table--compact',
        className
      )}
      {...props}
    >
      {children}
    </table>
    {footer}
  </div>
));

DataTable.displayName = 'DataTable';

export default DataTable;
