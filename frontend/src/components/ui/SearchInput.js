import React, { forwardRef } from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 coding-text-muted pointer-events-none"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
  </svg>
);

/**
 * Search input with a leading magnifier icon. Used in HubSpot-style index page
 * filter rows. Forwards all native input props to the underlying element so
 * callers can wire `value`, `onChange`, `disabled`, form props, etc.
 */
const SearchInput = forwardRef(function SearchInput(
  { className = '', wrapperClassName = '', ...inputProps },
  ref
) {
  return (
    <div className={joinClassNames('relative flex-1 min-w-0', wrapperClassName)}>
      <SearchIcon />
      <input
        ref={ref}
        type="search"
        className={joinClassNames(
          'coding-input w-full rounded-md pl-9 pr-3 py-2 text-sm',
          className
        )}
        {...inputProps}
      />
    </div>
  );
});

export default SearchInput;
