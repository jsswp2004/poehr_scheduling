import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import ClinicalNotesPanel from "../components/ClinicalNotesPanel";
import BackButton from "../components/BackButton";
import { getValidToken, clearAuthData } from "../utils/auth";

// Import custom hooks (same ones PatientDetailPage uses for patient lookup
// and role gating -- this page needs neither the doctors nor organizations
// data, since it only renders the patient's name and the notes panel).
import { usePatientData } from "../hooks/usePatientData";
import { useRoleValidation } from "../hooks/useRoleValidation";

/**
 * Standalone Clinical Documentation page for a single patient.
 *
 * This used to be a panel embedded at the bottom of PatientDetailPage.
 * It's now its own route (/patients/:id/notes) so doctors/nurses can jump
 * straight to charting a patient without the full patient-info form in
 * the way. PatientsTable links here via a dedicated "Clinical Notes"
 * action button.
 */
function ClinicalNotesPage() {
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

            <ClinicalNotesPanel
                patientId={patient.user_id || patient.id}
                patientName={`${patient.first_name} ${patient.last_name}`}
            />
        </Box>
    );
}

export default ClinicalNotesPage;