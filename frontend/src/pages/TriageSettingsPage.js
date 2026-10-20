import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Container, Typography } from "@mui/material";
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
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
                Triage Settings
            </Typography>
            <TriageSettings />
        </Container>
    );
}

export default TriageSettingsPage;
