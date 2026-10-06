import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Container, Typography } from "@mui/material";
import StatusBoardBuilder from "../components/edBoard/StatusBoardBuilder";

/**
 * Status Board Builder: edit the ED board's columns, statuses, colors and staff lists and keep saved versions.
 * Admin/system_admin only; the API enforces the same rule server-side.
 */
function StatusBoardBuilderPage() {
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
        <Container maxWidth="xl" sx={{ py: 3 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
                Status Board Builder
            </Typography>
            <StatusBoardBuilder />
        </Container>
    );
}

export default StatusBoardBuilderPage;
