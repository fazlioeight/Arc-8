import React, { useEffect } from "react";
import { useLocation } from 'react-router-dom';

const team = [
  {
    name: "Jane Doe, CEO",
    bio: "20+ years in healthcare analytics.",
    img: "/images/jane.jpg", // Add actual image paths
    alt: "Jane Doe, CEO",
  },
  {
    name: "John Smith, CTO",
    bio: "Expert in secure data platforms.",
    img: "/images/john.jpg",
    alt: "John Smith, CTO",
  },
  {
    name: "Emily Johnson, CMO",
    bio: "Specialist in payer strategies.",
    img: "/images/emily.jpg",
    alt: "Emily Johnson, CMO",
  },
];

const About = () => {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location]);

  return (
  <main className="container py-5" aria-labelledby="about-title">
    <header>
      <h1 id="about-title" className="text-center mb-4">
        About Arc-8
      </h1>
      <p className="lead text-center">
        We are a healthcare tech startup dedicated to providing advanced
        analytics for payer groups to achieve healthier member outcomes.
      </p>
    </header>

    <section className="text-center mb-5" aria-labelledby="mission-title">
      <h2 id="mission-title">Our Mission</h2>
      <p>
        To empower payers with data-driven insights on capitation, costs, and
        risks, fostering value-based care that improves lives and reduces
        inefficiencies.
      </p>
    </section>

    <section className="text-center mb-5" aria-labelledby="values-title">
      <h2 id="values-title">Our Values</h2>
      <div>
        Innovation in analytics and care operations<br />
        Commitment to data security and HIPAA compliance<br />
        Focus on user-centered design for seamless experiences<br />
        Partnerships for long-term success
      </div>
    </section>

    <section aria-labelledby="team-title">
      <h2 id="team-title">Our Team</h2>
      <div className="row">
        {team.map((member) => (
          <div className="col-md-4 mb-4" key={member.name}>
            <div className="card h-100 shadow-sm">
              <img
                src={member.img}
                alt={member.alt}
                className="card-img-top"
                style={{ objectFit: "cover", height: "200px" }}
              />
              <div className="card-body">
                <h4 className="card-title">{member.name}</h4>
                <p className="card-text">{member.bio}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>

    <footer
      className="bg-dark text-white text-center py-3 mt-5"
      role="contentinfo"
    >
      <p>
        &copy; 2025 Arc-8. All rights reserved. |{" "}
        <a href="/privacy" className="text-white text-decoration-underline">
          Privacy Policy
        </a>{" "}
        |{" "}
        <a href="/terms" className="text-white text-decoration-underline">
          Terms of Service
        </a>
      </p>
      <address className="mt-2" style={{ fontStyle: "normal" }}>
        Contact us:{" "}
        <a href="mailto:info@arc8.com" className="text-white">
          info@arc8.com
        </a>
      </address>
    </footer>
  </main>
  );
};

export default About;
