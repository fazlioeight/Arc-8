import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { SAMPLE_CODING_MEMBERS } from '../../utils/sampleData';
import { fetchCodingMembers } from '../../services/codingService';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

const LOB_OPTIONS = ['Commercial', 'Medicare Advantage', 'DSNP', 'Exchange'];

const CodingMembersPage = () => {
  const { registerCommands } = useCommandPalette();
  const navigate = useNavigate();
  const { token, tenant, isAuthenticated, recordAuditEvent } = useContext(AuthContext) || {};

  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [lobFilter, setLobFilter] = useState('');

  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const loadSampleMembers = useCallback(() => {
    setMembers(SAMPLE_CODING_MEMBERS);
    setTotal(SAMPLE_CODING_MEMBERS.length);
    setError(null);
    setLoading(false);
    recordAuditEvent?.('coding.load_sample_members');
  }, [recordAuditEvent]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadMembers();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coding-members-load-sample',
        label: 'Load sample coding members',
        category: 'Coding',
        action: loadSampleMembers,
      },
      {
        id: 'coding-members-clear-filters',
        label: 'Clear member filters',
        category: 'Coding',
        action: () => {
          setStatusFilter('active');
          setLobFilter('');
          setSearchValue('');
        },
      },
    ]);
    return () => registerCommands([]);
  }, [registerCommands, loadSampleMembers]);

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
    // Also include referral info as query params so the provider detail
    // page can display a referral alert even when location.state isn't
    // preserved in some test environments.
    const search = `?fromMemberId=${encodeURIComponent(member.id)}${member.pcp_name ? `&providerName=${encodeURIComponent(member.pcp_name)}` : ''}`;
    navigate(`/coding/providers/${encodeURIComponent(providerKey)}${search}`, {
      state: {
        fromMemberId: member.id,
        providerName: member.pcp_name,
        providerNpi: member.pcp_npi,
      },
    });
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <PortalHero
        align="left"
        title="Coding member worklists"
        subtitle="Search, filter, and open members assigned to your coding teams."
        actions={(
          <div className="d-flex flex-wrap gap-2">
            <Button variant="light" onClick={() => navigate('/coding')}>
              Landing
            </Button>
            <Button variant="outline-light" disabled>
              Members
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/coding/providers')}>
              Providers
            </Button>
          </div>
        )}
        wave={false}
      />
      {!isAuthenticated ? (
        <div className="coding-content container py-5">
          <Alert variant="warning">You must be logged in to view coding members.</Alert>
        </div>
      ) : (
        <div className="coding-content container py-4">
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
                  <div className="coding-empty">
                    <p>No members match your filters.</p>
                    <Button variant="outline-primary" size="sm" onClick={loadSampleMembers}>
                      Load sandbox sample members
                    </Button>
                  </div>
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
      )}
    </div>
  );
};

export default CodingMembersPage;


