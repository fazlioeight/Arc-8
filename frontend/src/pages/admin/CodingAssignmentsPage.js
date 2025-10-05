import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import {
  assignCodingAdminWork,
  fetchCodingAdminAssignments,
} from '../../services/codingService';

const CodingAssignmentsPage = () => {
  const navigate = useNavigate();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => Boolean(token && tenant), [token, tenant]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assignState, setAssignState] = useState('idle');
  const [successMessage, setSuccessMessage] = useState(null);
  const [overview, setOverview] = useState({ coders: [], items: [] });
  const [selectedCoder, setSelectedCoder] = useState('');
  const [selectedChases, setSelectedChases] = useState(() => new Set());

  const loadAssignments = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingAdminAssignments(token, tenant);
      setOverview({ coders: response.coders || [], items: response.items || [] });
      if (!selectedCoder && response.coders && response.coders.length) {
        setSelectedCoder(response.coders[0].email);
      }
    } catch (err) {
      setError(err.message || 'Unable to load coding assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadAssignments();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery, token, tenant]);

  const toggleSelection = (chaseId) => {
    setSelectedChases((prev) => {
      const next = new Set(prev);
      if (next.has(chaseId)) {
        next.delete(chaseId);
      } else {
        next.add(chaseId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedChases(new Set());
  };

  const handleAssign = async (event) => {
    event.preventDefault();
    setSuccessMessage(null);
    if (!selectedCoder) {
      setError('Select a coder before assigning work');
      return;
    }
    if (selectedChases.size === 0) {
      setError('Select at least one chase to assign');
      return;
    }
    setAssignState('working');
    setError(null);
    try {
      const response = await assignCodingAdminWork(token, tenant, {
        coder_email: selectedCoder,
        chase_ids: Array.from(selectedChases),
        member_ids: [],
      });
      setOverview({ coders: response.coders || [], items: response.items || [] });
      setSuccessMessage(`Assigned ${selectedChases.size} chase(s) to ${selectedCoder}`);
      clearSelection();
    } catch (err) {
      setError(err.message || 'Unable to assign work');
    } finally {
      setAssignState('idle');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-5">
        <Alert variant="warning">You must be logged in to manage assignments.</Alert>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4">
      <PortalUtilityBar />
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 className="h4 mb-1">Coding work assignments</h1>
          <div className="text-muted">Allocate open chases to available coders.</div>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={() => navigate('/admin/master')}>
          Back to admin
        </Button>
      </div>

      {error && (
        <Alert variant="danger" className="mb-3" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" className="mb-3" onClose={() => setSuccessMessage(null)} dismissible>
          {successMessage}
        </Alert>
      )}

      <Card className="mb-4">
        <Card.Header>Assignment controls</Card.Header>
        <Card.Body>
          <Form onSubmit={handleAssign} className="row g-3 align-items-end">
            <Col md={4}>
              <Form.Group controlId="coderSelect">
                <Form.Label>Assign to coder</Form.Label>
                <Form.Select
                  value={selectedCoder}
                  onChange={(event) => setSelectedCoder(event.target.value)}
                  disabled={loading || overview.coders.length === 0}
                >
                  {overview.coders.length === 0 && <option value="">No coders available</option>}
                  {overview.coders.map((coder) => (
                    <option key={coder.id ?? coder.email} value={coder.email}>
                      {coder.email}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={2}>
              <Button type="submit" variant="primary" disabled={assignState === 'working' || selectedChases.size === 0}>
                {assignState === 'working' ? 'Assigning...' : 'Assign work'}
              </Button>
            </Col>
            <Col md={2}>
              <Button variant="outline-secondary" onClick={clearSelection} disabled={selectedChases.size === 0}>
                Clear selection
              </Button>
            </Col>
            <Col md={4} className="text-end text-muted small">
              {selectedChases.size} chase(s) selected
            </Col>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          Open chases
          {loading && <Spinner animation="border" size="sm" className="ms-2" />}
        </Card.Header>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>
                  <Form.Check
                    type="checkbox"
                    checked={overview.items.length > 0 && selectedChases.size === overview.items.length}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedChases(new Set(overview.items.map((item) => item.chase_id)));
                      } else {
                        clearSelection();
                      }
                    }}
                    disabled={overview.items.length === 0}
                  />
                </th>
                <th>Member</th>
                <th>Chase</th>
                <th>Status</th>
                <th>Priority</th>
                <th>HCC</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {!loading && overview.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No open chases available for assignment.
                  </td>
                </tr>
              )}
              {overview.items.map((item) => {
                const isSelected = selectedChases.has(item.chase_id);
                return (
                  <tr key={item.chase_id} className={isSelected ? 'table-active' : ''}>
                    <td>
                      <Form.Check
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(item.chase_id)}
                      />
                    </td>
                    <td>
                      <div className="fw-semibold">{item.member_name || item.member_key}</div>
                      <div className="small text-muted">#{item.member_id}</div>
                    </td>
                    <td>#{item.chase_id}</td>
                    <td>{item.status}</td>
                    <td>
                      {item.priority ? (
                        <Badge bg={item.priority === 'high' ? 'danger' : item.priority === 'normal' ? 'primary' : 'secondary'}>
                          {item.priority}
                        </Badge>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>{item.hcc_code || item.icd10_code || '-'}</td>
                    <td>{item.assigned_coder_email || <span className="text-muted">Unassigned</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default CodingAssignmentsPage;
