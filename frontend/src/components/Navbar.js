// components/Navbar.js - Common navigation component
import React from "react";
import { Navbar as BSNavbar, Nav } from "react-bootstrap";

const Navbar = () => (
  <BSNavbar
    bg="primary"
    variant="dark"
    expand="lg"
    style={{ backgroundColor: "#e9f7ff" }}
  >
    <div className="container">
      <BSNavbar.Brand
        href="/"
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
          <Nav.Link href="/" active>
            Home
          </Nav.Link>
          <Nav.Link href="/about">About</Nav.Link>
          <Nav.Link href="/products">Products</Nav.Link>
          <Nav.Link href="/insights">Insights</Nav.Link>
          <Nav.Link href="/contact">Contact</Nav.Link>
          <Nav.Link href="/signup">Sign Up</Nav.Link>
          <Nav.Link href="/login">Login</Nav.Link>
        </Nav>
      </BSNavbar.Collapse>
    </div>
  </BSNavbar>
);

export default Navbar;
