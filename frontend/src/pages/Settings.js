import React from "react";
import "../index.css";
import "./portal_page/portalPage.sfdc.css";
import DarkModeToggle from "../components/DarkModeToggle";

const Settings = ({ themePreference, setThemePreference }) => {
  return (
    <div className="sfdc-portal">
      <section className="sfdc-hero">
        <div className="sfdc-hero__content">
          <h1 className="sfdc-hero__title">Settings</h1>
          <p className="sfdc-hero__subtitle">Manage your preferences</p>
        </div>
      </section>
      <main className="sfdc-grid" style={{paddingBottom: '24px'}}>
        <div className="sfdc-card sfdc-card--full">
          <div className="sfdc-card__title">Appearance</div>
          <p className="sfdc-card__body">Choose how Nexora looks on this device.</p>
          <div style={{marginTop: 8}}>
            <DarkModeToggle themePreference={themePreference} setThemePreference={setThemePreference} />
          </div>
        </div>
        <div className="sfdc-card">
          <div className="sfdc-card__title">Profile</div>
          <div className="sfdc-card__body">Update your display name and contact info (coming soon).</div>
        </div>
        <div className="sfdc-card">
          <div className="sfdc-card__title">Notifications</div>
          <div className="sfdc-card__body">Control alerts and email preferences (coming soon).</div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
