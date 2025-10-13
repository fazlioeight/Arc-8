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
import { fetchCoderReviewDashboard } from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';

const STATUS_VARIANTS = {
  open: 'primary',
  in_review: 'warning',
  closed: 'secondary',
};

const CodingReviewDashboardPage = () => {
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();
  const { token, tenant, user, recordAuditEvent } = useContext(AuthContext) || {};

  const [mineOnly, setMineOnly] = useState(false);
  const [queue, setQueue] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-coder-review';
  const effectiveTenant = tenant || 'prominencehealth';
  const currentEmail = user?.email || null;

  const loadDashboard = async (overrides = {}) => {
    const nextMineOnly = overrides.mineOnly !== undefined ? overrides.mineOnly : mineOnly;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCoderReviewDashboard(effectiveToken, effectiveTenant, {
        mineOnly: nextMineOnly,
        limit: 50,
        currentUserEmail: currentEmail || undefined,
      });
      setMetrics(response.metrics || []);
      setQueue(response.queue || []);
      recordAuditEvent?.('coding.review_dashboard.load', { mineOnly: nextMineOnly });
    } catch (err) {
      setError(err.message || 'Unable to load review dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coder-review-refresh',
        label: 'Refresh coder review dashboard',
        category: 'Coding',
        action: () => { void loadDashboard(); },
      },
      {
        id: 'coder-review-toggle-mine',
        label: 'Toggle review queue (mine only)',
        category: 'Coding',
        action: () => {
          setMineOnly((prev) => {
            const next = !prev;
            void loadDashboard({ mineOnly: next });
            return next;
          });
        },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands, currentEmail]);

  useEffect(() => {
    void loadDashboard({ mineOnly });
    // eslint-disable-next-line
  }, [mineOnly]);

  const statusBadge = (status) => {
    if (!status) return '-';
    const variant = STATUS_VARIANTS[status] || 'secondary';
    return <Badge bg={variant}>{status}</Badge>;
  };

  const priorityBadge = (priority) => {
    if (!priority) return '-';
    const variant = priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'secondary';
    return <Badge bg={variant}>{priority}</Badge>;
  };

  const metricCards = useMemo(() => {
    if (!Array.isArray(metrics)) return [];
    return metrics.map((metric) => (
      <Col md={3} sm={6} xs={12} key={metric.label}>
        <Card className="h-100 shadow-sm">
          <Card.Body>
            <div className="text-muted small">{metric.label}</div>
            <div className="display-6 fw-semibold">{metric.value}</div>
            {metric.hint && <div className="small text-muted">{metric.hint}</div>}
          </Card.Body>
        </Card>
      </Col>
    ));
  }, [metrics]);

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Coder review dashboard"
        subtitle="Monitor queue health, overdue items, and high-priority follow ups."
      />

      <main className="container my-4">
        <Row className="gy-3">
          {metricCards}
        </Row>

        <Card className="mt-4 shadow-sm">
          <Card.Header>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center">
              <div>
                <h2 className="h5 mb-1">Review queue</h2>
                <div className="text-muted">Latest items ordered by most recently updated.</div>
              </div>
              <div className="mt-2 mt-md-0 d-flex align-items-center gap-3">
                <Form.Check
                  type="switch"
                  id="review-mine-only"
                  label="Mine only"
                  checked={mineOnly}
                  onChange={(event) => setMineOnly(event.target.checked)}
                />
                <Button variant="outline-primary" size="sm" onClick={() => void loadDashboard()} disabled={loading}>
                  {loading ? <Spinner animation="border" size="sm" /> : 'Refresh'}
                </Button>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="table-responsive">
              <Table hover responsive className="align-middle">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Next action</th>
                    <th>Notes</th>
                    <th>Due date</th>
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
                  {!loading && queue.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No queue items match the current view.
                      </td>
                    </tr>
                  )}
                  {queue.map((item) => (
                    <tr key={item.chase_id}>
                      <td>
                        <div className="fw-semibold">{item.member_name || '-'}</div>
                        <div className="text-muted small">{item.member_key}</div>
                      </td>
                      <td>{statusBadge(item.status)}</td>
                      <td>{priorityBadge(item.priority)}</td>
                      <td>{item.assigned_coder_email || <span className="text-muted">Unassigned</span>}</td>
                      <td>{item.next_action ? item.next_action.replace(/_/g, ' ') : <span className="text-muted">None</span>}</td>
                      <td>
                        <div>{item.note_count || 0} note(s)</div>
                        <div className="text-muted small">
                          {item.last_note_at ? new Date(item.last_note_at).toLocaleString() : 'No notes'}
                        </div>
                      </td>
                      <td>{item.due_date || <span className="text-muted">Not set</span>}</td>
                      <td className="text-end">
                        <Button variant="link" size="sm" onClick={() => navigate(`/coding/member/${item.member_id}`)}>
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
      </main>
    </div>
  );
};

export default CodingReviewDashboardPage;
