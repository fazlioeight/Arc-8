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

import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import DocumentViewer from '../../../components/workbench/DocumentViewer';
import EvidenceSnippetsPanel from '../../../components/workbench/EvidenceSnippetsPanel';
import ICDMapPanel from '../../../components/workbench/ICDMapPanel';
import MEATChecklist from '../../../components/workbench/MEATChecklist';
import { AuthContext } from '../../../context/AuthContext';
import {
  fetchWorkbenchSuspects,
  finalizeCode,
  getICDMap,
  fetchDocumentPdf,
} from '../../../services/workbenchService';
import '../coding/member/memberWorkspace.css';
import { CODING_NAV_ITEMS } from './codingNavItems';

const DEFAULT_CHECKLIST = {
  meat_complete: false,
  face_to_face: false,
  acceptable_provider: false,
  dos_in_year: false,
};

const CodingMemberWorkbenchPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const { token, tenant, user } = useContext(AuthContext) || {};
  const memberId = params.memberId;

  const [suspects, setSuspects] = useState([]);
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [icdMap, setIcdMap] = useState(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [finalizeState, setFinalizeState] = useState({ submitting: false, error: null });

  const loadSuspects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWorkbenchSuspects(token || 'sample-workbench', tenant || 'prominencehealth', memberId);
      setSuspects(response.suspects || []);
      setSelectedSuspect(response.suspects?.[0] || null);
    } catch (err) {
      setError(err.message || 'Unable to load workbench');
    } finally {
      setLoading(false);
    }
  }, [memberId, tenant, token]);

  const loadIcdMap = useCallback(async () => {
    if (!selectedSuspect) return;
    const map = await getICDMap(token || 'sample-workbench', tenant || 'prominencehealth', { code: selectedSuspect.hcc_code });
    setIcdMap(map);
  }, [selectedSuspect, token, tenant]);

  const loadPdf = useCallback(async () => {
    if (!selectedSuspect) return;
    const blob = await fetchDocumentPdf(token || 'sample-workbench', tenant || 'prominencehealth', selectedSuspect.document_id);
    setPdfBlob(blob);
  }, [selectedSuspect, token, tenant]);

  useEffect(() => {
    void loadSuspects();
  }, [loadSuspects]);

  useEffect(() => {
    void loadIcdMap();
    void loadPdf();
  }, [loadIcdMap, loadPdf]);

  const handleFinalize = async () => {
    if (!selectedSuspect) return;
    setFinalizeState({ submitting: true, error: null });
    try {
      await finalizeCode(token || 'sample-workbench', tenant || 'prominencehealth', { suspect_id: selectedSuspect.id, ...checklist });
      setFinalizeState({ submitting: false, error: null });
      navigate('/coding');
    } catch (err) {
      setFinalizeState({ submitting: false, error: err.message || 'Unable to finalize code' });
    }
  };

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
      title="Member workbench"
      subtitle="Review evidence, finalize codes, and export submissions."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Suspects" value={suspects.length} meta="Loaded" tone="info" />
          <PortalStat label="Selected" value={selectedSuspect ? selectedSuspect.hcc_code : 'None'} meta="HCC" tone="warning" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard title="Workbench queue" subtitle="Select a suspect to review evidence and finalize.">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>HCC</th>
                <th>ICD-10</th>
                <th>Status</th>
                <th>Evidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center py-3"><Spinner animation="border" /></td>
                </tr>
              )}
              {!loading && suspects.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-3">No suspects.</td>
                </tr>
              )}
              {suspects.map((suspect) => (
                <tr key={suspect.id}>
                  <td>{suspect.hcc_code}</td>
                  <td>{suspect.icd10_code}</td>
                  <td>{suspect.status}</td>
                  <td>{suspect.evidence?.length || 0} snippets</td>
                  <td className="text-end">
                    <Button size="sm" variant="link" onClick={() => setSelectedSuspect(suspect)}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <PortalCard
        title={selectedSuspect ? `Suspect ${selectedSuspect.hcc_code}` : 'Suspect detail'}
        subtitle={selectedSuspect ? selectedSuspect.icd10_code : 'Select a suspect to view evidence.'}
      >
        {selectedSuspect ? (
          <Row className="g-3">
            <Col lg={6}>
              <Card className="h-100">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">Evidence</div>
                    <div className="text-muted small">{selectedSuspect.evidence?.length || 0} snippets</div>
                  </div>
                  <Badge bg="secondary">{selectedSuspect.status}</Badge>
                </Card.Header>
                <Card.Body>
                  <EvidenceSnippetsPanel evidence={selectedSuspect.evidence || []} />
                </Card.Body>
              </Card>
            </Col>
            <Col lg={6} className="d-flex flex-column gap-3">
              <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">ICD mapping</div>
                    <div className="text-muted small">Suggested codes</div>
                  </div>
                  <Badge bg="info">{selectedSuspect.hcc_code}</Badge>
                </Card.Header>
                <Card.Body>
                  <ICDMapPanel map={icdMap} />
                </Card.Body>
              </Card>
              <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">MEAT checklist</div>
                    <div className="text-muted small">Document review</div>
                  </div>
                  <Badge bg="secondary">{user?.email || 'Coder'}</Badge>
                </Card.Header>
                <Card.Body>
                  <MEATChecklist checklist={checklist} onChange={setChecklist} />
                </Card.Body>
              </Card>
              <Card className="flex-fill">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">Source document</div>
                    <div className="text-muted small">PDF preview</div>
                  </div>
                  <Badge bg="secondary">{selectedSuspect.document_id}</Badge>
                </Card.Header>
                <Card.Body className="p-0" style={{ minHeight: 240 }}>
                  <DocumentViewer pdfBlob={pdfBlob} isLoading={!pdfBlob} />
                </Card.Body>
              </Card>
            </Col>
          </Row>
        ) : (
          <Alert variant="info">Select a suspect from the queue above.</Alert>
        )}
      </PortalCard>

      <PortalCard title="Finalize" subtitle="Submit codes and export submissions.">
        {finalizeState.error && <Alert variant="danger">{finalizeState.error}</Alert>}
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!selectedSuspect || finalizeState.submitting}
            onClick={handleFinalize}
          >
            {finalizeState.submitting ? <Spinner animation="border" size="sm" /> : 'Finalize code'}
          </Button>
          <Button variant="outline-secondary" onClick={() => navigate('/coding')}>
            Back to dashboard
          </Button>
        </div>
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingMemberWorkbenchPage;
