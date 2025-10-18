import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Row,
  Spinner,
} from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import CodingPortalHeader from './CodingPortalHeader';
import DocumentViewer from '../../components/workbench/DocumentViewer';
import EvidenceSnippetsPanel from '../../components/workbench/EvidenceSnippetsPanel';
import ICDMapPanel from '../../components/workbench/ICDMapPanel';
import MEATChecklist from '../../components/workbench/MEATChecklist';
import { AuthContext } from '../../context/AuthContext';
import {
  fetchWorkbenchSuspects,
  finalizeCode,
  getICDMap,
} from '../../services/workbenchService';

const DEFAULT_CHECKLIST = {
  meat_complete: false,
  face_to_face: false,
  acceptable_provider: false,
  dos_in_year: false,
};

const CodingMemberWorkbenchPage = () => {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};

  const effectiveToken = token || 'sample-workbench';
  const effectiveTenant = tenant || 'prominencehealth';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [workbench, setWorkbench] = useState(null);
  const [activeSuspectId, setActiveSuspectId] = useState(null);
  const [selectedICD, setSelectedICD] = useState(null);
  const [evidenceUsed, setEvidenceUsed] = useState([]);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(null);

  const activeSuspect = useMemo(() => {
    if (!workbench?.suspects?.length || !activeSuspectId) {
      return null;
    }
    return workbench.suspects.find((item) => item.suspect_id === activeSuspectId) || null;
  }, [workbench, activeSuspectId]);

  useEffect(() => {
    if (!activeSuspect) {
      setSelectedICD(null);
      setEvidenceUsed([]);
      setChecklist(DEFAULT_CHECKLIST);
      return;
    }
    const defaultCode = activeSuspect.icd_suggestions?.[0]?.code || null;
    setSelectedICD(defaultCode);
    const qualifying = (activeSuspect.evidence || [])
      .filter((item) => item.qualifying)
      .map((item) => item.snippet_id);
    setEvidenceUsed(qualifying.slice(0, 2));
    setChecklist((prev) => ({
      ...DEFAULT_CHECKLIST,
      acceptable_provider: Boolean(workbench?.encounter?.provider?.type),
      dos_in_year: !!workbench?.encounter?.dos,
      meat_complete: qualifying.length > 0,
    }));
  }, [activeSuspect, workbench?.encounter?.dos, workbench?.encounter?.provider?.type]);

  const loadWorkbench = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    setFinalizeResult(null);
    try {
      const payload = await fetchWorkbenchSuspects(
        effectiveToken,
        effectiveTenant,
        memberId,
      );
      setWorkbench(payload);
      setActiveSuspectId(payload?.suspects?.[0]?.suspect_id || null);
      recordAuditEvent?.('coding.workbench.open', {
        memberId,
        suspects: payload?.suspects?.length ?? 0,
      });
    } catch (err) {
      setError(err.message || 'Failed to load workbench');
      setWorkbench(null);
    } finally {
      setLoading(false);
    }
  }, [memberId, effectiveToken, effectiveTenant, recordAuditEvent]);

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

  const handleFinalize = useCallback(async () => {
    if (!activeSuspect || !selectedICD || !workbench) return;
    setFinalizing(true);
    setError(null);
    try {
      const payload = {
        member_id: workbench.member?.id,
        encounter_id: workbench.encounter?.id,
        suspect_id: activeSuspect.suspect_id,
        selected_icd: selectedICD,
        model_year: workbench.model_year,
        lob: workbench.member?.lob,
        evidence_used: evidenceUsed,
        checklist,
      };
      const response = await finalizeCode(effectiveToken, effectiveTenant, payload);
      setFinalizeResult(response);
      recordAuditEvent?.('coding.workbench.finalize', {
        memberId: workbench.member?.id,
        suspectId: activeSuspect.suspect_id,
        icd: selectedICD,
        hcc: response?.hcc?.id,
      });
      const currentIndex = workbench.suspects.findIndex(
        (item) => item.suspect_id === activeSuspect.suspect_id,
      );
      const nextSuspect = workbench.suspects[currentIndex + 1]?.suspect_id || null;
      setActiveSuspectId(nextSuspect);
      if (!nextSuspect) {
        await loadWorkbench();
      }
    } catch (err) {
      setError(err.message || 'Finalize failed');
    } finally {
      setFinalizing(false);
    }
  }, [
    activeSuspect,
    checklist,
    effectiveTenant,
    effectiveToken,
    evidenceUsed,
    loadWorkbench,
    recordAuditEvent,
    selectedICD,
    workbench,
  ]);

  const fetchIcdMapping = useCallback(
    (code, overrides = {}) => {
      if (!code) return Promise.resolve(null);
      return getICDMap(effectiveToken, effectiveTenant, {
        code,
        modelYear: overrides.modelYear ?? workbench?.model_year,
        lob: overrides.lob ?? workbench?.member?.lob,
      });
    },
    [effectiveTenant, effectiveToken, workbench?.member?.lob, workbench?.model_year],
  );

  const handleNavigateLegacy = () => {
    if (!memberId) return;
    navigate(`/coding/member/${memberId}/chart`);
  };

  const renderSuspectButton = (suspect) => {
    const isActive = suspect.suspect_id === activeSuspectId;
    return (
      <button
        key={suspect.suspect_id}
        type="button"
        className={`list-group-item list-group-item-action ${isActive ? 'active' : ''}`}
        onClick={() => {
          setActiveSuspectId(suspect.suspect_id);
          recordAuditEvent?.('coding.workbench.select-suspect', {
            memberId: workbench?.member?.id,
            suspectId: suspect.suspect_id,
          });
        }}
      >
        <div className="d-flex justify-content-between">
          <span>{suspect.condition}</span>
          <span className="ms-2 text-nowrap">{Math.round((suspect.priority ?? 0) * 100)}%</span>
        </div>
        {suspect.icd_suggestions?.length ? (
          <div className="small text-muted">
            Suggests {suspect.icd_suggestions[0].code}
          </div>
        ) : null}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="container my-4 text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  if (error && !workbench) {
    return (
      <div className="container my-4">
        <Alert variant="danger">{error}</Alert>
        <Button variant="primary" onClick={() => void loadWorkbench()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!workbench) {
    return null;
  }

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title={`Coder workbench — ${workbench.member?.name || workbench.member?.id || ''}`}
        subtitle={`DOS: ${workbench.encounter?.dos || '—'} • LOB: ${workbench.member?.lob || '—'} • Model Year: ${
          workbench.model_year || '—'
        }`}
        additionalActions={(
          <Button variant="outline-secondary" size="sm" onClick={handleNavigateLegacy}>
            View legacy chart
          </Button>
        )}
      />

      <main className="container my-3">
        {error ? <Alert variant="warning">{error}</Alert> : null}
        {finalizeResult ? (
          <Alert variant="success" className="mb-3">
            Submitted to HCC {finalizeResult.hcc?.id} ({finalizeResult.hcc?.label}) — audit{' '}
            {finalizeResult.audit_id}
          </Alert>
        ) : null}
        <Row className="g-3">
          <Col lg={7} md={12}>
            <Card className="shadow-sm h-100">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>Document viewer</span>
                <Badge bg="light" text="dark">
                  {workbench.documents?.length || 0} source(s)
                </Badge>
              </Card.Header>
              <Card.Body>
                <DocumentViewer
                  documents={workbench.documents}
                  activeSnippet={
                    activeSuspect?.evidence?.find((item) => item.snippet_id === evidenceUsed?.[0]) || null
                  }
                />
              </Card.Body>
            </Card>
          </Col>

          <Col lg={5} md={12}>
            <Card className="shadow-sm mb-3">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>Suspects</span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => void loadWorkbench()}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="list-group small">
                  {workbench.suspects?.length
                    ? workbench.suspects.map(renderSuspectButton)
                    : 'No suspects available.'}
                </div>
              </Card.Body>
            </Card>

            <Card className="shadow-sm mb-3">
              <Card.Header>Evidence (MEAT)</Card.Header>
              <Card.Body>
                <EvidenceSnippetsPanel
                  suspect={activeSuspect}
                  evidenceUsed={evidenceUsed}
                  onChange={setEvidenceUsed}
                />
              </Card.Body>
            </Card>

            <Card className="shadow-sm mb-3">
              <Card.Header>ICD search & mapping</Card.Header>
              <Card.Body>
                <ICDMapPanel
                  selectedICD={selectedICD}
                  onSelectICD={setSelectedICD}
                  modelYear={workbench.model_year}
                  lob={workbench.member?.lob}
                  fetchMap={workbench ? fetchIcdMapping : null}
                />
              </Card.Body>
            </Card>

            <Card className="shadow-sm">
              <Card.Header>Checklist & finalize</Card.Header>
              <Card.Body>
                <MEATChecklist value={checklist} onChange={setChecklist} />
                <div className="d-flex gap-2 mt-3">
                  <Button
                    variant="primary"
                    onClick={() => void handleFinalize()}
                    disabled={!selectedICD || finalizing || !evidenceUsed.length}
                  >
                    {finalizing ? <Spinner animation="border" size="sm" /> : 'Finalize'}
                  </Button>
                  <Button variant="outline-secondary" disabled>
                    Create provider query
                  </Button>
                </div>
                <div className="mt-2 small text-muted">
                  Need the richer chart?{' '}
                  <Link to={`/coding/member/${memberId}/chart`}>Open legacy member workspace</Link>.
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </main>
    </div>
  );
};

export default CodingMemberWorkbenchPage;
