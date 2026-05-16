import { ROUTES } from "../../../constants/routes";

export const PORTAL_NAV_ITEMS = [
  {
    key: "portal",
    label: "Portal Overview",
    href: ROUTES.PORTAL.LANDING,
    match: (path) => path === ROUTES.PORTAL.LANDING,
  },
  {
    key: "member360-lab",
    label: "Nexora Lab Member360",
    href: ROUTES.MEMBER360_LAB.DASHBOARD,
    match: (path) =>
      path === ROUTES.MEMBER360_LAB.DASHBOARD ||
      path.startsWith(`${ROUTES.MEMBER360_LAB.DASHBOARD}/`) ||
      path === ROUTES.MEMBER_360.LANDING,
  },
  {
    key: "coding",
    label: "Coding Worklists",
    href: ROUTES.CODING.LANDING,
    match: (path) =>
      path === ROUTES.CODING.LANDING || path.startsWith(`${ROUTES.CODING.LANDING}/`),
  },
  {
    key: "chat",
    label: "Nexora Chat",
    href: ROUTES.CHAT,
    match: (path) => path === ROUTES.CHAT,
  },
];
