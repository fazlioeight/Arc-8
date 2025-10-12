import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { fetchProviderManagement, updateProviderManagement } from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';
import InfoTooltip from '../../components/ui/InfoTooltip';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

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
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const effectiveToken = token || 'sample-provider-management';
  const effectiveTenant = tenant || 'demo';

  const loadProviders = async (term = search) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchProviderManagement(effectiveToken, effectiveTenant, { search: term });
      setItems(response.items || []);
      recordAuditEvent?.('coding.provider_management.load', { search: term });
      recordViewPreference('coding-provider-management', { search: term });
    } catch (err) {
      setError(err.message || 'Unable to load providers');
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (provider) => {
    setEditingProvider(provider);
    setFormState({
      name: provider.name || '',
      email: provider.email || '',
      phone: provider.phone || '',
      tax_id: provider.tax_id || '',
      address_line1: provider.address_line1 || '',
      city: provider.city || '',
      state: provider.state || '',
      postal_code: provider.postal_code || '',
    });
    setSavingError(null);
    recordViewPreference('coding-provider-management', {
      search,
      lastEdited: provider.provider_id,
    });
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const saveProvider = async () => {
    if (!editingProvider) return;
    setSaving(true);
    setSavingError(null);
    try {
      await updateProviderManagement(effectiveToken, effectiveTenant, editingProvider.provider_id, formState);
      setEditingProvider(null);
      setFormState({});
      await loadProviders(search);
      recordAuditEvent?.('coding.provider_management.update', { providerId: editingProvider.provider_id });
      notify({
        title: 'Provider updated',
        description: 'Contact details were saved successfully.',
        variant: 'success',
      });
    } catch (err) {
      setSavingError(err.message || 'Unable to update provider');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    setShowSaveConfirm(true);
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    await saveProvider();
  };

  const cancelSaveConfirmation = () => {
    setShowSaveConfirm(false);
  };

  useEffect(() => {
    const saved = getViewPreference('coding-provider-management');
    const initialTerm = saved?.search ?? search;
    if (saved?.search && saved.search !== search) {
      setSearch(saved.search);
    }
    void loadProviders(initialTerm);
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant, getViewPreference]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coding-provider-management-refresh',
        label: 'Refresh provider management',
        category: 'Coding',
        action: () => { void loadProviders(); },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands]);

  const handleSubmit = (event) => {
    event.preventDefault();
    recordViewPreference('coding-provider-management', { search });
    void loadProviders(search);
  };

  const renderTrendBadge = (openChases) => {
    const config = openChases === 0
      ? {
        bg: 'success',
        label: 'Clear',
        info: 'No open chases remain for this provider.',
      }
      : openChases <= 3
        ? {
          bg: 'warning',
          label: 'Watch',
          info: 'A few chases remain. Plan outreach soon.',
        }
        : {
          bg: 'danger',
          label: 'Action',
          info: 'Immediate outreach recommended for outstanding chases.',
        };

    return (
      <InfoTooltip content={config.info} placement="top">
        <Badge bg={config.bg}>{config.label}</Badge>
      </InfoTooltip>
    );
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Provider management"
        subtitle="Review provider contact data and update outreach information."
      />

      <main className="container my-4">
        <Card className="ds-card ds-card--compact">
          <Card.Header className="d-flex flex-column flex-lg-row gap-3 justify-content-between align-items-lg-center">
            <div>
              <div className="d-flex align-items-center gap-2">
                <h2 className="h5 mb-0">Provider roster</h2>
                <InfoTooltip
                  content="Keep outreach information current so coding teams know who to contact for chart reviews."
                  placement="right"
                />
              </div>
              <div className="ds-card__meta mt-1">
                Filter providers by name, NPI, or location and update contact details without leaving the workspace.
              </div>
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  void loadProviders('');
                }}
                disabled={loading}
              >
                Clear filters
              </Button>
              <Button variant="outline-primary" size="sm" onClick={() => void loadProviders()} disabled={loading}>
                {loading ? <Spinner animation="border" size="sm" /> : 'Refresh list'}
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            <Form onSubmit={handleSubmit} className="mb-3">
              <Row className="g-2 align-items-end">
                <Col lg={8}>
                  <Form.Label htmlFor="provider-search">Search providers</Form.Label>
                  <Form.Control
                    id="provider-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, NPI, Tax ID, or city"
                  />
                  <Form.Text className="text-muted">
                    Tip: search by tax ID or city to narrow down outreach lists.
                  </Form.Text>
                </Col>
                <Col lg={4} className="d-flex gap-2 justify-content-lg-end mt-3 mt-lg-0">
                  <Button type="submit" variant="primary" disabled={loading} className="flex-grow-1 flex-lg-grow-0">
                    {loading ? <Spinner animation="border" size="sm" /> : 'Search roster'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    disabled={loading}
                    onClick={() => {
                      setSearch('');
                      void loadProviders('');
                    }}
                    className="flex-grow-1 flex-lg-grow-0"
                  >
                    Reset
                  </Button>
                </Col>
              </Row>
            </Form>

            {error && <Alert variant="danger">{error}</Alert>}

            <div className="table-responsive">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>
                      <div className="d-inline-flex align-items-center gap-1">
                        Members
                        <InfoTooltip content="Active attributed members assigned to this provider." placement="top" />
                      </div>
                    </th>
                    <th>
                      <div className="d-inline-flex align-items-center gap-1">
                        Open gaps
                        <InfoTooltip content="Outstanding coding chases tied to this provider." placement="top" />
                      </div>
                    </th>
                    <th>Last updated</th>
                    <th className="text-end">
                      <span className="me-2">Actions</span>
                      <InfoTooltip content="Edit provider outreach details." placement="top" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={7} className="text-center py-4">
                        <Spinner animation="border" />
                      </td>
                    </tr>
                  )}
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon="spark"
                          title="No providers match your filters"
                          description="Try adjusting your search or sync a new provider roster."
                        >
                          <Button variant="outline-primary" size="sm" onClick={() => void loadProviders('')} disabled={loading}>
                            Clear filters
                          </Button>
                          <Button variant="link" size="sm" href="/jobs/import-data">
                            Open data imports
                          </Button>
                        </EmptyState>
                      </td>
                    </tr>
                  )}
                  {!loading && items.map((item) => (
                    <tr key={item.provider_id}>
                      <td>
                        <div className="fw-semibold">{item.name || 'Unnamed provider'}</div>
                        <div className="text-muted small">
                          NPI {item.npi || 'N/A'} | Tax {item.tax_id || 'N/A'}
                        </div>
                      </td>
                      <td>
                        <div>{item.email || <span className="text-muted">No email on file</span>}</div>
                        <div className="text-muted small">{item.phone || 'No phone listed'}</div>
                      </td>
                      <td>
                        <div>{item.address_line1 || <span className="text-muted">Address unknown</span>}</div>
                        <div className="text-muted small">
                          {[item.city, item.state, item.postal_code].filter(Boolean).join(', ') || 'Not set'}
                        </div>
                      </td>
                      <td>{item.member_count ?? 0}</td>
                      <td>
                        <div className="d-flex gap-2 align-items-center">
                          {item.open_chases ?? 0}
                          {renderTrendBadge(item.open_chases ?? 0)}
                        </div>
                      </td>
                      <td>{item.last_updated_at ? new Date(item.last_updated_at).toLocaleString() : 'Not captured'}</td>
                      <td className="text-end">
                        <InfoTooltip content="Update provider contact details" placement="left">
                          <Button variant="link" size="sm" onClick={() => openEditor(item)}>
                            Edit
                          </Button>
                        </InfoTooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </main>

      <Modal show={Boolean(editingProvider)} onHide={() => setEditingProvider(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit provider contact</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {savingError && <Alert variant="danger">{savingError}</Alert>}
          <p className="text-muted small mb-3">
            Updates save instantly so coding teams always have the latest outreach details.
          </p>
          <Form>
            <Form.Group className="mb-3" controlId="provider-name">
              <Form.Label>Name</Form.Label>
              <Form.Control name="name" value={formState.name || ''} onChange={handleFormChange} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="provider-email">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" name="email" value={formState.email || ''} onChange={handleFormChange} />
              <Form.Text className="text-muted small">Use a monitored inbox so outreach replies are not missed.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="provider-phone">
              <Form.Label>Phone</Form.Label>
              <Form.Control name="phone" value={formState.phone || ''} onChange={handleFormChange} />
              <Form.Text className="text-muted small">Include an extension if callers should route through a desk.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="provider-tax">
              <Form.Label>Tax ID</Form.Label>
              <Form.Control name="tax_id" value={formState.tax_id || ''} onChange={handleFormChange} />
              <Form.Text className="text-muted small">Used when matching claims and roster updates.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="provider-address">
              <Form.Label>Address</Form.Label>
              <Form.Control name="address_line1" value={formState.address_line1 || ''} onChange={handleFormChange} />
            </Form.Group>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group controlId="provider-city">
                  <Form.Label>City</Form.Label>
                  <Form.Control name="city" value={formState.city || ''} onChange={handleFormChange} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group controlId="provider-state">
                  <Form.Label>State</Form.Label>
                  <Form.Control name="state" value={formState.state || ''} onChange={handleFormChange} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group controlId="provider-postal">
                  <Form.Label>Postal</Form.Label>
                  <Form.Control name="postal_code" value={formState.postal_code || ''} onChange={handleFormChange} />
                </Form.Group>
              </Col>
            </Row>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setEditingProvider(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner animation="border" size="sm" /> : 'Save & Close'}
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog
        show={showSaveConfirm}
        title="Save provider changes?"
        description="We will update this provider's contact details immediately."
        confirmLabel={saving ? 'Saving…' : 'Save changes'}
        confirmVariant="primary"
        confirmDisabled={saving}
        onConfirm={() => { void confirmSave(); }}
        onCancel={cancelSaveConfirmation}
      />
    </div>
  );
};

export default CodingProviderManagementPage;
