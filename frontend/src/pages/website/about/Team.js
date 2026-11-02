import React from 'react';

const mockTeam = [
  { name: 'Alex Rivera', role: 'Head of Data', fun: 'Kombucha brewer' },
  { name: 'Priya Shah', role: 'Platform Engineer', fun: 'Trail runner' },
  { name: 'Marcus Lee', role: 'Design Lead', fun: 'Synth nerd' },
];

const Team = () => (
  <div className="container py-5">
    <h1>Team</h1>
    <p>Meet a few of the folks building Arc-8 (placeholder data):</p>
    <div className="row">
      {mockTeam.map((m) => (
        <div key={m.name} className="col-md-4 mb-3">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h4 className="card-title">{m.name}</h4>
              <div className="card-text">{m.role}</div>
              <small className="text-muted">Fun: {m.fun}</small>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Team;

