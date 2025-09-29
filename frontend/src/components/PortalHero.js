import React from 'react';
import '../pages/portal_page/portalPage.sfdc.css';

const PortalHero = ({ title, subtitle, actions, align = 'center', wave = true, className = '', children }) => {
  let heroClass = 'sfdc-hero';
  if (align === 'left') heroClass += ' sfdc-hero--left';
  if (!wave) heroClass += ' sfdc-hero--flat';
  if (className) heroClass += ` ${className}`;

  return (
    <section className={heroClass}>
      <div className="sfdc-hero__content">
        <div className="sfdc-hero__text">
          <h1 className="sfdc-hero__title">{title}</h1>
          {subtitle ? <p className="sfdc-hero__subtitle">{subtitle}</p> : null}
        </div>
        {children}
        {actions ? <div className="sfdc-hero__actions">{actions}</div> : null}
      </div>
    </section>
  );
};

export default PortalHero;
