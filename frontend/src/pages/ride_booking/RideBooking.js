import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import PortalUtilityBar from "../../components/PortalUtilityBar";
import "../portal_page/portalPage.sfdc.css";
import { addRideRecord } from "../../services/rideBookingService";

const RideBooking = () => {
  const { isAuthenticated } = useContext(AuthContext) || {};
  const navigate = useNavigate();

  const [memberId, setMemberId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [rideType, setRideType] = useState("Uber");
  const [status, setStatus] = useState("");

  const resetForm = () => {
    setMemberId("");
    setFirstName("");
    setLastName("");
    setPickup("");
    setDropoff("");
    setPickupAddress("");
    setDropoffAddress("");
    setRideType("Uber");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const record = addRideRecord({
      memberId,
      firstName,
      lastName,
      rideType,
      pickup,
      dropoff,
      pickupAddress,
      dropoffAddress,
    });
    setStatus(
      `Ride booked with ${record.rideType}!\nMember ID: ${record.memberId}\nMember: ${record.firstName} ${record.lastName}\nPickup: ${record.pickup} (${record.pickupAddress})\nDropoff: ${record.dropoff} (${record.dropoffAddress})`
    );
    resetForm();
  };

  return (
    <>
      {isAuthenticated && <PortalUtilityBar />}
      <div className="container py-5" style={{ maxWidth: 520, margin: "auto" }}>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="mb-0">Book a Ride</h2>
          <button
            type="button"
            className="btn btn-link"
            onClick={() => navigate("/RideBooking")}
          >
            View recent rides
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="memberId" className="form-label">
              Member ID
            </label>
            <input
              type="text"
              className="form-control"
              id="memberId"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="firstName" className="form-label">
              First Name
            </label>
            <input
              type="text"
              className="form-control"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="lastName" className="form-label">
              Last Name
            </label>
            <input
              type="text"
              className="form-control"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="pickup" className="form-label">
              Pickup Location (Facility or Name)
            </label>
            <input
              type="text"
              className="form-control"
              id="pickup"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="pickupAddress" className="form-label">
              Pickup Address
            </label>
            <input
              type="text"
              className="form-control"
              id="pickupAddress"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="dropoff" className="form-label">
              Dropoff Location (Facility or Name)
            </label>
            <input
              type="text"
              className="form-control"
              id="dropoff"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="dropoffAddress" className="form-label">
              Dropoff Address
            </label>
            <input
              type="text"
              className="form-control"
              id="dropoffAddress"
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="rideType" className="form-label">
              Ride Share Company
            </label>
            <select
              className="form-select"
              id="rideType"
              value={rideType}
              onChange={(e) => setRideType(e.target.value)}
            >
              <option value="Uber">Uber</option>
              <option value="Lyft">Lyft</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary w-100">
            Book Ride
          </button>
        </form>
        {status && (
          <div className="alert alert-success mt-4" role="alert">
            <pre className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {status}
            </pre>
          </div>
        )}
      </div>
    </>
  );
};

export default RideBooking;
