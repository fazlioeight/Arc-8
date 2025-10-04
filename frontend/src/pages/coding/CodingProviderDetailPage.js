import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, ListGroup, Row, Spinner } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { fetchCodingProviderDetail, fetchCodingProviders } from '../../services/codingService';

const CodingProviderDetailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Obtain route params via the hook (rules-of-hooks require calling hooks
  // unconditionally at the top level). Fall back to extracting the id from
  // the pathname when params are not present (e.g., some test shims).
  let params = {};
  try {
    // some test environments may replace react-router-dom with a mock
    // that doesn't provide hooks. Guard the call so tests don't crash.
    params = useParams();
  } catch (err) {
    params = {};
  }
  let providerId = params?.providerId;
  if (!providerId) {
    const pieces = (location?.pathname || '').split('/').filter(Boolean);
    providerId = pieces[pieces.length - 1];
  }
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};

  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canQuery = useMemo(() => Boolean(token && tenant && providerId), [token, tenant, providerId]);
  // location.state is preferred, but some test/navigation setups don't
  // populate it. Fall back to query params so the referral alert is
  // displayed in tests that navigate using URL only.
  const referralFromState = location.state;
  const query = new URLSearchParams(location.search);
  const referral = referralFromState || (
    query.has('fromMemberId') ? {
      fromMemberId: Number(query.get('fromMemberId')),
      providerName: query.get('providerName') || undefined,
      providerNpi: query.get('providerNpi') || undefined,
    } : undefined
  );

  const loadProvider = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const decodedKey = decodeURIComponent(providerId);
      let lookupId = decodedKey;
      if (!/^\d+$/.test(decodedKey)) {
        const response = await fetchCodingProviders(token, tenant, { search: decodedKey });
        const items = response.items || [];
        if (items.length === 0) {
          throw new Error('Provider not found');
        }
        const normalizedKey = decodedKey.toLowerCase();
        const best = items.find(item => {
          const npiMatch = item.npi && item.npi.toLowerCase() === normalizedKey;
          const nameMatch = item.name && item.name.toLowerCase() === normalizedKey;
          return npiMatch || nameMatch;
        }) || items[0];
        lookupId = best.id;
      }
      const detail = await fetchCodingProviderDetail(token, tenant, lookupId);
      setProvider(detail);
    } catch (err) {
      setError(err.message || 'Unable to load provider');
      setProvider(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadProvider();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  if (!isAuthenticated) {
    return (
      <div className="sfdc-portal coding-portal">
        <PortalUtilityBar />
        <div className="coding-content container py-5">
          <Alert variant="warning">You must be logged in to view provider information.</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <div className="coding-content container py-4">
        <Row className="align-items-center mb-3 g-3">
          <Col>
            <h1 className="h3 mb-1">Provider Details</h1>
            <div className="text-muted">
              Full profile for coding partners and medical groups.
            </div>
          </Col>
          <Col md="auto">
            <div className="d-flex flex-wrap gap-2">
              <Button variant="outline-secondary" onClick={() => navigate('/coding')}>
                Landing
              </Button>
              <Button variant="outline-primary" onClick={() => navigate('/coding/members')}>
                Members
              </Button>
              <Button variant="primary" disabled>
                Providers
              </Button>
            </div>
          </Col>
        </Row>
        <div className="d-flex gap-2 mb-3">
          <Button variant="link" onClick={() => navigate(-1)}>&larr; Back</Button>
          <Button variant="outline-primary" size="sm" onClick={() => navigate('/coding/providers')}>
            Browse providers
          </Button>
        </div>
        {referral?.fromMemberId && (
          <Alert variant="info" className="mb-3">
            Linked from member #{referral.fromMemberId}
            {referral.providerName ? ` (${referral.providerName})` : ''}
          </Alert>
        )}
        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}
        {loading && (
          <div className="text-center py-5">
            <Spinner animation="border" />
          </div>
        )}
        {!loading && provider && (
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div>
                <div className="h5 mb-0">{provider.name}</div>
                {provider.npi && <div className="text-muted">NPI {provider.npi}</div>}
              </div>
              <Badge bg="primary">Provider #{provider.id}</Badge>
            </Card.Header>
            <Card.Body>
              <Row className="g-4">
                <Col md={6}>
                  <ListGroup variant="flush">
                    <ListGroup.Item><strong>Tax ID:</strong> {provider.tax_id || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Phone:</strong> {provider.phone || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Email:</strong> {provider.email || '-'}</ListGroup.Item>
                  </ListGroup>
                </Col>
                <Col md={6}>
                  <ListGroup variant="flush">
                    <ListGroup.Item>
                      <strong>Location:</strong>
                      <div>
                        {provider.location
                          ? [
                              provider.location.address_line1,
                              provider.location.city,
                              provider.location.state,
                              provider.location.postal_code,
                            ]
                              .filter(Boolean)
                              .join(', ')
                          : '-'}
                      </div>
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Contacts:</strong>
                      <div className="text-muted">Coming soon</div>
                    </ListGroup.Item>
                  </ListGroup>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        )}
        {!loading && !provider && !error && (
          <Alert variant="warning">Provider details are unavailable.</Alert>
        )}
      </div>
    </div>
  );
};

export default CodingProviderDetailPage;
