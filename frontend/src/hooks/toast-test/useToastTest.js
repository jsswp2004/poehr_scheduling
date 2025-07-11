import { toast } from '../../components/SimpleToast';
import toastUtils from '../../utils/toastUtils';

/**
 * Custom hook for managing toast testing functionality
 * Provides different toast testing methods for validation
 */
export const useToastTest = () => {
    // Regular toast API methods
    const showRegularToast = () => {
        toast.success('Regular toast success - should last 2 seconds');
    };

    const showRegularErrorToast = () => {
        toast.error('Regular toast error - should last 2 seconds');
    };

    // Toast utility methods
    const showUtilToast = () => {
        toastUtils.success('Toast from utility - should last 2 seconds');
    };

    const showUtilErrorToast = () => {
        toastUtils.error('Toast error from utility - should last 2 seconds');
    };

    // Toast test configurations
    const toastTestSections = [
        {
            id: 'regular',
            title: 'Regular Toast API',
            tests: [
                {
                    id: 'regular-success',
                    label: 'Show Regular Success Toast',
                    variant: 'contained',
                    color: 'primary',
                    handler: showRegularToast
                },
                {
                    id: 'regular-error',
                    label: 'Show Regular Error Toast',
                    variant: 'contained',
                    color: 'error',
                    handler: showRegularErrorToast
                }
            ]
        },
        {
            id: 'utility',
            title: 'Custom Toast Utility',
            tests: [
                {
                    id: 'util-success',
                    label: 'Show Utility Success Toast',
                    variant: 'contained',
                    color: 'primary',
                    handler: showUtilToast
                },
                {
                    id: 'util-error',
                    label: 'Show Utility Error Toast',
                    variant: 'contained',
                    color: 'error',
                    handler: showUtilErrorToast
                }
            ]
        }
    ];

    return {
        toastTestSections,
        showRegularToast,
        showRegularErrorToast,
        showUtilToast,
        showUtilErrorToast
    };
};
