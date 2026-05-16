import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import { AuthContext } from "../../../context/AuthContext";
import { LoadingState, ErrorState } from "../../../components/ehr/Primitives";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import { ROUTES } from "../../../constants/routes";
import { fetchMember360Members } from "../../../services/member360LabService";
import { LabSubNav, RiskBadge } from "../member360-lab/components";
import "../coding/member/memberWorkspace.css";

const Member360LandingPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Members(token, tenant, { limit: 200 })
      .then((res) => {
        if (cancelled) return;
        setMembers(res.items || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      [m.first_name, m.last_name, m.member_key, m.primary_care_provider, m.plan_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [members, search]);

  const openMember = (id) =>
    navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${id}`);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (filtered.length === 1) {
      openMember(filtered[0].id);
    }
  };

  return (
    <PortalPageLayout
      title="Launch a member chart in seconds"
      subtitle="Search across your Member360 roster and open the full chart workspace."
      eyebrow="Nexora Lab Member360"
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: "center", tone: "surface" }}
      align="left"
      maxWidthClassName="max-w-5xl"
      mainClassName="space-y-6"
    >
      <LabSubNav />

      <section className="rounded-2xl p-6 coding-surface shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label
            htmlFor="member-360-search-input"
            className="block text-sm font-medium coding-text-strong"
          >
            Member search
          </label>
          <input
            id="member-360-search-input"
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, member ID, PCP, or plan"
            className="coding-input w-full rounded-xl px-4 py-3 text-base"
          />
          <p className="text-xs coding-text-soft">
            Member roster is pulled from Member360. Press Enter when one result remains to open the chart.
          </p>
        </form>
      </section>

      {loading && (
        <LoadingState
          title="Loading members"
          description="Fetching the Member360 roster."
        />
      )}
      {error && <ErrorState title="Members unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2 text-xs coding-text-muted">
            {filtered.length} member{filtered.length === 1 ? "" : "s"}
            {filtered.length !== members.length && ` of ${members.length}`}
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm coding-text-soft">
              No members match your search.
            </p>
          ) : (
            <ul className="divide-y coding-divider">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMember(m.id)}
                    className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition coding-hoverable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <div>
                      <p className="text-sm font-semibold coding-text-strong">
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") ||
                          m.member_key ||
                          "Unknown member"}
                      </p>
                      <p className="text-xs coding-text-muted">
                        {m.member_key}
                        {m.plan_name ? ` · ${m.plan_name}` : ""}
                        {m.primary_care_provider ? ` · PCP ${m.primary_care_provider}` : ""}
                      </p>
                      {m.next_best_action && (
                        <p className="mt-1 text-xs coding-text-soft">
                          {m.next_best_action}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RiskBadge tier={m.risk_tier} score={m.risk_score_composite} />
                      <span className="text-[11px] coding-text-muted">
                        Gaps {m.open_care_gaps ?? 0} · Tasks {m.open_task_count ?? 0}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LandingPage;
