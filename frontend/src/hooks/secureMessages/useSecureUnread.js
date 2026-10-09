import { useCallback, useEffect, useState } from "react";
import { secure } from "../../components/secureMessages/secureApi";
import useLiveRefresh from "./useLiveRefresh";

const NONE = { unread: 0, urgent: 0, threads: 0 };

/**
 * The unread count for the header badge. If the server says this person may not use secure messaging
 * (403), it shows nothing and stops asking.
 */
export default function useSecureUnread(enabled) {
  const [counts, setCounts] = useState(NONE);
  const [denied, setDenied] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await secure.unread();
      setCounts({ unread: data.unread || 0, urgent: data.urgent || 0, threads: data.threads || 0 });
    } catch (err) {
      setCounts(NONE);
      if (err && err.response && err.response.status === 403) setDenied(true);
    }
  }, []);
  const active = !!enabled && !denied;
  useEffect(() => {
    if (active) load();
  }, [active, load]);
  useLiveRefresh(load, { enabled: active });
  return { ...counts, denied, load };
}
