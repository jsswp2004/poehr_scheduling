import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { BuilderShell } from "../components/builders/BuilderShell";
import TriageSettings from "../components/triage/TriageSettings";

/** Triage Settings: the clinic's recheck times, age table and fever limits. Admin/system_admin only; the API enforces the same rule. */
function TriageSettingsPage() {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            navigate("/login");
            return;
        }
        try {
            const role = jwtDecode(token).role || "";
            if (role !== "admin" && role !== "system_admin") {
                navigate("/admin");
                return;
            }
        } catch (err) {
            navigate("/login");
            return;
        }
        setChecking(false);
    }, [navigate]);

    if (checking) return null;

    return (
        <BuilderShell
            title="Triage Settings"
            subtitle="The clinic's recheck times, age table, fever limits and safety alerts"
            maxWidth={1100}
        >
            <TriageSettings />
        </BuilderShell>
    );
}

export default TriageSettingsPage;
