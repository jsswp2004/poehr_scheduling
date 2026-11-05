import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import OrganizationSwitcher from "./OrganizationSwitcher";
import { loadActingOrg, useActingStatus } from "../utils/actingOrg";
import { currentSignIn } from "../utils/landing";

/**
 * Asks a system administrator which organization they are working in, after every sign-in and on any page
 * until they have chosen. It cannot be dismissed. Everyone else never sees it.
 */
export default function OrganizationPrompt() {
  const status = useActingStatus();
  const { pathname } = useLocation();
  const me = currentSignIn();
  const isSystemAdmin = !!me && me.role === "system_admin";

  useEffect(() => {
    if (isSystemAdmin && status === "unknown") loadActingOrg();
  }, [isSystemAdmin, status, pathname]);

  if (!isSystemAdmin || status !== "none") return null;
  return <OrganizationSwitcher open required />;
}
