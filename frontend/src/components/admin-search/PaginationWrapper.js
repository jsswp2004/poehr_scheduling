import React from 'react';
import { Pagination, Box } from '@mui/material';

/**
 * PaginationWrapper Component
 * Handles pagination display and navigation
 */
const PaginationWrapper = ({
    totalItems,
    itemsPerPage,
    currentPage,
    onPageChange
}) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalItems <= itemsPerPage) {
        return null;
    }

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(_, value) => onPageChange(value)}
                color="primary"
                shape="rounded"
            />
        </Box>
    );
};

export default PaginationWrapper;
