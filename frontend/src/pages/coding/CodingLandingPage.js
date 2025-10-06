import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Spinner, Table } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { AuthContext } from '../../context/AuthContext';
import { fetchCodingMembers } from '../../services/codingService';

const STATUS_BADGES = {
  closed: 'secondary',
  in_review: 'warning',
  default: 'success',
};

const CodingLandingPage = () => {
  const navigate = useNavigate();
  const { user, token, tenant, isAuthenticated } = useContext(AuthContext) || {};

  const [worklist, setWorklist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canQuery = Boolean(token && tenant);
  const userEmail = user?.email?.toLowerCase();

  const loadWorklist = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMembers(token, tenant, {
        status: ['active', 'in_review'],
        pageSize: 25,
      });
      setWorklist(response.items || []);
    } catch (err) {
      setError(err.message || 'Unable to load worklist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadWorklist();
  }, [isAuthenticated, canQuery]);

  const assignedToMe = useMemo(() => {
    if (!userEmail) return worklist;
    const normalizedEmail = userEmail.toLowerCase();
    const matched = worklist.filter((member) => {
      const emails = Array.isArray(member.assigned_coder_emails) ? member.assigned_coder_emails : [];
      return emails.some((email) => typeof email === 'string' && email.toLowerCase() === normalizedEmail);
    });
    return matched.length > 0 ? matched : worklist;
  }, [worklist, userEmail]);

  const displayedMembers = assignedToMe.slice(0, 12);

  const renderBadge = (status) => {
    const variant = STATUS_BADGES[status] || STATUS_BADGES.default;
    return <Badge bg={variant}>{status || 'unknown'}</Badge>;
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <PortalHero
        align="left"
        title="Coding worklists"
        subtitle={user?.email ? `Welcome back, ${user.email}. Here is your current queue.` : 'Sign in to manage your coding assignments.'}
        actions={(
          <div className="d-flex flex-wrap gap-2">
            <Button variant="light" onClick={() => navigate('/coding/members')}>
              Members
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/coding/providers')}>
              Providers
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/admin/coding-assignments')}>
              Coding assignments
            </Button>
          </div>
        )}
        wave={false}
      />

      <div className="coding-content">
        <main className="sfdc-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="sfdc-card sfdc-card--full">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3">
              <div>
                <h2 className="h5 mb-1">Your worklist</h2>
                <div className="text-muted">
                  {user?.email ? 'Assignments routed to your queue.' : 'Showing latest coding members.'}
                </div>
              </div>
              <div className="d-flex gap-2 mt-2 mt-md-0">
                <Button variant="outline-secondary" size="sm" onClick={() => navigate('/coding/members')}>
                  Open members page
                </Button>
                <Button variant="outline-primary" size="sm" disabled={loading || !canQuery} onClick={() => void loadWorklist()}>
                  {loading ? <Spinner animation="border" size="sm" /> : 'Refresh'}
                </Button>
              </div>
            </div>
            {!isAuthenticated && (
              <Alert variant="warning">You must be logged in to view your personalized worklist.</Alert>
            )}
            {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
            <div className="table-responsive">
              <Table hover responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Member Key</th>
                    <th>Status</th>
                    <th>Line of Business</th>
                    <th>PCP</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        <Spinner animation="border" />
                      </td>
                    </tr>
                  )}
                  {!loading && displayedMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No members assigned yet.
                      </td>
                    </tr>
                  )}
                  {displayedMembers.map((member) => {
                    const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || '-';
                    return (
                      <tr key={member.id}>
                        <td>{name}</td>
                        <td>{member.member_key}</td>
                        <td>{renderBadge(member.status)}</td>
                        <td>{member.line_of_business || '-'}</td>
                        <td>{member.pcp_name || '-'}</td>
                        <td className="text-end">
                          <Button variant="link" size="sm" onClick={() => navigate(`/coding/members/${member.id}`)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            {assignedToMe.length > displayedMembers.length && (
              <div className="text-center mt-3">
                <Button variant="outline-secondary" size="sm" onClick={() => navigate('/coding/members')}>
                  View full queue
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default CodingLandingPage;
