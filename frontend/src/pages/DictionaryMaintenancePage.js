import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { BuilderShell } from "../components/builders/BuilderShell";
import RegistrationDictionaries from "../components/registration/RegistrationDictionaries";
import DictionaryManager from "../components/noteBuilder/DictionaryManager";
import { API_BASE_URL } from "../config/api";

const TABS = [
  { key: "registration", label: "Registration lists" },
  { key: "clinical", label: "Clinical lists" },
  { key: "roles", label: "Roles" },
];

// Roles are shared by every organization, so only a system administrator can change them (System Dictionaries).
// Administrators can see them here.
function RolesPanel({ canEdit }) {
  const navigate = useNavigate();
  const [dict, setDict] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    axios.get(`${API_BASE_URL}/api/users/dictionaries/roles/`)
      .then((r) => alive && setDict(r.data))
      .catch((e) => alive && setError(e.response?.data?.detail || "Could not load the roles."));
    return () => { alive = false; };
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!dict) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 260 }}>
          The roles people can be given. They are shared by every organization.
          {canEdit ? " You can add, rename and reorder them in System Dictionaries." : " Only a system administrator can change them."}
        </Typography>
        {canEdit && <Button variant="contained" onClick={() => navigate("/system-dictionaries")}>Edit roles</Button>}
      </Box>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Role</TableCell>
              <TableCell>Stored value</TableCell>
              <TableCell>Acts like</TableCell>
              <TableCell>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dict.entries.map((e) => (
              <TableRow key={e.id} sx={{ opacity: e.is_active ? 1 : 0.55 }}>
                <TableCell>{e.label}{!e.is_active && " (inactive)"}</TableCell>
                <TableCell><code>{e.value}</code></TableCell>
                <TableCell>{e.behaves_like && e.behaves_like !== e.value ? e.behaves_like : ""}</TableCell>
                <TableCell>{e.is_locked ? <Chip size="small" label="Built in" /> : <Chip size="small" color="primary" label="Custom" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

// Dictionary Maintenance: every list behind the app's dropdowns, in one place, for administrators.
export default function DictionaryMaintenancePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("registration");
  const [role, setRole] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }
    let r = "";
    try { r = jwtDecode(token).role || ""; } catch (e) { r = ""; }
    if (r !== "admin" && r !== "system_admin") { navigate("/admin"); return; }
    setRole(r);
  }, [navigate]);

  if (!role) return null;
  return (
    <BuilderShell
      title="Dictionaries"
      subtitle="Every list behind the app's dropdowns. Add, rename, reorder or switch off items; inactive items stay on old records but are not offered again."
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      maxWidth={1280}
    >
      {tab === "registration" && <RegistrationDictionaries />}
      {tab === "clinical" && <DictionaryManager />}
      {tab === "roles" && <RolesPanel canEdit={role === "system_admin"} />}
    </BuilderShell>
  );
}
