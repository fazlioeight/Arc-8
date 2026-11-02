import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { ROUTES } from "../../constants/routes";
import { DEMO_PERSONAS } from "../../constants/permissions";
import "./home.landing.css";

const Home = () => {
  const [activeTab, setActiveTab] = useState("member360");

  const trustPartners = [
    "Prominence Health Plan",
    "CareFirst BlueCross",
    "Optiview Health System",
    "WellMetrics Medicare ACO",
    "Centene Clinical Network",
    "Apex Value Alliance",
  ];

  return (
    <div className="nx-landing">
      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className="nx-hero-enterprise">
        <div className="nx-hero-container">
          <div className="flex flex-col items-center text-center">
            
            <div className="nx-hero-badge">
              <span className="flex h-2 w-2 rounded-full bg-sky-400 animate-ping" />
              CMS-HCC v28 Compliant • Integrated Clinical Care & Risk Operating System
            </div>

            <h1 className="nx-hero-title max-w-4xl">
              Healthcare Analytics & Care Delivery for{" "}
              <span className="nx-hero-gradient-text">US Payers & Providers</span>
            </h1>

            <p className="nx-hero-desc">
              Empower clinicians, risk adjustment coders, care coordinators, and actuarial teams with an end-to-end, HIPAA-compliant platform unifying Member 360 intelligence, automated HCC suspecting, and value-based capitation.
            </p>

            <div className="nx-hero-actions">
              <NavLink to="/login" className="nx-btn-primary">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Launch Platform Workspace
              </NavLink>
              <a href="#sandbox" className="nx-btn-secondary">
                <svg className="h-4 w-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Explore Live Clinical Sandbox
              </a>
              <NavLink to={ROUTES.SETTINGS} className="nx-btn-secondary">
                <svg className="h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Roles & Privileges Matrix
              </NavLink>
            </div>
          </div>

          {/* ─── Interactive Sandbox Preview ─────────────────────── */}
          <div id="sandbox" className="nx-sandbox-card">
            {/* Top Workspace Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-slate-400">arc8-clinical-ops.us-east.hipaa-secure</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-800">
                  ● Real-time Telemetry
                </span>
                <span className="text-slate-500">Tenant: Prominence Health</span>
              </div>
            </div>

            {/* Sandbox Tabs */}
            <div className="nx-sandbox-nav">
              <button
                type="button"
                onClick={() => setActiveTab("member360")}
                className={`nx-sandbox-tab ${activeTab === "member360" ? "active" : ""}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
                1. Member 360 & Care Journeys
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("coding")}
                className={`nx-sandbox-tab ${activeTab === "coding" ? "active" : ""}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                2. CMS-HCC Risk Adjustment & Coding
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("capitation")}
                className={`nx-sandbox-tab ${activeTab === "capitation" ? "active" : ""}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
                3. Capitation & PMPM Economics
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("rides")}
                className={`nx-sandbox-tab ${activeTab === "rides" ? "active" : ""}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                4. NEMT Medical Transport
              </button>
            </div>

            {/* Sandbox Tab Content */}
            <div className="p-6 md:p-8 bg-slate-900/90 min-h-[340px]">
              {activeTab === "member360" && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fadeIn">
                  <div className="md:col-span-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-lg text-white">
                        EV
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">Eleanor Vance</h4>
                        <p className="text-xs text-slate-400">71y Female • Medicare Advantage (D-SNP)</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Payer ID:</span>
                        <span className="font-mono text-slate-200">PRM-849102-01</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Predicted RAF:</span>
                        <span className="font-bold text-amber-400">2.148 (High Risk)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Attributed PCP:</span>
                        <span className="text-slate-200">Dr. Sarah Chen, MD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Next Appointment:</span>
                        <span className="text-sky-400 font-semibold">Oct 24, 2026 (Diabetic Retinal)</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-8 space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Care Journeys & Gaps</span>
                        <span className="text-xs text-emerald-400 font-semibold">2 of 3 Gaps Closed</span>
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-800 bg-slate-900/60">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <div>
                              <div className="text-xs font-semibold text-white">Annual Wellness Visit (AWV) & Cognitive Assessment</div>
                              <div className="text-[11px] text-slate-400">Completed with Dr. Chen on Sep 12, 2026</div>
                            </div>
                          </div>
                          <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-800">
                            Completed
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-800/40 bg-amber-950/20">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                            <div>
                              <div className="text-xs font-semibold text-white">HbA1c Poor Control (&gt;9.0%) Monitoring</div>
                              <div className="text-[11px] text-slate-400">Care Coordinator Elena Martinez scheduled outreach call</div>
                            </div>
                          </div>
                          <span className="rounded-md bg-amber-950 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-800">
                            In Progress
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 text-xs">
                      <div>
                        <span className="font-bold text-white">Need clinician notes or care order updates?</span>
                        <p className="text-slate-400 text-[11px]">Role-gated under <code className="text-sky-300">phi:write</code> permission for authorized providers.</p>
                      </div>
                      <NavLink to="/login" className="rounded-lg bg-sky-600 px-3.5 py-1.5 font-bold text-white hover:bg-sky-500">
                        Open Member 360
                      </NavLink>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "coding" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs text-slate-400">Open Chart Chases</div>
                      <div className="text-2xl font-bold text-white mt-1">1,248</div>
                      <div className="text-[11px] text-emerald-400 mt-0.5">↑ 94.2% retrieval rate</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs text-slate-400">Suspected HCC Value</div>
                      <div className="text-2xl font-bold text-sky-400 mt-1">+$4.82M</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Based on CMS-HCC v28 models</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs text-slate-400">Validation Speed</div>
                      <div className="text-2xl font-bold text-purple-400 mt-1">3.4x</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Dual-coder consensus engine</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-x-auto">
                    <div className="flex items-center justify-between mb-3 text-xs">
                      <span className="font-bold text-slate-300 uppercase tracking-wider">Top Suspected HCCs Identified</span>
                      <NavLink to="/login" className="text-sky-400 hover:underline">View Full Coding Worklist →</NavLink>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500">
                          <th className="pb-2">HCC Code</th>
                          <th className="pb-2">Clinical Condition</th>
                          <th className="pb-2">Evidence Confidence</th>
                          <th className="pb-2">RAF Delta</th>
                          <th className="pb-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        <tr>
                          <td className="py-2.5 font-mono text-sky-400 font-bold">HCC 19</td>
                          <td className="text-white">Diabetes with Chronic Complications</td>
                          <td><span className="rounded bg-emerald-950 text-emerald-400 px-2 py-0.5 font-semibold text-[10px]">96% High</span></td>
                          <td className="font-semibold text-emerald-400">+0.302</td>
                          <td className="text-right"><button className="rounded bg-sky-600/80 px-2.5 py-1 text-[11px] text-white font-semibold">Validate</button></td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-mono text-sky-400 font-bold">HCC 88</td>
                          <td className="text-white">Angina Pectoris</td>
                          <td><span className="rounded bg-emerald-950 text-emerald-400 px-2 py-0.5 font-semibold text-[10px]">91% High</span></td>
                          <td className="font-semibold text-emerald-400">+0.140</td>
                          <td className="text-right"><button className="rounded bg-sky-600/80 px-2.5 py-1 text-[11px] text-white font-semibold">Validate</button></td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-mono text-sky-400 font-bold">HCC 108</td>
                          <td className="text-white">COPD (Chronic Obstructive Pulmonary Disease)</td>
                          <td><span className="rounded bg-amber-950 text-amber-400 px-2 py-0.5 font-semibold text-[10px]">78% Med</span></td>
                          <td className="font-semibold text-emerald-400">+0.335</td>
                          <td className="text-right"><button className="rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 font-semibold">Review</button></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "capitation" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Value-Based Capitation Contract Performance
                    </h4>
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Target PMPM: $684.00</span>
                          <span className="text-emerald-400 font-bold">Actual: $612.40 (-10.4%)</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "78%" }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <div className="text-slate-400 text-[11px]">Shared Savings Pool</div>
                          <div className="text-lg font-bold text-white mt-0.5">$2,418,900</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <div className="text-slate-400 text-[11px]">Medical Loss Ratio (MLR)</div>
                          <div className="text-lg font-bold text-emerald-400 mt-0.5">82.4%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Actuarial Risk Corridor Simulation</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Simulate downside and upside risk thresholds across commercial, Medicare Advantage, and Medicaid managed cohorts.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Export models in X12 835 / PDF</span>
                      <NavLink to="/login" className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-500">
                        Launch Analyzer
                      </NavLink>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "rides" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-white">Non-Emergency Medical Transportation (NEMT) Logistics</h4>
                        <p className="text-xs text-slate-400">Directly dispatch and monitor patient transportation to reduce clinical no-shows.</p>
                      </div>
                      <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800">
                        99.1% On-Time Arrival
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="text-slate-400">Active Rides Today</div>
                        <div className="text-xl font-bold text-white mt-1">42 Dispatches</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="text-slate-400">Prevented No-Shows</div>
                        <div className="text-xl font-bold text-sky-400 mt-1">38 Visits Saved</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="text-slate-400">Wheelchair Accessible</div>
                        <div className="text-xl font-bold text-purple-400 mt-1">16 WAV Units</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Metric Ticker Strip ─────────────────────────────────── */}
      <section className="nx-ticker-strip">
        <div className="nx-ticker-grid">
          <div className="nx-ticker-item">
            <span className="nx-ticker-val text-sky-400">+0.342</span>
            <span className="nx-ticker-lbl">Avg RAF Score Improvement</span>
          </div>
          <div className="nx-ticker-item">
            <span className="nx-ticker-val text-emerald-400">$18.4M</span>
            <span className="nx-ticker-lbl">Capitation Shared Savings</span>
          </div>
          <div className="nx-ticker-item">
            <span className="nx-ticker-val text-purple-400">3.4x</span>
            <span className="nx-ticker-lbl">Faster Chart Retrieval & Coding</span>
          </div>
          <div className="nx-ticker-item">
            <span className="nx-ticker-val text-white">99.98%</span>
            <span className="nx-ticker-lbl">HIPAA & SOC-2 Uptime SLA</span>
          </div>
        </div>
      </section>

      {/* ─── Enterprise Trust Bar ───────────────────────────────── */}
      <section className="nx-trust-section">
        <div className="nx-trust-label">Trusted by Leading US Health Plans, ACOs, and Provider Networks</div>
        <div className="nx-trust-logos">
          {trustPartners.map((partner) => (
            <div key={partner} className="nx-trust-badge">
              {partner}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Tailored Role-Based Workspaces ─────────────────────── */}
      <section className="nx-roles-section">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Role-Based Governance</span>
          <h2 className="text-3xl font-extrabold text-white mt-1">
            Built for Every Stakeholder Across Value-Based Care
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
            Configurable privileges ensure strict clinical separation of duties, protecting PHI while empowering each team with specialized tooling.
          </p>
        </div>

        <div className="nx-roles-grid">
          {DEMO_PERSONAS.map((persona) => (
            <div key={persona.role} className="nx-role-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-950 text-sm font-bold text-sky-400 border border-sky-800">
                    {persona.avatar}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-slate-300">
                    {persona.role}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-4">{persona.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{persona.department}</p>
                <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
                  Example user: <strong className="text-white">{persona.name}</strong> ({persona.email})
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-800/60">
                <NavLink
                  to="/login"
                  className="flex items-center justify-between text-xs font-bold text-sky-400 hover:text-sky-300"
                >
                  <span>Experience {persona.role} view</span>
                  <span>→</span>
                </NavLink>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Ready CTA ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto my-16 px-6">
        <div className="rounded-3xl border border-sky-800/50 bg-gradient-to-r from-sky-950/60 via-slate-900 to-slate-950 p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
          <div>
            <h3 className="text-2xl font-black text-white">Ready to modernize your clinical operations?</h3>
            <p className="text-sm text-slate-400 mt-1">Deploy Arc-8 across your health plan or provider network today.</p>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/login" className="nx-btn-primary">
              Sign In to Workspace
            </NavLink>
            <NavLink to={ROUTES.SETTINGS} className="nx-btn-secondary">
              Role Settings
            </NavLink>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="nx-footer-enterprise">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            © {new Date().getFullYear()} Arc-8 Enterprise Healthcare. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span className="text-emerald-400">HIPAA Compliant</span>
            <span>SOC-2 Type II Certified</span>
            <span>FHIR R4 / HL7 v2</span>
            <span>CMS-HCC v28 Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
