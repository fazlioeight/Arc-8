import React, { useState, useRef, useEffect, useCallback, useContext } from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ROUTES } from "../constants/routes";

const NAVIGATION = [
  {
    label: "About",
    items: [
      { label: "Mission",  href: "/about/mission" },
      { label: "Values",   href: "/about/values" },
      { label: "Team",     href: "/about/team" },
    ],
  },
  {
    label: "Products",
    items: [
      { label: "Risk Analysis Dashboard",   href: "/products/risk-analysis" },
      { label: "Cost & Capitation Analyzer",href: "/products/capitation-analyzer" },
      { label: "Member Health Insights",    href: "/products/member-health-insights" },
      { label: "Integration Suite",         href: "/products/integration-suite" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Future of Capitation",  href: "/insights/future-capitation" },
      { label: "Predictive Modeling",   href: "/insights/predictive-modeling" },
      { label: "Cost Savings",          href: "/insights/cost-savings" },
    ],
  },
  {
    label: "Contact",
    items: [
      { label: "Contact Form", href: "/contact/form" },
      { label: "Company Info", href: "/contact/info" },
    ],
  },
];

const ChevronDown = () => (
  <svg className="h-3.5 w-3.5 opacity-60 transition-transform duration-150 group-data-[open=true]:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MenuIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
  </svg>
);

const XIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
);

const DropdownMenu = ({ nav, isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white py-1.5 shadow-dropdown dark:border-slate-700 dark:bg-slate-900">
      {nav.items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          onClick={onClose}
          className={({ isActive }) =>
            [
              "block px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "text-brand-600 dark:text-brand-400"
                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
};

const Navbar = () => {
  const { isAuthenticated, role, user, tenant } = useContext(AuthContext) || {};
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const navRef = useRef(null);

  const closeAll = useCallback(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
    setMobileExpanded(null);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navLinkBase =
    "text-sm font-medium transition-colors text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white";
  const navLinkActive = "text-brand-600 dark:text-brand-400";

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90"
      ref={navRef}
    >
      <nav className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
        {/* ── Brand ─────────────────────────────────────────── */}
        <NavLink
          to="/"
          onClick={closeAll}
          className="group flex shrink-0 items-center gap-3"
        >
          <img
            src="/images/arc8-logo.png"
            alt="Arc-8 logo"
            className="h-9 w-auto rounded-lg object-contain shadow-sm transition-transform duration-200 group-hover:scale-105"
          />
          <span
            className="flex items-baseline text-[21px] font-extrabold leading-none"
            style={{ fontFamily: "'Outfit', 'Space Grotesk', 'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.03em" }}
          >
            <span className="text-slate-900 dark:text-white">Arc</span>
            <span className="mx-0.5 font-bold text-sky-500 dark:text-sky-400">-</span>
            <span className="bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              8
            </span>
          </span>
        </NavLink>

        {/* ── Desktop links ─────────────────────────────────── */}
        <div className="hidden items-center gap-1 lg:flex">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              ["px-3 py-2 rounded-lg", navLinkBase, isActive ? navLinkActive : ""].join(" ")
            }
          >
            Home
          </NavLink>

          {NAVIGATION.map((nav) => (
            <div
              key={nav.label}
              className="relative"
              data-open={openDropdown === nav.label}
              onMouseEnter={() => setOpenDropdown(nav.label)}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <button
                className={[
                  "group inline-flex items-center gap-1 rounded-lg px-3 py-2",
                  navLinkBase,
                ].join(" ")}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === nav.label ? null : nav.label
                  )
                }
                aria-expanded={openDropdown === nav.label}
                aria-haspopup="true"
              >
                {nav.label}
                <ChevronDown />
              </button>
              <DropdownMenu
                nav={nav}
                isOpen={openDropdown === nav.label}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
          ))}

          <NavLink
            to="/pricing"
            className={({ isActive }) =>
              ["px-3 py-2 rounded-lg", navLinkBase, isActive ? navLinkActive : ""].join(" ")
            }
          >
            Pricing
          </NavLink>
        </div>

        {/* ── Desktop CTA ───────────────────────────────────── */}
        <div className="hidden items-center gap-3 lg:flex">
          {isAuthenticated ? (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {(role || "User").toUpperCase()}
              </span>
              <NavLink
                to={ROUTES.PORTAL.LANDING}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                Go to Platform
              </NavLink>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <NavLink
                to="/login"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Sign in
              </NavLink>
              <NavLink
                to="/login"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                Launch Workspace
              </NavLink>
            </div>
          )}
        </div>

        {/* ── Mobile toggle ─────────────────────────────────── */}
        <button
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <XIcon /> : <MenuIcon />}
        </button>
      </nav>

      {/* ── Mobile menu ───────────────────────────────────── */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 dark:border-slate-800 dark:bg-slate-950 lg:hidden">
          <NavLink
            to="/"
            end
            onClick={closeAll}
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2.5 text-sm font-medium",
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
              ].join(" ")
            }
          >
            Home
          </NavLink>

          {NAVIGATION.map((nav) => (
            <div key={nav.label}>
              <button
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() =>
                  setMobileExpanded((prev) =>
                    prev === nav.label ? null : nav.label
                  )
                }
                aria-expanded={mobileExpanded === nav.label}
              >
                {nav.label}
                <svg
                  className={`h-4 w-4 transition-transform ${mobileExpanded === nav.label ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                </svg>
              </button>
              {mobileExpanded === nav.label && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                  {nav.items.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      onClick={closeAll}
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2 text-sm",
                          isActive
                            ? "font-semibold text-brand-600 dark:text-brand-400"
                            : "font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                        ].join(" ")
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}

          <NavLink
            to="/pricing"
            onClick={closeAll}
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2.5 text-sm font-medium",
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
              ].join(" ")
            }
          >
            Pricing
          </NavLink>

          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <NavLink
              to="/login"
              onClick={closeAll}
              className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Sign in
            </NavLink>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
