import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { fetchCodingMembers } from '../../services/codingService';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

const LOB_OPTIONS = ['Commercial', 'Medicare Advantage', 'DSNP', 'Exchange'];

const CodingMembersPage = () => {
  const navigate = useNavigate();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};

  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [lobFilter, setLobFilter] = useState('');

  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadMembers();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  const loadMembers = async (overrides = {}) => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMembers(token, tenant, {
        search: overrides.search ?? searchValue,
        status: overrides.status ?? (statusFilter ? [statusFilter] : []),
        lob: overrides.lob ?? (lobFilter ? [lobFilter] : []),
        page: 1,
      });
      setMembers(response.items || []);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err.message || 'Unable to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    void loadMembers({ search: searchValue });
  };

  const handleOpenProvider = member => {
    const providerKey = member.pcp_npi || member.pcp_name;
    if (!providerKey) return;
    navigate(`/coding/providers/${encodeURIComponent(providerKey)}`, {
      state: {
        fromMemberId: member.id,
        providerName: member.pcp_name,
        providerNpi: member.pcp_npi,
      },
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="sfdc-portal coding-portal">
        <PortalUtilityBar />
        <div className="coding-content container py-5">
          <Alert variant="warning">You must be logged in to view coding members.</Alert>
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
            <h1 className="h3 mb-0">Coding Member Worklists</h1>
            <p className="text-muted mb-0">Search, filter, and open members assigned to your coding teams.</p>
          </Col>
          <Col md="auto">
            <div className="d-flex flex-wrap gap-2">
              <Button variant="outline-secondary" onClick={() => navigate('/coding')}>
                Landing
              </Button>
              <Button variant="primary" disabled>
                Members
              </Button>
              <Button variant="outline-primary" onClick={() => navigate('/coding/providers')}>
                Providers
              </Button>
            </div>
          </Col>
        </Row>
        <Form onSubmit={handleSubmit} className="mb-3">
          <Row className="g-2 align-items-end">
            <Col md={5}>
              <Form.Label htmlFor="coding-member-search">Member search</Form.Label>
              <Form.Control
                id="coding-member-search"
                placeholder="Name, member key, or PCP"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
              />
            </Col>
            <Col md={3}>
              <Form.Label>Status</Form.Label>
              <Form.Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Label>Line of business</Form.Label>
              <Form.Select value={lobFilter} onChange={e => setLobFilter(e.target.value)}>
                <option value="">All LOBs</option>
                {LOB_OPTIONS.map(lob => (
                  <option key={lob} value={lob}>
                    {lob}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={1} className="d-grid">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
              </Button>
            </Col>
          </Row>
        </Form>
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="text-muted">{total} member(s) found</div>
          <Button variant="outline-secondary" size="sm" onClick={() => void loadMembers()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <Table striped hover responsive>
          <thead>
            <tr>
              <th>Member</th>
              <th>Member Key</th>
              <th>Status</th>
              <th>Line of Business</th>
              <th>Provider</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  No members match your filters.
                </td>
              </tr>
            )}
            {members.map(member => (
              <tr key={member.id}>
                <td>{[member.first_name, member.last_name].filter(Boolean).join(' ') || '-'}</td>
                <td>{member.member_key}</td>
                <td>
                  <Badge bg={member.status === 'closed' ? 'secondary' : member.status === 'in_review' ? 'warning' : 'success'}>
                    {member.status}
                  </Badge>
                </td>
                <td>{member.line_of_business || '-'}</td>
                <td>
                  {member.pcp_name || member.pcp_npi ? (
                    <div className="d-flex flex-column">
                      <Button
                        variant="link"
                        className="p-0 text-start"
                        onClick={() => handleOpenProvider(member)}
                      >
                        {member.pcp_name || member.pcp_npi}
                      </Button>
                      {member.pcp_npi && member.pcp_name && (
                        <span className="small text-muted">NPI {member.pcp_npi}</span>
                      )}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="text-end">
                  <Button variant="link" onClick={() => navigate(`/coding/members/${member.id}`)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default CodingMembersPage;
