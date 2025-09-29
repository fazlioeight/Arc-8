import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, ListGroup, Row, Spinner, Table } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { AuthContext } from '../../context/AuthContext';
import {
  fetchCodingProviderDetail,
  fetchCodingProviders,
} from '../../services/codingService';

const CodingProvidersPage = () => {
  const navigate = useNavigate();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const loadProviders = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingProviders(token, tenant, { search });
      setProviders(response.items || []);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err.message || 'Unable to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadProviders();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  const selectProvider = async providerId => {
    if (!canQuery) return;
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await fetchCodingProviderDetail(token, tenant, providerId);
      setSelectedProvider(detail);
    } catch (err) {
      setError(err.message || 'Unable to load provider detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    void loadProviders();
  };

  if (!isAuthenticated) {
    return (
      <div className="sfdc-portal coding-portal">
        <PortalUtilityBar />
        <PortalHero
          align="left"
          title="Coding provider directory"
          subtitle="Search contracted providers and review locations or contact details."
          actions={(
            <div className="d-flex flex-wrap gap-2">
              <Button variant="outline-light" onClick={() => navigate('/coding')}>
                Landing
              </Button>
              <Button variant="outline-light" onClick={() => navigate('/coding/members')}>
                Members
              </Button>
              <Button variant="light" disabled>
                Providers
              </Button>
            </div>
          )}
          wave={false}
        />
        <div className="coding-content container py-5">
          <Alert variant="warning">You must be logged in to view provider information.</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <PortalHero
        align="left"
        title="Coding provider directory"
        subtitle="Search contracted providers and review locations or contact details."
        actions={(
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-light" onClick={() => navigate('/coding')}>
              Landing
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/coding/members')}>
              Members
            </Button>
            <Button variant="light" disabled>
              Providers
            </Button>
          </div>
        )}
        wave={false}
      />
      <div className="coding-content container py-4">
        <Form onSubmit={handleSubmit} className="mb-3">
          <Row className="g-2 align-items-end">
            <Col md={6}>
              <Form.Label htmlFor="provider-search">Search providers</Form.Label>
              <Form.Control
                id="provider-search"
                placeholder="Name, NPI, or Tax ID"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </Col>
            <Col md={2} className="d-grid">
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner size="sm" animation="border" /> : 'Search'}
              </Button>
            </Col>
            <Col md={2} className="d-grid">
              <Button variant="outline-secondary" onClick={() => void loadProviders()} disabled={loading}>
                Refresh
              </Button>
            </Col>
            <Col md={2} className="d-grid">
              <Button variant="outline-secondary" onClick={() => setSelectedProvider(null)}>
                Clear selection
              </Button>
            </Col>
          </Row>
        </Form>
        {error && <Alert variant="danger">{error}</Alert>}
        <Row className="g-4">
          <Col md={7}>
            <Card>
              <Card.Header>
                Providers <span className="text-muted">({total})</span>
              </Card.Header>
              <Card.Body className="p-0">
                <Table hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>NPI</th>
                      <th>Tax ID</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && providers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-3">
                          No providers found.
                        </td>
                      </tr>
                    )}
                    {providers.map(provider => (
                      <tr
                        key={provider.id}
                        onClick={() => void selectProvider(provider.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{provider.name}</td>
                        <td>{provider.npi || '-'}</td>
                        <td>{provider.tax_id || '-'}</td>
                        <td className="text-end">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={event => {
                              event.stopPropagation();
                              navigate(`/coding/providers/${provider.id}`);
                            }}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
          <Col md={5}>
            <Card>
              <Card.Header>Provider details</Card.Header>
              <Card.Body>
                {detailLoading && (
                  <div className="text-center">
                    <Spinner animation="border" />
                  </div>
                )}
                {!detailLoading && !selectedProvider && (
                  <div className="text-muted">Select a provider to view contact information.</div>
                )}
                {!detailLoading && selectedProvider && (
                  <ListGroup variant="flush">
                    <ListGroup.Item><strong>Name:</strong> {selectedProvider.name}</ListGroup.Item>
                    <ListGroup.Item><strong>NPI:</strong> {selectedProvider.npi || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Tax ID:</strong> {selectedProvider.tax_id || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Phone:</strong> {selectedProvider.phone || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Email:</strong> {selectedProvider.email || '-'}</ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Location:</strong>
                      <div>
                        {selectedProvider.location
                          ? [
                              selectedProvider.location.address_line1,
                              selectedProvider.location.city,
                              selectedProvider.location.state,
                              selectedProvider.location.postal_code,
                            ]
                              .filter(Boolean)
                              .join(', ')
                          : '-'}
                      </div>
                    </ListGroup.Item>
                    <ListGroup.Item className="d-flex justify-content-end">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => navigate(`/coding/providers/${selectedProvider.id}`)}
                      >
                        Open full page
                      </Button>
                    </ListGroup.Item>
                  </ListGroup>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default CodingProvidersPage;
