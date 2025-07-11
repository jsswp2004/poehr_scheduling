import { useEffect, useRef } from 'react';

export const useTableAutoScroll = (schedules) => {
    const availabilityTableRef = useRef(null);
    const blockedTableRef = useRef(null);

    // Auto-scroll effect for tables when schedules change
    useEffect(() => {
        if (schedules.length > 0) {
            // Auto-scroll availability table to bottom with smooth behavior
            if (availabilityTableRef.current) {
                const availabilityContainer = availabilityTableRef.current;
                setTimeout(() => {
                    availabilityContainer.scrollTo({
                        top: availabilityContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 100);
            }

            // Auto-scroll blocked table to bottom with smooth behavior
            if (blockedTableRef.current) {
                const blockedContainer = blockedTableRef.current;
                setTimeout(() => {
                    blockedContainer.scrollTo({
                        top: blockedContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 100);
            }
        }
    }, [schedules]);

    return {
        availabilityTableRef,
        blockedTableRef,
    };
};
