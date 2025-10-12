import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { fetchCoderPlatformWorklist } from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_VARIANTS = {
  open: 'primary',
  in_review: 'warning',
  closed: 'secondary',
};

const PRIORITY_VARIANTS = {
  high: 'danger',
  medium: 'warning',
  low: 'secondary',
};

const CodingCoderPlatformPage = () => {
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();
  const { token, tenant, user, recordAuditEvent } = useContext(AuthContext) || {};

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assigned: user?.email || '',
    search: '',
  });
  const [worklist, setWorklist] = useState([]);
  const [summary, setSummary] = useState({ status_counts: {}, priority_counts: {}, due_soon: 0, overdue: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-coder-platform';
  const effectiveTenant = tenant || 'demo';

  const statusCounts = useMemo(() => summary.status_counts || {}, [summary]);
  const priorityCounts = useMemo(() => summary.priority_counts || {}, [summary]);
  const openTotal = useMemo(
    () => (statusCounts.open || 0) + (statusCounts.in_review || 0),
    [statusCounts],
  );

  const metrics = useMemo(() => ([
    { label: 'Open queue', value: openTotal, hint: 'Open or in review records' },
    { label: 'Due in 7 days', value: summary.due_soon || 0, hint: 'Due within the next week' },
    { label: 'Overdue', value: summary.overdue || 0, hint: 'Past due date' },
    { label: 'Total matches', value: total, hint: 'Records matching filters' },
  ]), [openTotal, summary, total]);

  const loadWorklist = async (overrides = {}) => {
    setLoading(true);
    setError(null);
    const nextFilters = { ...filters, ...overrides };
    try {
      const response = await fetchCoderPlatformWorklist(effectiveToken, effectiveTenant, {
        status: nextFilters.status ? [nextFilters.status] : [],
        priority: nextFilters.priority ? [nextFilters.priority] : [],
        assigned: nextFilters.assigned?.trim() || undefined,
        search: nextFilters.search?.trim() || undefined,
        page: 1,
        pageSize: 50,
      });
      setWorklist(response.items || []);
      setSummary(response.summary || { status_counts: {}, priority_counts: {}, due_soon: 0, overdue: 0 });
      setTotal(response.total || 0);
      recordAuditEvent?.('coding.platform.load', { filters: nextFilters });
    } catch (err) {
      setError(err.message || 'Unable to load coder platform queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorklist();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coder-platform-refresh',
        label: 'Refresh coder platform',
        category: 'Coding',
        action: () => { void loadWorklist(); },
      },
      {
        id: 'coder-platform-clear-filters',
        label: 'Clear coder platform filters',
        category: 'Coding',
        action: () => {
          const reset = { status: '', priority: '', assigned: user?.email || '', search: '' };
          setFilters(reset);
          void loadWorklist(reset);
        },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands, user?.email]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadWorklist();
  };

  const renderStatusBadge = (status) => {
    if (!status) return '-';
    const variant = STATUS_VARIANTS[status] || 'secondary';
    return <Badge bg={variant}>{status}</Badge>;
  };

  const renderPriorityBadge = (priority) => {
    if (!priority) return '-';
    const variant = PRIORITY_VARIANTS[priority] || 'secondary';
    return <Badge bg={variant}>{priority}</Badge>;
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Coder platform"
        subtitle="Review, triage, and assign member coding tasks in one workspace."
      />

      <main className="container my-4">
        <Row className="gy-3">
          {metrics.map((metric) => (
            <Col md={3} sm={6} xs={12} key={metric.label}>
              <Card className="h-100 shadow-sm">
                <Card.Body>
                  <div className="text-muted small">{metric.label}</div>
                  <div className="display-6 fw-semibold">{metric.value}</div>
                  <div className="small text-muted">{metric.hint}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        <Card className="mt-4 shadow-sm">
          <Card.Header>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center">
              <div>
                <h2 className="h5 mb-1">Worklist</h2>
                <div className="text-muted">
                  Filter by status, priority, or assignee. Showing up to 50 items.
                </div>
              </div>
              <div className="mt-2 mt-md-0">
                <Button variant="outline-primary" size="sm" onClick={() => void loadWorklist()} disabled={loading}>
                  {loading ? <Spinner animation="border" size="sm" /> : 'Refresh'}
                </Button>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            <Form onSubmit={handleSubmit} className="mb-3">
              <Row className="gy-2 gx-3">
                <Col sm={6} md={3}>
                  <Form.Group controlId="coder-platform-status">
                    <Form.Label className="small text-muted">Status</Form.Label>
                    <Form.Select name="status" value={filters.status} onChange={handleInputChange}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col sm={6} md={3}>
                  <Form.Group controlId="coder-platform-priority">
                    <Form.Label className="small text-muted">Priority</Form.Label>
                    <Form.Select name="priority" value={filters.priority} onChange={handleInputChange}>
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col sm={6} md={3}>
                  <Form.Group controlId="coder-platform-assigned">
                    <Form.Label className="small text-muted">Assigned to</Form.Label>
                    <Form.Control
                      type="email"
                      name="assigned"
                      value={filters.assigned}
                      onChange={handleInputChange}
                      placeholder="coder@example.com"
                    />
                  </Form.Group>
                </Col>
                <Col sm={6} md={3}>
                  <Form.Group controlId="coder-platform-search">
                    <Form.Label className="small text-muted">Search</Form.Label>
                    <Form.Control
                      type="text"
                      name="search"
                      value={filters.search}
                      onChange={handleInputChange}
                      placeholder="Member name or key"
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} className="text-end">
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? <Spinner animation="border" size="sm" /> : 'Apply filters'}
                  </Button>
                </Col>
              </Row>
            </Form>

            {error && <Alert variant="danger">{error}</Alert>}

            <div className="table-responsive">
              <Table hover responsive className="align-middle">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Due date</th>
                    <th>Service dates</th>
                    <th>Codes</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} className="text-center py-4">
                        <Spinner animation="border" />
                      </td>
                    </tr>
                  )}
                  {!loading && worklist.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No coder platform records found. Adjust filters or try loading sample data.
                      </td>
                    </tr>
                  )}
                  {worklist.map((item) => (
                    <tr key={item.chase_id}>
                      <td>
                        <div className="fw-semibold">{item.member_name || '-'}</div>
                        <div className="text-muted small">{item.member_key}</div>
                      </td>
                      <td>{renderStatusBadge(item.status)}</td>
                      <td>{renderPriorityBadge(item.priority)}</td>
                      <td>{item.assigned_coder_email || <span className="text-muted">Unassigned</span>}</td>
                      <td>{item.due_date || <span className="text-muted">Not set</span>}</td>
                      <td>
                        <div>{item.service_date_from || '-'}</div>
                        <div className="text-muted small">{item.service_date_to || '-'}</div>
                      </td>
                      <td>
                        <div>{item.icd10_code || '-'}</div>
                        <div className="text-muted small">{item.hcc_code || '-'}</div>
                      </td>
                      <td className="text-end">
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => navigate(`/coding/members/${item.member_id}`)}
                        >
                          View member
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>

        <Row className="mt-4 g-3">
          <Col md={6}>
            <Card className="h-100 shadow-sm">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>Status distribution</span>
                <span className="small text-muted">Live counts</span>
              </Card.Header>
              <Card.Body>
                {Object.keys(statusCounts).length === 0 && (
                  <div className="text-muted">No status data yet.</div>
                )}
                {Object.entries(statusCounts).map(([key, value]) => (
                  <div key={key} className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-capitalize">{key}</span>
                    <Badge bg="light" text="dark">{value}</Badge>
                  </div>
                ))}
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card className="h-100 shadow-sm">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>Priority mix</span>
                <span className="small text-muted">Across current results</span>
              </Card.Header>
              <Card.Body>
                {Object.keys(priorityCounts).length === 0 && (
                  <div className="text-muted">No priority data yet.</div>
                )}
                {Object.entries(priorityCounts).map(([key, value]) => (
                  <div key={key} className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-capitalize">{key}</span>
                    <Badge bg="light" text="dark">{value}</Badge>
                  </div>
                ))}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </main>
    </div>
  );
};

export default CodingCoderPlatformPage;
