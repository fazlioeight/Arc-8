import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Form, ListGroup, Row, Spinner, Table } from 'react-bootstrap';

import { AuthContext } from '../context/AuthContext';
import {
  createCodingNote,
  fetchCodingMemberDetail,
  updateCodingChase,
} from '../services/codingService';

const CodingMemberDetailPage = () => {
  const { memberId } = useParams();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => token && tenant && memberId, [token, tenant, memberId]);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteStatus, setNoteStatus] = useState('idle');
  const [chaseUpdating, setChaseUpdating] = useState(null);

  const loadDetail = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMemberDetail(token, tenant, memberId);
      setDetail(response);
    } catch (err) {
      setError(err.message || 'Unable to retrieve member');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadDetail();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  const member = detail?.member;
  const chases = detail?.chases || [];
  const notes = detail?.notes || [];

  const handleAdvanceChase = async chase => {
    try {
      setChaseUpdating(chase.id);
      const nextStatus = chase.status === 'open' ? 'in_review' : 'closed';
      const updated = await updateCodingChase(token, tenant, chase.id, { status: nextStatus });
      setDetail(prev =>
        prev
          ? {
              ...prev,
              chases: prev.chases.map(item => (item.id === updated.id ? updated : item)),
            }
          : prev,
      );
    } catch (err) {
      setError(err.message || 'Unable to update chase');
    } finally {
      setChaseUpdating(null);
    }
  };

  const handleAddNote = async event => {
    event.preventDefault();
    if (!noteBody.trim()) return;
    try {
      setNoteStatus('saving');
      const created = await createCodingNote(token, tenant, memberId, { body: noteBody.trim() });
      setDetail(prev =>
        prev
          ? {
              ...prev,
              notes: [created, ...prev.notes],
            }
          : prev,
      );
      setNoteBody('');
      setNoteStatus('idle');
    } catch (err) {
      setNoteStatus('error');
      setError(err.message || 'Unable to save note');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-5">
        <Alert variant="warning">You must be logged in to view member details.</Alert>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="container py-5 text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="container py-5">
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="container py-5">
        <Alert variant="warning">Member not found.</Alert>
      </div>
    );
  }

  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key;

  return (
    <div className="container py-4">
      <Row className="mb-4">
        <Col md={8}>
          <h1 className="h3 mb-1">{fullName}</h1>
          <div className="text-muted">Member key: {member.member_key}</div>
        </Col>
        <Col md={4} className="text-md-end">
          <Badge bg={member.status === 'closed' ? 'secondary' : member.status === 'in_review' ? 'warning' : 'success'}>
            {member.status}
          </Badge>
        </Col>
      </Row>
      {error && <Alert variant="danger">{error}</Alert>}
      <Row className="g-4">
        <Col md={8}>
          <Card className="mb-3">
            <Card.Header>Active chases</Card.Header>
            <Card.Body className="p-0">
              <Table hover responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Chase</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {chases.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-3">
                        No chases yet.
                      </td>
                      <td></td>
                    </tr>
                  )}
                  {chases.map(chase => (
                    <tr key={chase.id}>
                      <td>{chase.chase_code}</td>
                      <td>{chase.status}</td>
                      <td>{chase.priority}</td>
                      <td>{chase.assigned_coder_email || '—'}</td>
                      <td className="text-end">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          disabled={chaseUpdating === chase.id}
                          onClick={() => void handleAdvanceChase(chase)}
                        >
                          {chaseUpdating === chase.id ? 'Updating…' : 'Advance'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>Notes</Card.Header>
            <Card.Body>
              <Form onSubmit={handleAddNote} className="mb-3">
                <Form.Label htmlFor="member-note">Add a note</Form.Label>
                <Form.Control
                  id="member-note"
                  as="textarea"
                  rows={3}
                  placeholder="Document your chart review"
                  value={noteBody}
                  onChange={e => setNoteBody(e.target.value)}
                />
                <div className="mt-2 d-flex justify-content-end">
                  <Button
                    type="submit"
                    disabled={noteStatus === 'saving' || !noteBody.trim()}
                    variant="primary"
                  >
                    {noteStatus === 'saving' ? 'Saving…' : 'Save note'}
                  </Button>
                </div>
              </Form>
              <ListGroup variant="flush">
                {notes.length === 0 && (
                  <ListGroup.Item className="text-muted">No notes written yet.</ListGroup.Item>
                )}
                {notes.map(note => (
                  <ListGroup.Item key={note.id}>
                    <div className="fw-semibold">{note.author_email}</div>
                    <div className="small text-muted">{new Date(note.created_at).toLocaleString()}</div>
                    <div>{note.body}</div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-3">
            <Card.Header>Profile</Card.Header>
            <Card.Body>
              <ListGroup variant="flush">
                <ListGroup.Item><strong>Line of business:</strong> {member.line_of_business || '—'}</ListGroup.Item>
                <ListGroup.Item><strong>PCP:</strong> {member.pcp_name || '—'}</ListGroup.Item>
                <ListGroup.Item><strong>Risk score:</strong> {member.risk_score ?? '—'}</ListGroup.Item>
                <ListGroup.Item><strong>Language:</strong> {member.primary_language || '—'}</ListGroup.Item>
                <ListGroup.Item><strong>Location:</strong> {[member.address_city, member.address_state].filter(Boolean).join(', ') || '—'}</ListGroup.Item>
              </ListGroup>
            </Card.Body>
          </Card>
          <Button variant="outline-secondary" onClick={() => window.history.back()}>
            Back to members
          </Button>
        </Col>
      </Row>
    </div>
  );
};

export default CodingMemberDetailPage;
