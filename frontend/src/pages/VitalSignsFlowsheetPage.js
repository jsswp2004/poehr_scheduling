import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import VitalSignsFlowsheetPanel from "../components/VitalSignsFlowsheetPanel";
import BackButton from "../components/BackButton";
import { getValidToken, clearAuthData } from "../utils/auth";

import { usePatientData } from "../hooks/usePatientData";
import { useRoleValidation } from "../hooks/useRoleValidation";

/**
 * Standalone Vital Signs Flowsheet page for a single patient
 * (/patients/:id/flowsheet), reached from the "Vital Signs Flowsheet" action
 * icon on the Patients table -- mirrors ClinicalNotesPage's shape exactly,
 * since both need the same patient lookup and role gating and nothing else.
 */
function VitalSignsFlowsheetPage() {
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
                    {patient.first_name} {patient.last_name}
                </Typography>
                <BackButton to={`/patients/${id}`} />
            </Box>

            <VitalSignsFlowsheetPanel
                patientId={patient.user_id || patient.id}
                patientName={`${patient.first_name} ${patient.last_name}`}
            />
        </Box>
    );
}

export default VitalSignsFlowsheetPage;
