import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Form, ListGroup, Row, Spinner, Table } from 'react-bootstrap';

import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import { AuthContext } from '../../../context/AuthContext';
import {
  createCodingNote,
  createHealthAssessment,
  fetchCodingMemberDetail,
  fetchMemberGapAnalysis,
  generateSubmissionExport,
  updateCodingChase,
} from '../../../services/codingService';
import '../coding/member/memberWorkspace.css';
import { CODING_NAV_ITEMS } from './codingNavItems';

const CodingMemberDetailPage = () => {
  let memberId;
  try {
    const params = useParams();
    memberId = params?.memberId;
  } catch (err) {
    memberId = undefined;
  }
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => token && tenant && memberId, [token, tenant, memberId]);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteStatus, setNoteStatus] = useState('idle');
  const [chaseUpdating, setChaseUpdating] = useState(null);
  const [gap, setGap] = useState(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [assessmentIcd, setAssessmentIcd] = useState('');
  const [assessmentStatus, setAssessmentStatus] = useState('idle');
  const [submissionState, setSubmissionState] = useState('idle');
  const [submissionResult, setSubmissionResult] = useState(null);

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

  const loadGapAnalysis = async () => {
    if (!canQuery) return;
    setGapLoading(true);
    try {
      const response = await fetchMemberGapAnalysis(token, tenant, memberId);
      setGap(response);
    } catch (err) {
      setError((prev) => prev || err.message || 'Unable to load MAO gap analysis');
    } finally {
      setGapLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadDetail();
  }, [isAuthenticated, canQuery]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadGapAnalysis();
  }, [isAuthenticated, canQuery]);

  const member = detail?.member;
  const eligibility = detail?.eligibility;
  const priority = detail?.priority;
  const chases = detail?.chases || [];
  const notes = detail?.notes || [];
  const claims = detail?.claims || [];
  const maoRecords = detail?.mao_records || [];
  const assessments = detail?.health_assessments || [];

  const handleAdvanceChase = async (chase) => {
    try {
      setChaseUpdating(chase.id);
      const nextStatus = chase.status === 'open' ? 'in_review' : 'closed';
      const updated = await updateCodingChase(token, tenant, chase.id, { status: nextStatus });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              chases: prev.chases.map((item) => (item.id === updated.id ? updated : item)),
            }
          : prev
      );
    } catch (err) {
      setError(err.message || 'Unable to update chase');
    } finally {
      setChaseUpdating(null);
    }
  };

  const handleAddNote = async (event) => {
    event.preventDefault();
    if (!noteBody.trim()) return;
    try {
      setNoteStatus('saving');
      const created = await createCodingNote(token, tenant, memberId, { body: noteBody.trim() });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: [created, ...prev.notes],
            }
          : prev
      );
      setNoteBody('');
      setNoteStatus('idle');
    } catch (err) {
      setNoteStatus('error');
      setError(err.message || 'Unable to save note');
    }
  };

  const handleCreateAssessment = async (event) => {
    event.preventDefault();
    if (!assessmentDate) return;
    try {
      setAssessmentStatus('saving');
      const payload = {
        assessment_date: assessmentDate,
        assessment_type: 'initial',
        icd10_codes: assessmentIcd
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
        notes: assessmentNotes || undefined,
      };
      const created = await createHealthAssessment(token, tenant, memberId, payload);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              health_assessments: [created, ...(prev.health_assessments || [])],
            }
          : prev
      );
      setAssessmentStatus('idle');
      setAssessmentNotes('');
      setAssessmentIcd('');
    } catch (err) {
      setAssessmentStatus('error');
      setError(err.message || 'Unable to record assessment');
    }
  };

  const handleGenerateSubmission = async () => {
    try {
      setSubmissionState('working');
      const submissionYear = new Date().getFullYear();
      const result = await generateSubmissionExport(token, tenant, submissionYear, [memberId]);
      setSubmissionResult(result);
      setSubmissionState('done');
    } catch (err) {
      setSubmissionState('error');
      setError(err.message || 'Unable to generate submission');
    }
  };

  if (!isAuthenticated) {
    return (
      <PortalPageLayout
        backgroundClassName=""
        maxWidthClassName="max-w-5xl"
        paddingClassName="px-4"
        navItems={CODING_NAV_ITEMS}
        currentNav="members"
        utilityBar
        headerContent={<PortalPageHeader eyebrow="Coding" title="Member detail" subtitle="Sign in to view member details." />}
      >
        <PortalCard tone="warning" title="Authentication required" subtitle="You must be logged in to view member details." />
      </PortalPageLayout>
    );
  }

  if (loading && !detail) {
    return (
      <PortalPageLayout
        backgroundClassName=""
        maxWidthClassName="max-w-5xl"
        paddingClassName="px-4"
        navItems={CODING_NAV_ITEMS}
        currentNav="members"
        utilityBar
        headerContent={<PortalPageHeader eyebrow="Coding" title="Member detail" subtitle="Loading member details..." />}
      >
        <PortalCard><div className="text-center"><Spinner animation="border" /></div></PortalCard>
      </PortalPageLayout>
    );
  }

  if (error && !detail) {
    return (
      <PortalPageLayout
        backgroundClassName=""
        maxWidthClassName="max-w-5xl"
        paddingClassName="px-4"
        navItems={CODING_NAV_ITEMS}
        currentNav="members"
        utilityBar
        headerContent={<PortalPageHeader eyebrow="Coding" title="Member detail" subtitle="Error loading member." />}
      >
        <PortalCard tone="danger" title="Unable to load member" subtitle={error} />
      </PortalPageLayout>
    );
  }

  if (!member) {
    return (
      <PortalPageLayout
        backgroundClassName=""
        maxWidthClassName="max-w-5xl"
        paddingClassName="px-4"
        navItems={CODING_NAV_ITEMS}
        currentNav="members"
        utilityBar
        headerContent={<PortalPageHeader eyebrow="Coding" title="Member detail" subtitle="Member not found." />}
      >
        <PortalCard tone="warning" title="Member not found" />
      </PortalPageLayout>
    );
  }

  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key;

  const layoutProps = {
    backgroundClassName: '',
    maxWidthClassName: 'max-w-6xl',
    paddingClassName: 'px-4',
    navItems: CODING_NAV_ITEMS,
    currentNav: 'members',
    utilityBar: true,
  };

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title={fullName}
      subtitle={`Member key: ${member.member_key}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Chases" value={chases.length} meta="Open" tone="info" />
          <PortalStat label="Notes" value={notes.length} meta="Authored" tone="success" />
          <PortalStat label="Gaps" value={gap?.missing_hcc?.length || 0} meta="Detected" tone="warning" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {error && <PortalCard tone="danger" title="Issue" subtitle={error} />}
      <PortalCard title="Active chases" subtitle="Advance statuses or review ownership.">
        <div className="table-responsive">
          <Table hover responsive className="mb-0 align-middle">
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
                  <td colSpan={5} className="text-center text-muted py-3">
                    No chases yet.
                  </td>
                </tr>
              )}
              {chases.map((chase) => (
                <tr key={chase.id}>
                  <td>{chase.chase_code}</td>
                  <td>{chase.status}</td>
                  <td>{chase.priority}</td>
                  <td>{chase.assigned_coder_email || 'Unassigned'}</td>
                  <td className="text-end">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      disabled={chaseUpdating === chase.id}
                      onClick={() => void handleAdvanceChase(chase)}
                    >
                      {chaseUpdating === chase.id ? 'Updating�' : 'Advance'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>

      <PortalCard title="Notes" subtitle="Document your chart review.">
        <Form onSubmit={handleAddNote} className="mb-3">
          <Form.Label htmlFor="member-note">Add a note</Form.Label>
          <Form.Control
            id="member-note"
            as="textarea"
            rows={3}
            placeholder="Document your chart review"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <div className="mt-2 d-flex justify-content-end">
            <Button type="submit" disabled={noteStatus === 'saving' || !noteBody.trim()} variant="primary">
              {noteStatus === 'saving' ? 'Saving...' : 'Save note'}
            </Button>
          </div>
        </Form>
        <ListGroup variant="flush">
          {notes.length === 0 && <ListGroup.Item className="text-muted">No notes written yet.</ListGroup.Item>}
          {notes.map((note) => (
            <ListGroup.Item key={note.id}>
              <div className="fw-semibold">{note.author_email}</div>
              <div className="small text-muted">{new Date(note.created_at).toLocaleString()}</div>
              <div>{note.body}</div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </PortalCard>

      <PortalCard title="Claims & encounters">
        <div className="table-responsive">
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Date</th>
                <th>HCC</th>
                <th>Total Paid</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-3">No claims loaded.</td>
                </tr>
              )}
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td>{claim.claim_number}</td>
                  <td>{claim.service_date || '-'}</td>
                  <td>{Object.keys(claim.hcc_codes || {}).join(', ') || '-'}</td>
                  <td>{claim.total_paid ? `$${Number(claim.total_paid).toFixed(2)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>

      <PortalCard title="MAO-004 Records">
        <div className="table-responsive">
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>HCC</th>
                <th>ICD-10</th>
                <th>Service Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {maoRecords.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-3">No MAO submissions yet.</td>
                </tr>
              )}
              {maoRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.hcc_code}</td>
                  <td>{record.icd10_code || '-'}</td>
                  <td>{[record.service_start, record.service_end].filter(Boolean).join(' to ') || '-'}</td>
                  <td>{record.status}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>

      <PortalCard title="Health assessments">
        <div className="table-responsive">
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>ICD-10</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assessments.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-3">No assessments captured.</td>
                </tr>
              )}
              {assessments.map((assessment) => (
                <tr key={assessment.id}>
                  <td>{assessment.assessment_date}</td>
                  <td>{assessment.assessment_type}</td>
                  <td>{(assessment.icd10_codes || []).join(', ') || '-'}</td>
                  <td>{assessment.completion_status}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>

      <PortalCard title="Profile" subtitle="Member attributes and eligibility." tone="info">
        <Row>
          <Col md={8}>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>Line of business:</strong> {member.line_of_business || '-'}</ListGroup.Item>
              <ListGroup.Item><strong>PCP:</strong> {member.pcp_name || '-'}</ListGroup.Item>
              <ListGroup.Item><strong>Risk score:</strong> {member.risk_score ?? '-'}</ListGroup.Item>
              <ListGroup.Item><strong>Language:</strong> {member.primary_language || '-'}</ListGroup.Item>
              <ListGroup.Item><strong>Location:</strong> {[member.address_city, member.address_state].filter(Boolean).join(', ') || '-'}</ListGroup.Item>
            </ListGroup>
          </Col>
          <Col md={4} className="text-md-end">
            <Badge bg={member.status === 'closed' ? 'secondary' : member.status === 'in_review' ? 'warning' : 'success'}>
              {member.status}
            </Badge>
          </Col>
        </Row>
      </PortalCard>

      <PortalCard title="Priority & actions">
        {priority ? (
          <div className="space-y-2">
            <div><strong>Tier:</strong> {priority.priority_tier}</div>
            <div><strong>Score:</strong> {priority.priority_score.toFixed ? priority.priority_score.toFixed(1) : priority.priority_score}</div>
            <div><strong>Opportunities:</strong> {priority.hcc_opportunity_count}</div>
            <div><strong>Next action:</strong> {priority.next_action || 'None'}</div>
            <div><strong>Due:</strong> {priority.next_action_due || '-'}</div>
            <div className="text-muted small">{priority.justification}</div>
          </div>
        ) : (
          <div className="text-muted">No priority score available yet.</div>
        )}
      </PortalCard>

      <PortalCard title="Eligibility">
        {eligibility ? (
          <ListGroup variant="flush">
            <ListGroup.Item><strong>Plan start:</strong> {eligibility.plan_start || '-'}</ListGroup.Item>
            <ListGroup.Item><strong>Medicare effective:</strong> {eligibility.medicare_effective_date || '-'}</ListGroup.Item>
            <ListGroup.Item><strong>Joined:</strong> {eligibility.joined_at || '-'}</ListGroup.Item>
            <ListGroup.Item><strong>New to Medicare:</strong> {eligibility.is_new_to_medicare ? 'Yes' : 'No'}</ListGroup.Item>
            <ListGroup.Item><strong>Dual eligible:</strong> {eligibility.is_dual_eligible ? 'Yes' : 'No'}</ListGroup.Item>
            <ListGroup.Item><strong>Risk tier:</strong> {eligibility.risk_tier || 'Standard'}</ListGroup.Item>
          </ListGroup>
        ) : (
          <div className="text-muted">No eligibility data in scope.</div>
        )}
      </PortalCard>

      <PortalCard title="MAO gap analysis">
        {gapLoading && <Spinner animation="border" size="sm" className="me-2" />}
        <Button variant="outline-secondary" size="sm" className="mb-3" onClick={() => void loadGapAnalysis()} disabled={gapLoading}>
          Refresh analysis
        </Button>
        {gap ? (
          <>
            <div className="mb-2"><strong>Immediate actions:</strong> {(gap.immediate_actions || []).join(', ') || 'None'}</div>
            <div className="fw-semibold mt-3">Missing HCCs</div>
            {(gap.missing_hcc || []).length === 0 ? (
              <div className="text-muted small">No missing HCC opportunities.</div>
            ) : (
              <ListGroup variant="flush" className="mb-3">
                {gap.missing_hcc.map((item, index) => (
                  <ListGroup.Item key={`missing-${index}`}>
                    <div><strong>{item.hcc_code}</strong></div>
                    <div className="small text-muted">ICD-10 candidates: {(item.icd10_candidates || []).join(', ') || 'None'}</div>
                    <div className="small text-muted">{item.reason}</div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </>
        ) : (
          <div className="text-muted">Gap analysis not yet available.</div>
        )}
      </PortalCard>

      <PortalCard title="Record health assessment">
        <Form onSubmit={handleCreateAssessment}>
          <Form.Group className="mb-2">
            <Form.Label>Date</Form.Label>
            <Form.Control type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>ICD-10 codes</Form.Label>
            <Form.Control
              placeholder="Comma separated ICD-10 codes"
              value={assessmentIcd}
              onChange={(e) => setAssessmentIcd(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Notes</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={assessmentNotes}
              onChange={(e) => setAssessmentNotes(e.target.value)}
            />
          </Form.Group>
          <Button type="submit" variant="primary" disabled={assessmentStatus === 'saving'}>
            {assessmentStatus === 'saving' ? 'Saving...' : 'Save assessment'}
          </Button>
        </Form>
      </PortalCard>

      <PortalCard title="CMS submission">
        <Button variant="outline-primary" size="sm" disabled={submissionState === 'working'} onClick={() => void handleGenerateSubmission()}>
          {submissionState === 'working' ? 'Generating...' : 'Generate member file'}
        </Button>
        {submissionResult && (
          <Form.Group className="mt-3">
            <Form.Label className="small text-muted">Preview ({submissionResult.record_count} records)</Form.Label>
            <Form.Control as="textarea" rows={4} value={submissionResult.csv} readOnly />
          </Form.Group>
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingMemberDetailPage;
