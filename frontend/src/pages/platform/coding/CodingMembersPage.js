import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Col, Form, Row, Spinner } from 'react-bootstrap';

import PortalUtilityBar from '../../../components/PortalUtilityBar';
import { AuthContext } from '../../../context/AuthContext';
import { useCommandPalette } from '../../../context/CommandPaletteContext';
import { fetchCodingMembers, fetchPrioritizedMembers } from '../../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';
import SurfaceCard from '../../../components/ui/SurfaceCard';
import DataTable from '../../../components/ui/DataTable';
import Pill from '../../../components/ui/Pill';
import AlertShell from '../../../components/ui/AlertShell';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

const LOB_OPTIONS = ['Commercial', 'Medicare Advantage', 'DSNP', 'Exchange'];

const CODING_MEMBERS_COMMAND_SCOPE = 'coding-members-commands';
const statusToneMap = {
  closed: 'muted',
  in_review: 'warning',
  active: 'success',
};

const CodingMembersPage = () => {
  const { registerCommands } = useCommandPalette();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, isAuthenticated, recordAuditEvent } = useContext(AuthContext) || {};

  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [priorityQueue, setPriorityQueue] = useState([]);
  const [priorityLoading, setPriorityLoading] = useState(false);

  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [lobFilter, setLobFilter] = useState('');

  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const loadSampleMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMembers('sample-command', tenant || 'prominencehealth', {
        search: searchValue,
        status: statusFilter ? [statusFilter] : [],
        lob: lobFilter ? [lobFilter] : [],
        page: 1,
      });
      setMembers(response.items || []);
      setTotal(response.total || 0);
      recordAuditEvent?.('coding.load_sample_members');
    } catch (err) {
      setError(err.message || 'Unable to load sample members');
    } finally {
      setLoading(false);
    }
  }, [tenant, searchValue, statusFilter, lobFilter, recordAuditEvent]);

  const loadPrioritizedMembers = useCallback(async () => {
    if (!canQuery) return;
    try {
      setPriorityLoading(true);
      const response = await fetchPrioritizedMembers(token, tenant, { limit: 10 });
      setPriorityQueue(response?.items || []);
    } catch (err) {
      // silently ignore priority fetch errors for now
    } finally {
      setPriorityLoading(false);
    }
  }, [canQuery, tenant, token]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadMembers();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadPrioritizedMembers();
  }, [isAuthenticated, canQuery, loadPrioritizedMembers]);

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: 'coding-members-load-sample',
        label: 'Load sample coding members',
        category: 'Coding',
        action: () => { void loadSampleMembers(); },
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
    ], { id: CODING_MEMBERS_COMMAND_SCOPE });
    return unregister;
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
        from: `${location.pathname}${location.search}`,
        breadcrumb: member.pcp_name || member.pcp_npi,
        fromMemberId: member.id,
        providerName: member.pcp_name,
        providerNpi: member.pcp_npi,
      },
    });
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Coding member worklists"
        subtitle="Search, filter, and open members assigned to your coding teams."
      />
      {!isAuthenticated ? (
        <div className="coding-content container py-5">
          <AlertShell
            tone="warning"
            title="Authentication required"
            description="You must be logged in to view coding members."
          />
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
        {error && (
          <AlertShell
            tone="danger"
            title="Unable to load members"
            description={error}
            className="mb-3"
          />
        )}
        <SurfaceCard
          title="Top priority members"
          subtitle="Members most likely to impact RAF if actioned soon."
          padding="compact"
          className="mb-4"
        >
          <DataTable density="compact" aria-label="Top priority members">
            <thead>
              <tr>
                <th>Member</th>
                <th>Tier</th>
                <th>Score</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {priorityLoading && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-3">Loading priorities...</td>
                </tr>
              )}
              {!priorityLoading && priorityQueue.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-3">No prioritized members yet.</td>
                </tr>
              )}
              {priorityQueue.map(item => (
                <tr
                  key={item.member_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/coding/member/${item.member_id}`, {
                    state: {
                      from: `${location.pathname}${location.search}`,
                      breadcrumb: item.member_key,
                    },
                  })}
                >
                  <td>{item.member_key}</td>
                  <td>{item.priority_tier}</td>
                  <td>{item.priority_score.toFixed ? item.priority_score.toFixed(1) : item.priority_score}</td>
                  <td>{item.next_action || '-'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SurfaceCard>
        <SurfaceCard
          title="Member worklist"
          subtitle="Search, filter, and open members assigned to your coding teams."
          actions={[
            <span key="count" className="ds-card__meta">{total} member(s) found</span>,
            <Button key="refresh" variant="outline-secondary" size="sm" onClick={() => void loadMembers()} disabled={loading}>
              Refresh
            </Button>,
          ]}
        >
          <DataTable aria-label="Coding members">
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
                    <Pill
                      tone={statusToneMap[member.status] || 'info'}
                      size="sm"
                    >
                      {member.status || 'unknown'}
                    </Pill>
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
                    <Button
                      variant="link"
                      onClick={() => navigate(`/coding/member/${member.id}`, {
                        state: {
                          from: `${location.pathname}${location.search}`,
                          breadcrumb: [member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key,
                        },
                      })}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SurfaceCard>
        </div>
      )}
    </div>
  );
};

export default CodingMembersPage;


