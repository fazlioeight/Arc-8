// components/Navbar.js - Common navigation component
import React from "react";
import { Navbar as BSNavbar, Nav } from "react-bootstrap";
import { NavLink } from "react-router-dom";

const Navbar = () => (
  <BSNavbar
    bg="primary"
    variant="dark"
    expand="lg"
    style={{ backgroundColor: "#e9f7ff" }}
  >
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
          <Nav.Link as={NavLink} to="/about">
            About
          </Nav.Link>
          <Nav.Link as={NavLink} to="/products">
            Products
          </Nav.Link>
          <Nav.Link as={NavLink} to="/insights">
            Insights
          </Nav.Link>
          <Nav.Link as={NavLink} to="/contact">
            Contact
          </Nav.Link>
          <Nav.Link as={NavLink} to="/signup">
            Sign Up
          </Nav.Link>
          <Nav.Link as={NavLink} to="/login">
            Login
          </Nav.Link>
        </Nav>
      </BSNavbar.Collapse>
    </div>
  </BSNavbar>
);

export default Navbar;