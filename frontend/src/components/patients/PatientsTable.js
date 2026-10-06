import React from 'react';
import {
    Box,
    Typography,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    Pagination,
    CircularProgress,
} from '@mui/material';
import {
    Visibility as VisibilityIcon,
    Delete as DeleteIcon,
    Assignment as AssignmentIcon,
    MonitorHeart as MonitorHeartIcon,
    PlaylistAddCheck as OrdersIcon,
    Science as LabIcon,
    Hotel as AdmitIcon,
    SwapHoriz as TransferIcon,
    ExitToApp as DischargeIcon,
} from '@mui/icons-material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faEnvelope,
    faSms,
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import SearchField from './SearchField';

function PatientsTable({
    patients,
    loading,
    search,
    setSearch,
    provider,
    setProvider,
    providers,
    page,
    setPage,
    totalPages,
    onSendText,
    onOpenEmailModal,
    onDelete,
    userRole,
    selectedId = null,
    onSelect = null,
    onOpenChart = null,
    careSetting = '',
    onAdmit = null,
    onTransfer = null,
    onDischarge = null,
}) {
    const navigate = useNavigate();
    // On the Patients page the chart opens in place (under the patient header). Anywhere else it falls back to the standalone pages.
    const openChart = (patient, chartTab, path) => {
        if (onOpenChart) onOpenChart(patient, chartTab);
        else navigate(path);
    };
    // Clinical Notes and the Flowsheet are gated server-side to
    // doctor/nurse/admin/system_admin (see CanAccessClinicalNotes /
    // CanAccessVitalSignsFlowsheets) -- schedulers/registrars and any other
    // role would just hit a 403 if they clicked through, so their action
    // icons are hidden here rather than shown and then denied.
    const canAccessClinicalDocs = ["doctor", "nurse", "admin", "system_admin"].includes(
        userRole
    );

    // Admit / transfer / discharge are done by the front-line roles (the server enforces the same list).
    const canAdmit = ["doctor", "nurse", "registrar", "admin", "system_admin"].includes(userRole);
    const inpatientView = careSetting === 'acute';
    // Transfer and Discharge apply to anyone in a bed or waiting in the ED, as well as inpatients
    const inHouseView = careSetting === 'acute' || careSetting === 'emergency';
    const columnCount = 5;

    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Loading patients...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Search and Filter Controls */}
            <Box
                sx={{
                    display: 'flex',
                    gap: 2,
                    mb: 3,
                    mt: 2,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}
            >
                <SearchField
                    label="Search patients..."
                    onSearchChange={setSearch}
                    initialValue={search}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 250 }}
                />
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Filter by Provider</InputLabel>
                    <MUISelect
                        value={provider}
                        label="Filter by Provider"
                        onChange={(e) => setProvider(e.target.value)}
                    >
                        <MenuItem value="">All Providers</MenuItem>
                        {providers && providers.length > 0 ? (
                            providers.map((p) => (
                                <MenuItem key={p.id} value={p.id}>
                                    Dr. {p.first_name} {p.last_name}
                                </MenuItem>
                            ))
                        ) : (
                            <MenuItem disabled>No providers available</MenuItem>
                        )}
                    </MUISelect>
                </FormControl>
            </Box>

            {/* Patients Table */}
            <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                            {inpatientView ? (
                                <>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Location</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Admitted</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Attending</TableCell>
                                </>
                            ) : (
                                <>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                                </>
                            )}
                            <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {patients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columnCount} sx={{ textAlign: 'center', py: 4 }}>
                                    {inpatientView
                                        ? 'No inpatients right now. Admit a patient from the Ambulatory or Emergency list with the bed icon.'
                                        : 'No patients found'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            patients.map((patient) => (
                                <TableRow
                                    key={patient.id}
                                    hover
                                    selected={selectedId != null && String(patient.user_id) === String(selectedId)}
                                    aria-selected={selectedId != null && String(patient.user_id) === String(selectedId)}
                                    data-testid={`patient-row-${patient.user_id}`}
                                    onClick={() => onSelect && onSelect(patient)}
                                    sx={{
                                        '&:hover': { bgcolor: '#f5f5f5' },
                                        '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#cfe8fc' },
                                        cursor: 'pointer',
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {patient.full_name}
                                        </Typography>
                                    </TableCell>
                                    {inpatientView ? (
                                        <>
                                            <TableCell>
                                                <Typography variant="body2" data-testid={`patient-location-${patient.user_id}`}>
                                                    {patient.current_visit?.location || 'No bed assigned'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {patient.current_visit?.arrival_time
                                                        ? new Date(patient.current_visit.arrival_time).toLocaleString()
                                                        : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {patient.current_visit?.attending_provider_name || 'Not assigned'}
                                                </Typography>
                                            </TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {patient.email || 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {patient.phone_number || 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {patient.provider_name || 'Not assigned'}
                                                </Typography>
                                            </TableCell>
                                        </>
                                    )}
                                    <TableCell sx={{ textAlign: 'center' }}>
                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.user_id}`); }}
                                                    sx={{ color: 'primary.main' }}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>

                                            {canAdmit && inHouseView && onTransfer && (
                                                <Tooltip title="Transfer">
                                                    <IconButton
                                                        size="small"
                                                        aria-label={`Transfer ${patient.full_name}`}
                                                        onClick={(e) => { e.stopPropagation(); onTransfer(patient); }}
                                                        sx={{ color: '#0277bd' }}
                                                    >
                                                        <TransferIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {canAdmit && inHouseView && onDischarge && (
                                                <Tooltip title="Discharge">
                                                    <IconButton
                                                        size="small"
                                                        aria-label={`Discharge ${patient.full_name}`}
                                                        onClick={(e) => { e.stopPropagation(); onDischarge(patient); }}
                                                        sx={{ color: '#ef6c00' }}
                                                    >
                                                        <DischargeIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {canAdmit && !inpatientView && onAdmit && (
                                                <Tooltip title="Admit">
                                                    <IconButton
                                                        size="small"
                                                        aria-label={`Admit ${patient.full_name}`}
                                                        onClick={(e) => { e.stopPropagation(); onAdmit(patient); }}
                                                        sx={{ color: '#00695c' }}
                                                    >
                                                        <AdmitIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {canAccessClinicalDocs && (
                                                <>
                                                    <Tooltip title="Clinical Notes">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); openChart(patient, 'documents', `/patients/${patient.user_id}/notes`); }}
                                                            sx={{ color: 'secondary.main' }}
                                                        >
                                                            <AssignmentIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>

                                                    <Tooltip title="Flowsheet">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); openChart(patient, 'flowsheets', `/patients/${patient.user_id}/flowsheet`); }}
                                                            sx={{ color: '#c2185b' }}
                                                        >
                                                            <MonitorHeartIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>

                                                    <Tooltip title="Orders">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); openChart(patient, 'orders', `/patients/${patient.user_id}/orders`); }}
                                                            sx={{ color: '#2e7d32' }}
                                                        >
                                                            <OrdersIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>

                                                    <Tooltip title="Lab Results">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); openChart(patient, 'results', `/patients/${patient.user_id}/orders#lab-results`); }}
                                                            sx={{ color: '#6a1b9a' }}
                                                        >
                                                            <LabIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}

                                            <Tooltip title="Send Email">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => { e.stopPropagation(); onOpenEmailModal(patient); }}
                                                    sx={{ color: 'success.main' }}
                                                >
                                                    <FontAwesomeIcon icon={faEnvelope} />
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Send SMS">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => { e.stopPropagation(); onSendText(patient); }}
                                                    sx={{ color: 'warning.main' }}
                                                >
                                                    <FontAwesomeIcon icon={faSms} />
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Delete Patient">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => { e.stopPropagation(); onDelete(patient.id); }}
                                                    sx={{ color: 'error.main' }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Pagination */}
            {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, flexShrink: 0 }}>
                    <Pagination
                        count={totalPages}
                        page={page}
                        onChange={(e, newPage) => setPage(newPage)}
                        color="primary"
                        showFirstButton
                        showLastButton
                    />
                </Box>
            )}
        </Box>
    );
}

export default React.memo(PatientsTable);