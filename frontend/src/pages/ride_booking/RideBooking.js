import React, { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Form, Row, Alert } from 'react-bootstrap';
import { AuthContext } from '../../context/AuthContext';
import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import '../../styles/rideBooking.css';
import '../portal_page/portalPage.sfdc.css';
import { addRideRecord, getRideCompaniesForDate } from '../../services/rideBookingService';
import useGooglePlacesAutocomplete from '../../hooks/useGooglePlacesAutocomplete';

const getLocalDate = () => new Date().toISOString().slice(0, 10);
const getLocalTime = () => new Date().toISOString().slice(11, 16);

const RideBooking = () => {
  const { isAuthenticated } = useContext(AuthContext) || {};
  const navigate = useNavigate();

  const [memberId, setMemberId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [rideOptions, setRideOptions] = useState(() => getRideCompaniesForDate(new Date()));
  const [rideType, setRideType] = useState(() => getRideCompaniesForDate(new Date())[0] || 'Other');
  const [rideDate, setRideDate] = useState(getLocalDate());
  const [rideTime, setRideTime] = useState(getLocalTime());
  const [estimatedCost, setEstimatedCost] = useState('');
  const [formStatus, setFormStatus] = useState(null);

  const pickupAddressInputRef = useRef(null);
  const dropoffAddressInputRef = useRef(null);

  const isPickupAutocompleteReady = useGooglePlacesAutocomplete(
    pickupAddressInputRef,
    setPickupAddress
  );
  const isDropoffAutocompleteReady = useGooglePlacesAutocomplete(
    dropoffAddressInputRef,
    setDropoffAddress
  );

  const refreshRideOptions = () => {
    const options = getRideCompaniesForDate(new Date());
    setRideOptions(options);
    setRideType((current) => (current && options.includes(current) ? current : options[0] || 'Other'));
  };

  const resetForm = () => {
    setMemberId('');
    setFirstName('');
    setLastName('');
    setPickup('');
    setDropoff('');
    setPickupAddress('');
    setDropoffAddress('');
    setRideDate(getLocalDate());
    setRideTime(getLocalTime());
    setEstimatedCost('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormStatus(null);
    const scheduledPickupIso = new Date(`${rideDate}T${rideTime || '08:00'}`).toISOString();
    const record = addRideRecord({
      memberId,
      firstName,
      lastName,
      rideType: rideType || rideOptions[0] || 'Other',
      pickup,
      dropoff,
      pickupAddress,
      dropoffAddress,
      scheduledPickup: scheduledPickupIso,
      costUsd: estimatedCost ? Number(estimatedCost) : undefined,
    });
    setFormStatus(`Ride booked with ${record.rideType} for ${record.firstName} ${record.lastName}.`);
    resetForm();
  };

  return (
    <div className="ride-booking">
      {isAuthenticated && <PortalUtilityBar />}
      <PortalHero
        align="left"
        title="Book a ride"
        subtitle="Enter member details and schedule transportation in a few quick steps."
        actions={(
          <div className="d-flex flex-wrap gap-2">
            <Button variant="light" onClick={() => navigate('/RideBooking')}>
              Recent rides
            </Button>
            <Button variant="outline-light" onClick={() => navigate('/RideBooking/partners')}>
              Manage partners
            </Button>
          </div>
        )}
        wave={false}
      />

      <div className="ride-booking__shell" style={{ maxWidth: 720 }}>
        <section className="ride-booking__form-card">
          <Form onSubmit={handleSubmit}>
            <div className="mb-3">
              <Form.Label htmlFor="memberId">Member ID</Form.Label>
              <Form.Control
                id="memberId"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                required
              />
            </div>
            <Row className="g-3">
              <Col md="6">
                <Form.Label htmlFor="firstName">First name</Form.Label>
                <Form.Control
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </Col>
              <Col md="6">
                <Form.Label htmlFor="lastName">Last name</Form.Label>
                <Form.Control
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </Col>
            </Row>
            <div className="mt-3">
              <Form.Label htmlFor="pickup">Pickup location (facility or name)</Form.Label>
              <Form.Control
                id="pickup"
                value={pickup}
                onChange={(event) => setPickup(event.target.value)}
                required
              />
            </div>
            <div className="mt-3">
              <Form.Label htmlFor="pickupAddress">Pickup address</Form.Label>
              <Form.Control
                id="pickupAddress"
                ref={pickupAddressInputRef}
                autoComplete="off"
                value={pickupAddress}
                onChange={(event) => setPickupAddress(event.target.value)}
                required
              />
              {isPickupAutocompleteReady && (
                <Form.Text>Start typing to search for a verified address.</Form.Text>
              )}
            </div>
            <div className="mt-3">
              <Form.Label htmlFor="dropoff">Dropoff location</Form.Label>
              <Form.Control
                id="dropoff"
                value={dropoff}
                onChange={(event) => setDropoff(event.target.value)}
                required
              />
            </div>
            <div className="mt-3">
              <Form.Label htmlFor="dropoffAddress">Dropoff address</Form.Label>
              <Form.Control
                id="dropoffAddress"
                ref={dropoffAddressInputRef}
                autoComplete="off"
                value={dropoffAddress}
                onChange={(event) => setDropoffAddress(event.target.value)}
                required
              />
              {isDropoffAutocompleteReady && (
                <Form.Text>Start typing to search for a verified address.</Form.Text>
              )}
            </div>
            <Row className="g-3 mt-1">
              <Col md="6">
                <Form.Label htmlFor="rideDate">Ride date</Form.Label>
                <Form.Control
                  id="rideDate"
                  type="date"
                  value={rideDate}
                  onChange={(event) => setRideDate(event.target.value)}
                  required
                />
              </Col>
              <Col md="6">
                <Form.Label htmlFor="rideTime">Pickup time</Form.Label>
                <Form.Control
                  id="rideTime"
                  type="time"
                  value={rideTime}
                  onChange={(event) => setRideTime(event.target.value)}
                  required
                />
              </Col>
            </Row>
            <Row className="g-3 mt-1">
              <Col md="7">
                <Form.Label htmlFor="rideType">Ride partner</Form.Label>
                <div className="d-flex align-items-center gap-2">
                  <Form.Select
                    id="rideType"
                    value={rideType}
                    onChange={(event) => setRideType(event.target.value)}
                    required
                  >
                    {rideOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Form.Select>
                  <Button variant="outline-secondary" size="sm" onClick={refreshRideOptions}>Refresh</Button>
                </div>
              </Col>
              <Col md="5">
                <Form.Label htmlFor="estimatedCost">Estimated cost (optional)</Form.Label>
                <Form.Control
                  id="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimatedCost}
                  onChange={(event) => setEstimatedCost(event.target.value)}
                />
              </Col>
            </Row>
            <Button type="submit" className="btn btn-primary w-100 mt-4">Book ride</Button>
          </Form>
          {formStatus && (
            <Alert variant="success" className="ride-booking__alert mt-3">
              {formStatus}
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
};

export default RideBooking;
