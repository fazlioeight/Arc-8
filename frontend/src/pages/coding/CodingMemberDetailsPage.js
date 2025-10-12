import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Row,
  Spinner,
  Table,
  Form,
} from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { fetchCodingMemberDetail, fetchCodingMembers } from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';

const CodingMemberDetailsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-member-details';
  const effectiveTenant = tenant || 'prominencehealth';

  const loadMembers = async () => {
    setLoadingMembers(true);
    setError(null);
    try {
      const response = await fetchCodingMembers(effectiveToken, effectiveTenant, { pageSize: 50 });
      setMembers(response.items || []);
      if (!selectedMemberId && response.items && response.items.length) {
        setSelectedMemberId(response.items[0].id);
      }
      recordAuditEvent?.('coding.member_details.load_members');
    } catch (err) {
      setError(err.message || 'Unable to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadDetail = async (memberId) => {
    if (!memberId) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await fetchCodingMemberDetail(effectiveToken, effectiveTenant, memberId);
      setDetail(response);
      recordAuditEvent?.('coding.member_details.load_detail', { memberId });
    } catch (err) {
      setError(err.message || 'Unable to load member detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    if (selectedMemberId) {
      void loadDetail(selectedMemberId);
    }
    // eslint-disable-next-line
  }, [selectedMemberId]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coding-member-details-refresh',
        label: 'Refresh member detail',
        category: 'Coding',
        action: () => { if (selectedMemberId) void loadDetail(selectedMemberId); },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands, selectedMemberId]);

  const memberSummary = useMemo(() => detail?.member || null, [detail]);
  const eligibility = detail?.eligibility || null;

  const handleMemberChange = (event) => {
    setSelectedMemberId(event.target.value);
  };

  const renderStatus = (status) => {
    if (!status) return <Badge bg="secondary">Unknown</Badge>;
    const normalized = status.toLowerCase();
    const variant = normalized === 'active' ? 'success' : normalized === 'closed' ? 'secondary' : 'warning';
    return <Badge bg={variant}>{status}</Badge>;
  };

  const renderCardValue = (label, value, hint) => (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        <div className="text-muted small">{label}</div>
        <div className="h4 mb-1">{value ?? <span className="text-muted">N/A</span>}</div>
        {hint && <div className="small text-muted">{hint}</div>}
      </Card.Body>
    </Card>
  );

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Member details hub"
        subtitle="Quickly review eligibility, chases, claims, and assessment history."
      />

      <main className="container my-4">
        <Card className="shadow-sm mb-4">
          <Card.Body>
            <Form onSubmit={(event) => event.preventDefault()}>
              <Row className="gy-2 gx-3 align-items-end">
                <Col md={6}>
                  <Form.Group controlId="coding-member-details-select">
                    <Form.Label className="text-muted small">Select member</Form.Label>
                    <Form.Select value={selectedMemberId} onChange={handleMemberChange} disabled={loadingMembers}>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key} · {member.member_key}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md="auto">
                  <Button
                    variant="outline-primary"
                    disabled={loadingMembers}
                    onClick={() => void loadMembers()}
                  >
                    {loadingMembers ? <Spinner animation="border" size="sm" /> : 'Refresh list'}
                  </Button>
                </Col>
                <Col md="auto">
                  <Button
                    variant="primary"
                    disabled={!selectedMemberId}
                    onClick={() => {
                      const member = members.find((item) => item.id === selectedMemberId);
                      navigate(`/coding/members/${selectedMemberId}`, {
                        state: {
                          from: `${location.pathname}${location.search}`,
                          breadcrumb: member ? ([member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key) : undefined,
                        },
                      });
                    }}
                  >
                    Open chart
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card.Body>
        </Card>

        {error && <Alert variant="danger">{error}</Alert>}

        {loadingDetail && (
          <div className="text-center py-4">
            <Spinner animation="border" />
          </div>
        )}

        {!loadingDetail && memberSummary && (
          <>
            <Row className="gy-3 mb-4">
              <Col md={3}>{renderCardValue('Member', `${memberSummary.first_name || ''} ${memberSummary.last_name || ''}`.trim() || memberSummary.member_key)}</Col>
              <Col md={2}>{renderCardValue('Status', renderStatus(memberSummary.status))}</Col>
              <Col md={2}>{renderCardValue('Line of business', memberSummary.line_of_business || '—')}</Col>
              <Col md={2}>{renderCardValue('Risk score', memberSummary.risk_score != null ? Number(memberSummary.risk_score).toFixed(2) : '—')}</Col>
              <Col md={3}>{renderCardValue('Primary provider', memberSummary.pcp_name || memberSummary.pcp_npi || '—')}</Col>
            </Row>

            <Row className="gy-3 mb-4">
              <Col md={4}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>Eligibility</Card.Header>
                  <Card.Body>
                    {!eligibility && <div className="text-muted">No eligibility data available.</div>}
                    {eligibility && (
                      <dl className="row mb-0">
                        <dt className="col-6 text-muted small">Plan start</dt>
                        <dd className="col-6">{eligibility.plan_start || '—'}</dd>
                        <dt className="col-6 text-muted small">Plan end</dt>
                        <dd className="col-6">{eligibility.plan_end || '—'}</dd>
                        <dt className="col-6 text-muted small">Medicare effective</dt>
                        <dd className="col-6">{eligibility.medicare_effective_date || '—'}</dd>
                        <dt className="col-6 text-muted small">Risk tier</dt>
                        <dd className="col-6">{eligibility.risk_tier || '—'}</dd>
                        <dt className="col-6 text-muted small">Dual eligible</dt>
                        <dd className="col-6">{eligibility.is_dual_eligible ? 'Yes' : 'No'}</dd>
                      </dl>
                    )}
                  </Card.Body>
                </Card>
              </Col>
              <Col md={8}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>Chases</Card.Header>
                  <Card.Body>
                    <div className="table-responsive">
                      <Table size="sm" hover className="align-middle">
                        <thead>
                          <tr>
                            <th>Chase</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Coder</th>
                            <th>Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail?.chases || []).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center text-muted py-3">
                                No chases yet.
                              </td>
                            </tr>
                          )}
                          {(detail?.chases || []).map((chase) => (
                            <tr key={chase.id}>
                              <td>{chase.chase_code}</td>
                              <td>{renderStatus(chase.status)}</td>
                              <td>{chase.priority || <span className="text-muted">—</span>}</td>
                              <td>{chase.assigned_coder_email || <span className="text-muted">Unassigned</span>}</td>
                              <td>{chase.due_date || <span className="text-muted">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="gy-3 mb-4">
              <Col md={6}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>Claims</Card.Header>
                  <Card.Body>
                    <div className="table-responsive">
                      <Table size="sm" hover className="align-middle">
                        <thead>
                          <tr>
                            <th>Claim #</th>
                            <th>Date</th>
                            <th>Total paid</th>
                            <th>HCC codes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail?.claims || []).length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center text-muted py-3">
                                No claims synced yet.
                              </td>
                            </tr>
                          )}
                          {(detail?.claims || []).map((claim) => (
                            <tr key={claim.id}>
                              <td>{claim.claim_number}</td>
                              <td>{claim.service_date || '—'}</td>
                              <td>{claim.total_paid != null ? `$${Number(claim.total_paid).toFixed(2)}` : '—'}</td>
                              <td>{Object.keys(claim.hcc_codes || {}).join(', ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>MAO records</Card.Header>
                  <Card.Body>
                    <div className="table-responsive">
                      <Table size="sm" hover className="align-middle">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>HCC</th>
                            <th>ICD-10</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail?.mao_records || []).length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center text-muted py-3">
                                No MAO-004 records yet.
                              </td>
                            </tr>
                          )}
                          {(detail?.mao_records || []).map((record) => (
                            <tr key={record.id}>
                              <td>{record.submission_year}</td>
                              <td>{record.hcc_code}</td>
                              <td>{record.icd10_code || '—'}</td>
                              <td>{renderStatus(record.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="gy-3 mb-4">
              <Col md={6}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>Health assessments</Card.Header>
                  <Card.Body>
                    <div className="table-responsive">
                      <Table size="sm" hover className="align-middle">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>ICD-10</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail?.health_assessments || []).length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center text-muted py-3">
                                No assessments captured.
                              </td>
                            </tr>
                          )}
                          {(detail?.health_assessments || []).map((assessment) => (
                            <tr key={assessment.id}>
                              <td>{assessment.assessment_date}</td>
                              <td>{assessment.assessment_type}</td>
                              <td>{renderStatus(assessment.completion_status)}</td>
                              <td>{(assessment.icd10_codes || []).join(', ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                <Card className="h-100 shadow-sm">
                  <Card.Header>Notes</Card.Header>
                  <Card.Body>
                    {(detail?.notes || []).length === 0 && (
                      <div className="text-muted">No notes recorded yet.</div>
                    )}
                    {(detail?.notes || []).map((note) => (
                      <Card key={note.id} className="mb-3 border-0 border-start border-4 border-primary">
                        <Card.Body className="py-2">
                          <div className="small text-muted d-flex justify-content-between">
                            <span>{note.author_email}</span>
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                          <div>{note.body}</div>
                        </Card.Body>
                      </Card>
                    ))}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </main>
    </div>
  );
};

export default CodingMemberDetailsPage;
