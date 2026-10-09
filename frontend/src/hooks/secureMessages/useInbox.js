import { useCallback, useEffect, useState } from "react";
import { secure, errorText } from "../../components/secureMessages/secureApi";
import useLiveRefresh from "./useLiveRefresh";

/** The person's conversations, newest first, kept fresh by nudges and a timer. */
export default function useInbox(patient = null) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await secure.threads(patient);
      setThreads(data.threads || []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load your conversations."));
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  useLiveRefresh(load);

  const upsert = useCallback((thread) => setThreads((cur) => [thread, ...cur.filter((t) => t.id !== thread.id)]), []);
  return { threads, loading, error, reload: load, upsert };
}
