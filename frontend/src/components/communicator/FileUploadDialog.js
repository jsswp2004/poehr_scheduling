import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Alert,
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
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Upload Contacts CSV</DialogTitle>

            <DialogContent>
                <Alert severity="info" sx={{ mb: 2 }}>
                    Upload a CSV file with columns: name, phone, email
                </Alert>

                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => onFileSelect(e.target.files[0])}
                    style={{ marginBottom: '16px' }}
                />

                {selectedFile && (
                    <Typography variant="body2" color="text.secondary">
                        Selected: {selectedFile.name}
                    </Typography>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>

                <Button onClick={onDownloadTemplate} variant="outlined">
                    Download Template
                </Button>

                <Button
                    onClick={onUpload}
                    variant="contained"
                    disabled={!selectedFile || uploading}
                >
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default FileUploadDialog;
