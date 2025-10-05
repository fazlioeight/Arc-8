import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../components/PortalUtilityBar";
import { AuthContext } from "../../context/AuthContext";
import {
  createAdminUser,
  fetchAdminApplications,
  fetchAdminUsers,
  updateAdminUser,
} from "../../services/adminService";
import "../../index.css";
import "../portal_page/portalPage.sfdc.css";
import "./masterAdmin.css";

const API_ERROR_FALLBACK = "Unable to load admin data. Please try again.";

const buildApplicationState = (apps, userApps = {}) => {
  const base = {};
  apps.forEach((app) => {
    if (app.key === "portal") {
      base[app.key] = userApps[app.key] || "user";
    } else if (app.key === "admin_console") {
      base[app.key] = userApps[app.key] || "none";
    } else {
      base[app.key] = userApps[app.key] || "none";
    }
  });
  return base;
};

const toPayloadApplications = (appState) => {
  const payload = {};
  Object.entries(appState).forEach(([key, level]) => {
    if (level && level !== "none") {
      payload[key] = level;
    }
  });
  return payload;
};

const summarizeApplications = (appDefinitions, appPermissions) => {
  if (!appDefinitions.length || !appPermissions) return "No access";
  const summary = [];
  appDefinitions.forEach((app) => {
    const level = appPermissions[app.key];
    if (level) {
      summary.push(`${app.label}: ${level === "admin" ? "Admin" : "User"}`);
    }
  });
  return summary.length ? summary.join(", ") : "No access";
};

const MasterAdminPage = () => {
  const navigate = useNavigate();
  const { token, tenant, role, user } = useContext(AuthContext) || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", role: "user", is_active: true, applications: {} });
  const [mode, setMode] = useState("view"); // "view" | "create" | "edit"
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [sampleMode, setSampleMode] = useState(false);
  const [search, setSearch] = useState("");

  const isAdmin = role === "admin";

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    if (token && role && role !== "admin") {
      navigate("/portal_page/portalPage");
    }
  }, [token, role, navigate]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      if (!token || !tenant || !isAdmin) return;
      setLoading(true);
      setError("");
      try {
        const [appsResponse, usersResponse] = await Promise.all([
          fetchAdminApplications({ token, tenant }),
          fetchAdminUsers({ token, tenant }),
        ]);
        if (!isActive) return;
        const sortedApps = [...(appsResponse.applications || [])].sort((a, b) => a.label.localeCompare(b.label));
        const sortedUsers = [...(usersResponse.users || [])].sort((a, b) => a.email.localeCompare(b.email));
        setApps(sortedApps);
        setUsers(sortedUsers);
        const sampleActive = Boolean(appsResponse.__sample || usersResponse.__sample);
        setSampleMode(sampleActive);
        if (sortedUsers.length) {
          const first = sortedUsers[0];
          setSelectedUserId(first.id);
          setMode("edit");
          setForm({
            email: first.email,
            password: "",
            role: first.role,
            is_active: first.is_active,
            applications: buildApplicationState(sortedApps, first.applications),
          });
        } else {
          setMode("create");
          setForm({
            email: "",
            password: "",
            role: "user",
            is_active: true,
            applications: buildApplicationState(sortedApps, {}),
          });
        }
      } catch (err) {
        console.error(err);
        if (!isActive) return;
        setSampleMode(false);
        setError(err.message || API_ERROR_FALLBACK);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [token, tenant, isAdmin]);

  useEffect(() => {
    if (!statusMessage) return;
    const id = setTimeout(() => setStatusMessage(""), 4000);
    return () => clearTimeout(id);
  }, [statusMessage]);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter((u) => u.email.toLowerCase().includes(term));
  }, [users, search]);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) || null, [users, selectedUserId]);

  const resetFormForCreate = () => {
    setMode("create");
    setSelectedUserId(null);
    setError("");
    setStatusMessage("");
    setForm({
      email: "",
      password: "",
      role: "user",
      is_active: true,
      applications: buildApplicationState(apps, {}),
    });
  };

  const handleSelectUser = (userRecord) => {
    setMode("edit");
    setError("");
    setStatusMessage("");
    setSelectedUserId(userRecord.id);
    setForm({
      email: userRecord.email,
      password: "",
      role: userRecord.role,
      is_active: userRecord.is_active,
      applications: buildApplicationState(apps, userRecord.applications),
    });
  };

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplicationChange = (appKey, level) => {
    setForm((prev) => ({
      ...prev,
      applications: {
        ...prev.applications,
        [appKey]: level,
      },
    }));
  };

  const validateForm = () => {
    if (!form.email.trim()) {
      setError("Email is required");
      return false;
    }
    if (mode === "create" && (!form.password || form.password.length < 8)) {
      setError("Password must be at least 8 characters for new users");
      return false;
    }
    if (mode === "edit" && form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    if (!validateForm()) return;

    setSaving(true);
    try {
      const normalizedApplications = buildApplicationState(apps, form.applications);
      if (mode === "create") {
        const email = form.email.trim().toLowerCase();
        if (sampleMode) {
          const created = {
            id: `sample-user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            email,
            role: form.role,
            is_active: form.is_active,
            applications: normalizedApplications,
          };
          const nextUsers = [...users, created].sort((a, b) => a.email.localeCompare(b.email));
          setUsers(nextUsers);
          handleSelectUser(created);
          setForm({
            email: created.email,
            password: "",
            role: created.role,
            is_active: created.is_active,
            applications: buildApplicationState(apps, created.applications),
          });
          setMode("edit");
          setStatusMessage(`Created user ${created.email} (sample)`);
          return;
        }

        const payload = {
          email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
          applications: toPayloadApplications(form.applications),
          __fullApplications: normalizedApplications,
        };
        const created = await createAdminUser({ token, tenant, payload });
        const nextUsers = [...users, created].sort((a, b) => a.email.localeCompare(b.email));
        setUsers(nextUsers);
        handleSelectUser(created);
        setForm({
          email: created.email,
          password: "",
          role: created.role,
          is_active: created.is_active,
          applications: buildApplicationState(apps, created.applications),
        });
        setMode("edit");
        setStatusMessage(`Created user ${created.email}`);
      } else if (mode === "edit" && selectedUser) {
        const payload = {
          role: form.role,
          is_active: form.is_active,
          applications: toPayloadApplications(form.applications),
          __fullApplications: normalizedApplications,
        };
        if (form.password) {
          payload.password = form.password;
        }

        if (sampleMode) {
          const updated = {
            ...selectedUser,
            role: form.role,
            is_active: form.is_active,
            applications: normalizedApplications,
          };
          const nextUsers = users
            .map((u) => (u.id === updated.id ? updated : u))
            .sort((a, b) => a.email.localeCompare(b.email));
          setUsers(nextUsers);
          setForm({
            email: updated.email,
            password: "",
            role: updated.role,
            is_active: updated.is_active,
            applications: buildApplicationState(apps, updated.applications),
          });
          setStatusMessage(`Updated user ${updated.email} (sample)`);
          return;
        }

        const updated = await updateAdminUser({ token, tenant, userId: selectedUser.id, payload });
        const nextUsers = users
          .map((u) => (u.id === updated.id ? updated : u))
          .sort((a, b) => a.email.localeCompare(b.email));
        setUsers(nextUsers);
        setForm({
          email: updated.email,
          password: "",
          role: updated.role,
          is_active: updated.is_active,
          applications: buildApplicationState(apps, updated.applications),
        });
        setStatusMessage(`Updated user ${updated.email}`);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  if (!token || !isAdmin) {
    return null;
  }

  return (
    <div className="master-admin">
      <PortalUtilityBar />
      <div className="master-admin__shell">
        <header className="master-admin__header">
          <div>
            <h1 className="sfdc-hero__title">Master Admin Console</h1>
            <p className="sfdc-hero__subtitle">
              Manage users, roles, and application access for the {user?.tenant || tenant} tenant.
            </p>
          </div>
          <div className="master-admin__actions">
            <button className="sfdc-button_neutral" onClick={() => navigate('/admin/coding-assignments')}>
              Coding assignments
            </button>
            <button className="sfdc-button_neutral" onClick={resetFormForCreate} disabled={saving}>
              + New User
            </button>
          </div>
        </header>

        {sampleMode && (
          <div className="master-admin__sample" role="status">
            <strong>Sandbox mode.</strong> User management is running on sample data while the API token is unavailable.
          </div>
        )}
        {statusMessage && <div className="master-admin__status">{statusMessage}</div>}
        {error && <div className="master-admin__error" role="alert">{error}</div>}

        {loading ? (
          <div className="master-admin__loading">Loading administrator data...</div>
        ) : (
          <div className="master-admin__grid">
            <section className="master-admin__users">
              <div className="master-admin__toolbar">
                <input
                  type="search"
                  placeholder="Search by email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="master-admin__count">{filteredUsers.length} users</div>
              </div>
              <div className="master-admin__table">
                <div className="master-admin__row master-admin__row--head">
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Applications</span>
                </div>
                {filteredUsers.map((record) => (
                  <button
                    type="button"
                    key={record.id}
                    className={`master-admin__row ${record.id === selectedUserId ? 'is-selected' : ''}`}
                    onClick={() => handleSelectUser(record)}
                  >
                    <span>{record.email}</span>
                    <span className={`badge badge--${record.role}`}>{record.role}</span>
                    <span className={`badge badge--${record.is_active ? 'active' : 'inactive'}`}>
                      {record.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="master-admin__apps">{summarizeApplications(apps, record.applications)}</span>
                  </button>
                ))}
                {!filteredUsers.length && (
                  <div className="master-admin__empty">No users match your search.</div>
                )}
              </div>
            </section>

            <section className="master-admin__form">
              <form onSubmit={handleSubmit}>
                <div className="master-admin__formHeader">
                  <h2>{mode === 'create' ? 'Create New User' : `Edit ${form.email}`}</h2>
                  {mode === 'edit' && (
                    <div className="master-admin__hint">Leave password blank to keep the existing password.</div>
                  )}
                </div>

                <label className="master-admin__field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    disabled={mode === 'edit'}
                    required
                  />
                </label>

                <label className="master-admin__field">
                  <span>Password {mode === 'edit' && <small>(optional)</small>}</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    placeholder={mode === 'edit' ? 'Leave blank to keep current password' : ''}
                    required={mode === 'create'}
                  />
                </label>

                <label className="master-admin__field">
                  <span>Global Role</span>
                  <select value={form.role} onChange={(e) => handleFieldChange('role', e.target.value)}>
                    <option value="user">Non admin user</option>
                    <option value="admin">Administration</option>
                  </select>
                </label>

                <label className="master-admin__checkbox">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => handleFieldChange('is_active', e.target.checked)}
                  />
                  <span>Active user</span>
                </label>

                <div className="master-admin__section">
                  <h3>Application Access</h3>
                  <p className="master-admin__hint">Assign each application as Administration or Non admin access. Select "No access" to remove visibility.</p>
                  <div className="master-admin__appsGrid">
                    {apps.map((app) => {
                      const value = form.applications?.[app.key] || (app.key === 'portal' ? 'user' : 'none');
                      const isAdminOnly = app.key === 'admin_console';
                      return (
                        <div key={app.key} className="master-admin__appCard">
                          <div className="master-admin__appTitle">{app.label}</div>
                          {app.description && <div className="master-admin__appDesc">{app.description}</div>}
                          <div className="master-admin__radioGroup">
                            {app.key === 'portal' ? (
                              <>
                                <label>
                                  <input
                                    type="radio"
                                    name={`app-${app.key}`}
                                    value="user"
                                    checked={value === 'user'}
                                    onChange={() => handleApplicationChange(app.key, 'user')}
                                  />
                                  Non admin user
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name={`app-${app.key}`}
                                    value="admin"
                                    checked={value === 'admin'}
                                    onChange={() => handleApplicationChange(app.key, 'admin')}
                                  />
                                  Administration
                                </label>
                                <div className="master-admin__hint master-admin__hint--inline">Portal access is required for all users.</div>
                              </>
                            ) : (
                              <>
                                <label>
                                  <input
                                    type="radio"
                                    name={`app-${app.key}`}
                                    value="none"
                                    checked={value === 'none'}
                                    onChange={() => handleApplicationChange(app.key, 'none')}
                                  />
                                  No access
                                </label>
                                {!isAdminOnly && (
                                  <label>
                                    <input
                                      type="radio"
                                      name={`app-${app.key}`}
                                      value="user"
                                      checked={value === 'user'}
                                      onChange={() => handleApplicationChange(app.key, 'user')}
                                    />
                                    Non admin user
                                  </label>
                                )}
                                <label>
                                  <input
                                    type="radio"
                                    name={`app-${app.key}`}
                                    value="admin"
                                    checked={value === 'admin'}
                                    onChange={() => handleApplicationChange(app.key, 'admin')}
                                  />
                                  Administration
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="master-admin__actionsRow">
                  <button type="submit" className="sfdc-button_brand" disabled={saving}>
                    {saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
                  </button>
                  {mode === 'edit' && (
                    <button
                      type="button"
                      className="sfdc-button_outline"
                      onClick={resetFormForCreate}
                      disabled={saving}
                    >
                      Create another user
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default MasterAdminPage;

