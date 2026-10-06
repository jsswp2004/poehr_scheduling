import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import OrdersPanel from "../components/OrdersPanel";
import PatientChartHeader from "../components/patientHeader/PatientChartHeader";
import BackButton from "../components/BackButton";
import { getValidToken, clearAuthData } from "../utils/auth";
import { usePatientData } from "../hooks/usePatientData";
import { useRoleValidation } from "../hooks/useRoleValidation";

/**
 * Orders page for a single patient (/patients/:id/orders). Mirrors
 * ClinicalNotesPage: look up the patient, validate the role, render the panel.
 */
function OrdersPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const patientData = usePatientData(navigate);
    const roleValidation = useRoleValidation(navigate);

    const { patient } = patientData;
    const fetchPatientWithToken = patientData.fetchPatientWithToken;
    const validateRoleWithToken = roleValidation.validateRoleWithToken;

    useEffect(() => {
        getValidToken().then(async (token) => {
            if (!token) {
                clearAuthData();
                navigate("/login");
                return;
            }

            Promise.allSettled([
                validateRoleWithToken(token),
                fetchPatientWithToken(id, token),
            ]).then((results) => {
                const operations = ["role validation", "patient fetch"];
                results.forEach((result, index) => {
                    if (result.status === "rejected") {
                        console.error(`❌ ${operations[index]} failed:`, result.reason);
                    }
                });
            });
        }).catch((error) => {
            console.error("❌ Token retrieval failed:", error);
            clearAuthData();
            navigate("/login");
        });
    }, [id, navigate, fetchPatientWithToken, validateRoleWithToken]);

    if (!patient) return <div>Loading patient details...</div>;

    return (
        <Box
            sx={{
                mt: 0,
                boxShadow: 2,
                borderRadius: 2,
                bgcolor: "background.paper",
                p: 3,
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                }}
            >
                <Typography variant="h5">
                    Orders: {patient.first_name} {patient.last_name}
                </Typography>
                <BackButton to="/patients" />
            </Box>

            <PatientChartHeader patientId={patient.user_id || patient.id} />

            <OrdersPanel patientId={patient.user_id || patient.id} />
        </Box>
    );
}

export default OrdersPage;
