import React from 'react';

const FIELDS = [
  ['meat_complete', 'MEAT satisfied'],
  ['face_to_face', 'Face-to-face (or allowed exception)'],
  ['acceptable_provider', 'Acceptable provider type'],
  ['dos_in_year', 'DOS within performance year'],
];

const MEATChecklist = ({ value = {}, onChange }) => {
  const handleToggle = (key, checked) => {
    onChange?.({
      ...value,
      [key]: checked,
    });
  };

  return (
    <div className="row g-2">
      {FIELDS.map(([key, label]) => (
        <div key={key} className="col-12">
          <div className="form-check">
            <input
              id={`check-${key}`}
              className="form-check-input"
              type="checkbox"
              checked={Boolean(value[key])}
              onChange={(event) => handleToggle(key, event.target.checked)}
            />
            <label className="form-check-label" htmlFor={`check-${key}`}>
              {label}
            </label>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MEATChecklist;
