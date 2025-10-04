import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Button, Form, InputGroup, Spinner, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { getRecentRides } from '../../services/rideBookingService';
import '../../styles/rideBooking.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

const formatDateTime = (iso) => {
  if (!iso) return '�';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '�';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatCurrency = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '�';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
};

const RideBookingLandingPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadRides = useCallback((focusId) => {
    try {
      setLoading(true);
      setError(null);
      const results = getRecentRides();
      setRides(results);
      setLastUpdated(new Date());
      if (!results.length) {
        setSelectedRideId(null);
      } else {
        setSelectedRideId((prev) => {
          if (focusId) return focusId;
          if (prev && results.some((ride) => ride.id === prev)) return prev;
          return results[0].id;
        });
      }
    } catch (err) {
      console.error('Unable to load rides', err);
      setError('Unable to load recent rides.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const availableCompanies = useMemo(() => {
    return Array.from(new Set(rides.map((ride) => ride.rideType)));
  }, [rides]);

  const filteredRides = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rides.filter((ride) => {
      const matchesStatus = statusFilter === 'all' || ride.status === statusFilter;
      const matchesCompany = companyFilter === 'all' || ride.rideType === companyFilter;
      if (!matchesStatus || !matchesCompany) return false;
      if (!term) return true;
      const haystack = [
        ride.memberId,
        ride.firstName,
        ride.lastName,
        ride.pickup,
        ride.pickupAddress,
        ride.dropoff,
        ride.dropoffAddress,
        ride.rideType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rides, statusFilter, companyFilter, searchTerm]);

  useEffect(() => {
    if (!filteredRides.length) {
      setSelectedRideId(null);
      return;
    }
    setSelectedRideId((prev) => {
      if (prev && filteredRides.some((ride) => ride.id === prev)) {
        return prev;
      }
      return filteredRides[0].id;
    });
  }, [filteredRides]);

  const selectedRide = useMemo(() => {
    return filteredRides.find((ride) => ride.id === selectedRideId) || null;
  }, [filteredRides, selectedRideId]);

  return (
    <div className="ride-booking">
      <PortalUtilityBar />
      <PortalHero
        align="left"
        title="Ride booking overview"
        subtitle="Review the latest transportation activity and drill into ride details."
        actions={(
          <div className="d-flex flex-wrap gap-2">
            <Button variant="light" onClick={() => navigate('/RideBooking/book')}>
              Book a ride
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/RideBooking/partners')}>
              Manage partners
            </Button>
          </div>
        )}
        wave={false}
      />

      <div className="ride-booking__shell">
        <section className="ride-booking__history">
          <div className="ride-booking__history-header">
            <div>
              <h2 className="h4 mb-1">Recent rides</h2>
              <div className="ride-booking__timestamp">
                Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '�'}
              </div>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={() => loadRides()} disabled={loading}>
              {loading ? <Spinner size="sm" animation="border" /> : 'Refresh'}
            </Button>
          </div>

          <div className="ride-booking__filters">
            <div>
              <Form.Label htmlFor="ride-search">Search</Form.Label>
              <InputGroup size="sm">
                <InputGroup.Text>Search</InputGroup.Text>
                <Form.Control
                  id="ride-search"
                  type="search"
                  placeholder="Member, address, or partner"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </InputGroup>
            </div>
            <div>
              <Form.Label>Status</Form.Label>
              <Form.Select
                size="sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </div>
            <div>
              <Form.Label>Partner</Form.Label>
              <Form.Select
                size="sm"
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
              >
                <option value="all">All partners</option>
                {availableCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </Form.Select>
            </div>
            <div className="d-flex flex-column">
              <Form.Label>&nbsp;</Form.Label>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setCompanyFilter('all');
                  loadRides();
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="ride-booking__tablewrap">
            <Table striped hover responsive size="sm" className="ride-booking__table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Pickup</th>
                  <th>Dropoff</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-4">Loading rides...</td>
                  </tr>
                )}
                {!loading && filteredRides.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      No rides match your filters. Try adjusting your search or schedule a new ride.
                    </td>
                  </tr>
                )}
                {!loading && filteredRides.map((ride) => {
                  const isActive = ride.id === selectedRideId;
                  return (
                    <tr
                      key={ride.id}
                      className={isActive ? 'is-active' : ''}
                      onClick={() => setSelectedRideId(ride.id)}
                    >
                      <td>
                        {ride.firstName} {ride.lastName}
                        <br />
                        <span className="text-muted small">{ride.memberId}</span>
                      </td>
                      <td>{ride.pickup}</td>
                      <td>{ride.dropoff}</td>
                      <td>
                        <span className={`ride-booking__status ride-booking__status--${ride.status}`}>
                          {ride.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{formatDateTime(ride.scheduledPickup)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <div className="ride-booking__detail">
            {selectedRide ? (
              <div className="ride-booking__detail-card">
                <header>
                  <div>
                    <h3 className="h5 mb-1">
                      {selectedRide.firstName} {selectedRide.lastName}
                    </h3>
                    <div className="text-muted small">Member ID {selectedRide.memberId}</div>
                  </div>
                  <span className={`ride-booking__status ride-booking__status--${selectedRide.status}`}>
                    {selectedRide.status.replace('_', ' ')}
                  </span>
                </header>
                <dl className="ride-booking__detail-grid">
                  <div>
                    <dt>Partner</dt>
                    <dd>{selectedRide.rideType}</dd>
                  </div>
                  <div>
                    <dt>Pickup time</dt>
                    <dd>{formatDateTime(selectedRide.scheduledPickup)}</dd>
                  </div>
                  <div>
                    <dt>Estimated drop-off</dt>
                    <dd>{formatDateTime(selectedRide.estimatedDropoff)}</dd>
                  </div>
                  <div>
                    <dt>Estimated cost</dt>
                    <dd>{formatCurrency(selectedRide.costUsd)}</dd>
                  </div>
                  <div>
                    <dt>Pickup location</dt>
                    <dd>
                      {selectedRide.pickup}
                      <br />
                      <span className="text-muted small">{selectedRide.pickupAddress}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Dropoff location</dt>
                    <dd>
                      {selectedRide.dropoff}
                      <br />
                      <span className="text-muted small">{selectedRide.dropoffAddress}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="ride-booking__detail-empty">Select a ride to view details.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default RideBookingLandingPage;
