// components/Navbar.js - Common navigation component
import React, { useState } from "react";
import { Navbar as BSNavbar, Nav, NavDropdown } from "react-bootstrap";
import { NavLink } from "react-router-dom";

const Navbar = () => {
  const [showAbout, setShowAbout] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showContact, setShowContact] = useState(false);

  return (
    <BSNavbar bg="light" variant="light" expand="lg">
      <div className="container">
        <BSNavbar.Brand
          as={NavLink}
          to="/"
          style={{ display: "flex", alignItems: "center" }}
        >
          <img
            src="/images/nexoraanalyticsNavBarlogo.png"
            alt="Nexora Analytics Logo"
          />
          Nexora Analytics
        </BSNavbar.Brand>
        <BSNavbar.Toggle aria-controls="navbarNav" />
        <BSNavbar.Collapse id="navbarNav" className="justify-content-end">
          <Nav>
            <Nav.Link as={NavLink} to="/" end>
              Home
            </Nav.Link>

            <NavDropdown
              title="About"
              id="nav-about"
              show={showAbout}
              onMouseEnter={() => setShowAbout(true)}
              onMouseLeave={() => setShowAbout(false)}
            >
              <NavDropdown.Item as={NavLink} to="/about/mission">Mission</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/about/values">Values</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/about/team">Team</NavDropdown.Item>
            </NavDropdown>

            <NavDropdown
              title="Products"
              id="nav-products"
              show={showProducts}
              onMouseEnter={() => setShowProducts(true)}
              onMouseLeave={() => setShowProducts(false)}
            >
              <NavDropdown.Item as={NavLink} to="/products/risk-analysis">Risk Analysis Dashboard</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/products/capitation-analyzer">Cost & Capitation Analyzer</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/products/member-health-insights">Member Health Insights</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/products/integration-suite">Integration Suite</NavDropdown.Item>
            </NavDropdown>

            <NavDropdown
              title="Insights"
              id="nav-insights"
              show={showInsights}
              onMouseEnter={() => setShowInsights(true)}
              onMouseLeave={() => setShowInsights(false)}
            >
              <NavDropdown.Item as={NavLink} to="/insights/future-capitation">Future of Capitation</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/insights/predictive-modeling">Predictive Modeling</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/insights/cost-savings">Cost Savings</NavDropdown.Item>
            </NavDropdown>

            <NavDropdown
              title="Contact"
              id="nav-contact"
              show={showContact}
              onMouseEnter={() => setShowContact(true)}
              onMouseLeave={() => setShowContact(false)}
            >
              <NavDropdown.Item as={NavLink} to="/contact/form">Contact Form</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/contact/info">Company Info</NavDropdown.Item>
            </NavDropdown>

            <Nav.Link as={NavLink} to="/pricing">
              Pricing
            </Nav.Link>
            <Nav.Link as={NavLink} to="/login">
              Login
            </Nav.Link>
          </Nav>
        </BSNavbar.Collapse>
      </div>
    </BSNavbar>
  );
};

export default Navbar;
