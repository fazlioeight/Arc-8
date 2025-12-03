import { ROUTES } from "../../../constants/routes";

export const RIDE_NAV_ITEMS = [
  { key: "ride-overview", label: "Ride overview", href: ROUTES.RIDE_BOOKING.LANDING },
  { key: "ride-book", label: "Book a ride", href: ROUTES.RIDE_BOOKING.BOOK },
  { key: "ride-partners", label: "Partner calendars", href: ROUTES.RIDE_BOOKING.PARTNERS },
  { key: "ride-payments", label: "Payments & billing", href: ROUTES.RIDE_BOOKING.PAYMENTS },
];

export default RIDE_NAV_ITEMS;
