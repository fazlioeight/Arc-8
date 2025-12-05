import { ROUTES } from "../../../constants/routes";

export const CODING_NAV_ITEMS = [
  { key: "overview", label: "Overview", href: ROUTES.CODING.LANDING },
  { key: "platform", label: "Coder Platform", href: ROUTES.CODING.PLATFORM },
  { key: "review", label: "Review Dashboard", href: ROUTES.CODING.REVIEW_DASHBOARD },
  { key: "group", label: "Group Dashboard", href: ROUTES.CODING.GROUP_DASHBOARD },
  { key: "members", label: "Members", href: ROUTES.CODING.MEMBERS },
  { key: "providers", label: "Providers", href: ROUTES.CODING.PROVIDERS },
];

export default CODING_NAV_ITEMS;
