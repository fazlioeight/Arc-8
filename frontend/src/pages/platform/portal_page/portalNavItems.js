export const PORTAL_NAV_ITEMS = [
  {
    key: "portal",
    label: "Portal Overview",
    href: "/portalPage",
    match: (path) => path === "/portalPage",
  },
  {
    key: "member-360",
    label: "Member 360",
    href: "/member-360",
    match: (path) => path === "/member-360",
  },
  {
    key: "coding",
    label: "Coding Worklists",
    href: "/coding",
    match: (path) => path === "/coding" || path.startsWith("/coding/"),
  },
];

