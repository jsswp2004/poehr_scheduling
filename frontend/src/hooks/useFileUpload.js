import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/**
 * Custom hook for handling CSV file upload functionality
 * Manages file selection, upload, and processing
 */
export const useFileUpload = (token, onSuccessCallback) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [error, setError] = useState(null);

    // Handle file selection
    const handleFileSelect = (file) => {
        setSelectedFile(file);
        setError(null);
    };

    // Clear selected file
    const clearSelectedFile = () => {
        setSelectedFile(null);
        setError(null);
    };

    // Upload CSV file
    const uploadFile = async () => {
        if (!selectedFile) {
            setError('Please select a file');
            return false;
        }

        if (!token) {
            setError('Authentication required');
            return false;
        }

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await axios.post(
                `${API_BASE_URL}/api/communicator/upload/`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            // Success - close dialog and clear file
            setUploadDialogOpen(false);
            setSelectedFile(null);

            // Call success callback if provided
            if (onSuccessCallback) {
                onSuccessCallback(response.data);
            }

            return true;
        } catch (err) {
            console.error('Failed to upload contacts:', err);
            console.error('Error response:', err.response?.data);

            // Set more detailed error message
            let errorMessage = 'Failed to upload contacts';
            if (err.response?.data?.error) {
                errorMessage = err.response.data.error;
            } else if (err.response?.data?.errors) {
                errorMessage = `Upload completed with errors: ${err.response.data.errors.join(', ')}`;
            } else if (err.response?.status === 500) {
                errorMessage = 'Server error occurred. Please check your CSV format and try again.';
            }

            setError(errorMessage);
            return false;
        } finally {
            setUploading(false);
        }
    };

    // Download CSV template
    const downloadTemplate = () => {
        const csvContent = "name,phone,email\nJohn Doe,+1234567890,john@example.com\nJane Smith,+0987654321,jane@example.com";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", "contacts_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Open upload dialog
    const openUploadDialog = () => {
        setUploadDialogOpen(true);
        setError(null);
    };

    // Close upload dialog
    const closeUploadDialog = () => {
        setUploadDialogOpen(false);
        setSelectedFile(null);
        setError(null);
    };

    return {
        selectedFile,
        uploading,
        uploadDialogOpen,
        error,
        handleFileSelect,
        clearSelectedFile,
        uploadFile,
        downloadTemplate,
        openUploadDialog,
        closeUploadDialog
    };
};
