import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
} from 'react-bootstrap';

import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import { AuthContext } from '../../../context/AuthContext';
import { useCommandPalette } from '../../../context/CommandPaletteContext';
import { useNotifications } from '../../../context/NotificationsContext';
import { useUserPreferences } from '../../../context/UserPreferencesContext';
import { fetchProviderManagement, updateProviderManagement } from '../../../services/codingService';
import InfoTooltip from '../../../components/ui/InfoTooltip';
import EmptyState from '../../../components/ui/EmptyState';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import AlertShell from '../../../components/ui/AlertShell';
import '../coding/member/memberWorkspace.css';
import { CODING_NAV_ITEMS } from './codingNavItems';

const CODING_PROVIDER_MGMT_COMMAND_SCOPE = 'coding-provider-management-commands';

const CodingProviderManagementPage = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();
  const { notify } = useNotifications();
  const { getViewPreference, recordViewPreference } = useUserPreferences();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editingProvider, setEditingProvider] = useState(null);
  const [formState, setFormState] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);

  const searchRef = useRef(null);

  const loadManagement = async (term = search) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchProviderManagement(token || 'sample-provider-mgmt', tenant || 'prominencehealth', { search: term });
      setItems(response.items || []);
      recordViewPreference('coding-provider-management', { search: term });
      recordAuditEvent?.('coding.provider_management.load', { search: term });
    } catch (err) {
      setError(err.message || 'Unable to load provider management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = getViewPreference('coding-provider-management');
    const initialSearch = saved?.search || '';
    setSearch(initialSearch);
    void loadManagement(initialSearch);
  }, [getViewPreference]);

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: 'coding-provider-mgmt-refresh',
        label: 'Refresh provider management',
        category: 'Coding',
        action: () => void loadManagement(),
      },
    ], { id: CODING_PROVIDER_MGMT_COMMAND_SCOPE });
    return unregister;
  }, [registerCommands]);

  const handleSubmit = (event) => {
    event.preventDefault();
    recordViewPreference('coding-provider-management', { search });
    void loadManagement(search);
  };

  const handleEdit = (provider) => {
    setEditingProvider(provider);
    setFormState({
      payer_contract: provider.payer_contract,
      enable_education: provider.enable_education,
      notes: provider.notes,
    });
  };

  const handleSave = async () => {
    if (!editingProvider) return;
    setLoading(true);
    try {
      await updateProviderManagement(token || 'sample-provider-mgmt', tenant || 'prominencehealth', editingProvider.id, formState);
      notify({ title: 'Provider updated', tone: 'success' });
      setShowConfirm(false);
      setEditingProvider(null);
      void loadManagement(search);
    } catch (err) {
      notify({ title: 'Unable to update provider', description: err.message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        '',
      maxWidthClassName: 'max-w-6xl',
      paddingClassName: 'px-4',
      navItems: CODING_NAV_ITEMS,
      currentNav: 'providers',
      utilityBar: true,
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Provider management"
      subtitle="Manage contracting, education flags, and notes for coding partners."
      actions={
        <PortalStat label="Providers" value={items.length} meta="Matching" tone="info" />
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Search & filters"
        subtitle="Search by provider name, NPI, or tax ID."
        actions={
          <button className="portal-ghost-button" onClick={() => void loadManagement(search)} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      >
        <Form onSubmit={handleSubmit} className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="provider-mgmt-search">
              Search providers
            </label>
            <Form.Control
              id="provider-mgmt-search"
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, NPI, or tax ID"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
            </Button>
          </div>
        </Form>
        {error && <AlertShell tone="danger" title="Unable to load provider management" description={error} className="mt-3" />}
      </PortalCard>

      <PortalCard title="Providers" subtitle="Edit contracting and education flags." actions={<span className="portal-pill portal-pill--ghost">{items.length} result(s)</span>}>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Contract</th>
                <th>Education</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center py-3">
                    <Spinner animation="border" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-3">
                    <EmptyState title="No providers match your search" description="Adjust filters or refresh." />
                  </td>
                </tr>
              )}
              {items.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    <div className="fw-semibold">{provider.name}</div>
                    <div className="text-muted small">NPI {provider.npi}</div>
                  </td>
                  <td>{provider.payer_contract ? 'Yes' : 'No'}</td>
                  <td>{provider.enable_education ? 'Enabled' : 'Disabled'}</td>
                  <td className="text-muted small">{provider.notes || 'None'}</td>
                  <td className="text-end">
                    <Button size="sm" variant="link" onClick={() => handleEdit(provider)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <ConfirmDialog
        show={showConfirm}
        onHide={() => setShowConfirm(false)}
        onConfirm={handleSave}
        title="Save provider changes"
        confirmText={loading ? 'Saving...' : 'Save changes'}
      >
        Apply these changes to {editingProvider?.name}?
      </ConfirmDialog>

      <Modal show={Boolean(editingProvider)} onHide={() => setEditingProvider(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit provider</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form className="space-y-3">
            <Form.Group controlId="payer_contract">
              <Form.Check
                type="switch"
                label="Payer contract"
                checked={!!formState.payer_contract}
                onChange={(event) => setFormState((prev) => ({ ...prev, payer_contract: event.target.checked }))}
              />
            </Form.Group>
            <Form.Group controlId="enable_education">
              <Form.Check
                type="switch"
                label="Enable education"
                checked={!!formState.enable_education}
                onChange={(event) => setFormState((prev) => ({ ...prev, enable_education: event.target.checked }))}
              />
            </Form.Group>
            <Form.Group controlId="notes">
              <Form.Label>
                Notes <InfoTooltip id="provider-notes" text="Internal notes for this provider." />
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formState.notes || ''}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <Button variant="outline-secondary" onClick={() => setEditingProvider(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setShowConfirm(true)} disabled={loading}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </PortalPageLayout>
  );
};

export default CodingProviderManagementPage;
