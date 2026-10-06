import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Container, Typography } from "@mui/material";
import LocationManager from "../components/locations/LocationManager";

/**
 * Location Manager: builds the location tree (location > unit > room > bed) that
 * Registration and Scheduling point at. Admin/system_admin only; the API enforces
 * the same rule server-side.
 */
function LocationManagerPage() {
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
                Location Manager
            </Typography>
            <LocationManager />
        </Container>
    );
}

export default LocationManagerPage;
