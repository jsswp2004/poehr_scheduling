import React from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography
} from '@mui/material';

/**
 * File upload dialog for CSV contact import
 */
const FileUploadDialog = ({
    open,
    selectedFile,
    uploading,
    onClose,
    onFileSelect,
    onUpload,
    onDownloadTemplate
}) => {
    return (
        <Dialog open={open} onClose={uploading ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Upload Contacts CSV</DialogTitle>

            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Alert severity="info">
                        Columns: name, phone, email. Contacts already on your list are skipped.
                    </Alert>

                    <Box
                        sx={{
                            border: '1px dashed',
                            borderColor: 'text.secondary',
                            borderRadius: 3,
                            bgcolor: 'background.default',
                            p: 3,
                            textAlign: 'center'
                        }}
                    >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                            {selectedFile ? selectedFile.name : 'No file chosen'}
                        </Typography>
                        <Button component="label" size="small" variant="outlined">
                            {selectedFile ? 'Choose a different file' : 'Choose CSV file'}
                            <input
                                hidden
                                type="file"
                                accept=".csv"
                                onChange={(e) => onFileSelect(e.target.files[0])}
                            />
                        </Button>
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={uploading}>Cancel</Button>
                <Button onClick={onDownloadTemplate} variant="outlined">Download template</Button>
                <Button onClick={onUpload} variant="contained" disabled={!selectedFile || uploading}>
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default FileUploadDialog;
