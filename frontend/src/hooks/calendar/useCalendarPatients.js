/**
 * Patients offered by the appointment dialog's "Search Patient" box.
 *
 * This is deliberately NOT the Patients page list: that list is narrowed by the remembered care
 * setting (Ambulatory by default), which hid patients such as telehealth patients from the
 * calendar. Here every patient is searchable, and the search runs on the server as you type.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../config/api";
import { getValidToken } from "../../utils/auth";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 250;

export const useCalendarPatients = (userRole) => {
  const [patients, setPatients] = useState([]);
  const [term, setTerm] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    if (userRole === "patient") {
      setPatients([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const token = await getValidToken();
        if (!token) return;
        const value = token.access_token || token;
        const res = await axios.get(`${API_BASE_URL}/api/users/patients/`, {
          headers: { Authorization: `Bearer ${value}` },
          params: { search: term, page_size: PAGE_SIZE }, // no care_setting: all patients
        });
        if (ticket !== latest.current) return; // a newer search is already on its way
        setPatients((res.data?.results || []).map((p) => ({ ...p, full_name: `${p.first_name} ${p.last_name}` })));
      } catch (err) {
        if (ticket === latest.current) setPatients([]);
      }
    }, term ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [term, userRole]);

  const searchPatients = useCallback((value) => setTerm((value || "").trim()), []);
  return { patients, searchPatients };
};
