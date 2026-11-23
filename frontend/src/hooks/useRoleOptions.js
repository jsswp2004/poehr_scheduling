import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

// The roles an existing profile can be switched to. These come from the Roles dictionary (System Dictionaries),
// limited to the built-in (locked) entries because changing a profile's role only accepts built-in role values.
// If the dictionary cannot be loaded, this built-in list is used.
export const BUILT_IN_ROLE_OPTIONS = [
  { value: "patient", label: "Patient" },
  { value: "receptionist", label: "Receptionist" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "admin", label: "Admin" },
  { value: "registrar", label: "Registrar" },
  { value: "system_admin", label: "System Admin" },
  { value: "staff", label: "Staff" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "pharmacy_tech", label: "Pharmacy Assistant" },
  { value: "ext_pharmacist", label: "External Pharmacist" },
  { value: "ext_pharmacy_admin", label: "External Pharmacy Admin" },
  { value: "ext_lab_tech", label: "External Medical Technologist" },
  { value: "ext_lab_pathologist", label: "External Pathologist" },
  { value: "ext_lab_admin", label: "External Lab Admin" },
];

export default function useRoleOptions() {
  const [options, setOptions] = useState(BUILT_IN_ROLE_OPTIONS);
  useEffect(() => {
    let alive = true;
    axios
      .get(`${API_BASE_URL}/api/users/dictionaries/roles/`)
      .then((res) => {
        const list = (res.data.entries || [])
          .filter((e) => e.is_active && e.is_locked)
          .map((e) => ({ value: e.value, label: e.label }));
        if (alive && list.length) setOptions(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return options;
}
