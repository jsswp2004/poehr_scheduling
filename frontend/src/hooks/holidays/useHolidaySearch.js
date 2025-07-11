import { useState } from 'react';

export const useHolidaySearch = (holidayList) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredHolidays = holidayList.filter((holiday) =>
        holiday.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const clearSearch = () => setSearchQuery('');

    return {
        searchQuery,
        setSearchQuery,
        filteredHolidays,
        clearSearch,
    };
};
