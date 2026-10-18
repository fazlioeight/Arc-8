import React from "react";

const ToggleSwitch = ({ id, checked, onChange, label, hint, disabled }) => {
  return (
    <label className={`li-toggle ${disabled ? "is-disabled" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="li-toggle__input"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className="li-toggle__track" aria-hidden>
        <span className="li-toggle__thumb" />
      </span>
      <span className="li-toggle__label">
        <span className="li-toggle__title">{label}</span>
        {hint && <span className="li-toggle__hint">{hint}</span>}
      </span>
    </label>
  );
};

export default ToggleSwitch;

