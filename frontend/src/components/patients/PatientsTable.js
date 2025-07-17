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
}) {
    const navigate = useNavigate();

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
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {patients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>
                                    No patients found
                                </TableCell>
                            </TableRow>
                        ) : (
                            patients.map((patient) => (
                                <TableRow
                                    key={patient.id}
                                    sx={{
                                        '&:hover': { bgcolor: '#f5f5f5' },
                                        cursor: 'pointer',
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {patient.full_name}
                                        </Typography>
                                    </TableCell>
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
                                    <TableCell sx={{ textAlign: 'center' }}>
                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => navigate(`/patients/${patient.user_id}`)}
                                                    sx={{ color: 'primary.main' }}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Send Email">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => onOpenEmailModal(patient)}
                                                    sx={{ color: 'success.main' }}
                                                >
                                                    <FontAwesomeIcon icon={faEnvelope} />
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Send SMS">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => onSendText(patient)}
                                                    sx={{ color: 'warning.main' }}
                                                >
                                                    <FontAwesomeIcon icon={faSms} />
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Delete Patient">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => onDelete(patient.id)}
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
