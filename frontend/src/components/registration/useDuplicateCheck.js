import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";
import { isPossibleMatch, parseDob } from "./registerHelpers";

// Looks for patients who may already be registered, once first name, last name and a real date of
// birth are typed. Returns the matches not yet dismissed and a way to dismiss them.
export default function useDuplicateCheck({ first, last, dob, enabled = true }) {
  const [matches, setMatches] = useState([]);
  const [dismissedKey, setDismissedKey] = useState("");
  const [checking, setChecking] = useState(false);
  const run = useRef(0);

  const iso = parseDob(dob);
  const key = `${String(first || "").trim().toLowerCase()}|${String(last || "").trim().toLowerCase()}|${iso || ""}`;
  const ready = enabled && String(first || "").trim().length >= 2 && String(last || "").trim().length >= 2 && !!iso;

  useEffect(() => {
    if (!ready) {
      setMatches([]);
      return undefined;
    }
    const id = ++run.current;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const token = await getValidToken();
        if (!token) return;
        const res = await axios.get(apiEndpoints.patients, {
          headers: { Authorization: `Bearer ${token}` },
          params: { search: String(last).trim(), dob: iso, page_size: 5 },
        });
        if (id !== run.current) return;
        const rows = res.data?.results || res.data || [];
        setMatches(rows.filter((p) => isPossibleMatch(p, first, last)).slice(0, 3));
      } catch (err) {
        if (id === run.current) setMatches([]);
      } finally {
        if (id === run.current) setChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const open = matches.length > 0 && dismissedKey !== key;
  return {
    matches: open ? matches : [],
    checking,
    dismiss: () => setDismissedKey(key),
    reset: () => {
      setMatches([]);
      setDismissedKey("");
    },
  };
}
