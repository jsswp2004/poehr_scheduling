import { useState } from 'react';

/**
 * Custom hook for managing pagination functionality
 * Handles page state and pagination calculations
 */
export const usePagination = (data, rowsPerPage = 10) => {
    const [page, setPage] = useState(1);

    const paginatedData = data.slice(
        (page - 1) * rowsPerPage,
        page * rowsPerPage
    );

    const totalPages = Math.ceil(data.length / rowsPerPage);

    const handlePageChange = (_, value) => {
        setPage(value);
    };

    return {
        page,
        setPage,
        paginatedData,
        totalPages,
        handlePageChange,
        showPagination: data.length > rowsPerPage
    };
};
