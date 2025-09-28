import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, InputGroup, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { getRecentRides } from '../../services/rideBookingService';

const RideBookingLandingPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadRides = () => {
    const results = getRecentRides();
    setRides(results);
  };

  useEffect(() => {
    loadRides();
  }, []);

  const filteredRides = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rides;
    return rides.filter(ride => {
      const haystack = [ride.memberId, ride.firstName, ride.lastName, ride.rideType]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      return haystack.some(value => value.includes(term));
    });
  }, [rides, searchTerm]);

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <div className="coding-content">
        <section className="sfdc-hero">
          <div className="sfdc-hero__content">
            <h1 className="sfdc-hero__title">Ride Booking Overview</h1>
            <p className="sfdc-hero__subtitle">
              Review the most recent rides scheduled for members and quickly jump in to book another ride.
            </p>
            <div className="d-flex flex-wrap justify-content-center gap-2 mt-2">
              <Button variant="light" onClick={() => navigate('/RideBooking/book')}>
                Book a ride
              </Button>
            </div>
          </div>
        </section>

        <main className="sfdc-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="sfdc-card sfdc-card--full">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3">
              <div>
                <h2 className="h5 mb-1">Recent rides</h2>
                <div className="text-muted">Showing the latest ride bookings across the team.</div>
              </div>
              <div className="d-flex gap-2 mt-3 mt-md-0">
                <InputGroup size="sm">
                  <InputGroup.Text>Search</InputGroup.Text>
                  <Form.Control
                    type="search"
                    placeholder="Search by member or company"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                  />
                </InputGroup>
                <Button variant="outline-primary" size="sm" onClick={loadRides}>
                  Refresh
                </Button>
              </div>
            </div>
            <div className="table-responsive">
              <Table hover responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Member ID</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Ride Share Company</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRides.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No rides found. Try adjusting your search or booking a new ride.
                      </td>
                    </tr>
                  ) : (
                    filteredRides.map(ride => (
                      <tr key={ride.id}>
                        <td>{ride.memberId}</td>
                        <td>{ride.firstName}</td>
                        <td>{ride.lastName}</td>
                        <td>{ride.rideType}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default RideBookingLandingPage;
