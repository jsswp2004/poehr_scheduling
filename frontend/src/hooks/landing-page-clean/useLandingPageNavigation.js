import { useNavigate } from 'react-router-dom';

/**
 * Custom hook for managing landing page navigation
 * Handles routing to different pages from the landing page
 */
export const useLandingPageNavigation = () => {
    const navigate = useNavigate();

    // Handler function to navigate to login page
    const handleLoginClick = () => {
        navigate('/login');
    };

    // Handler function to navigate to pricing page
    const handlePricingClick = () => {
        navigate('/pricing');
    };

    // Handler function to navigate to trial/registration
    const handleTrialClick = () => {
        navigate('/register');
    };

    // Handler function to navigate to contact page
    const handleContactClick = () => {
        navigate('/contact');
    };

    return {
        handleLoginClick,
        handlePricingClick,
        handleTrialClick,
        handleContactClick,
    };
};
