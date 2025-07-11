import { useNavigate } from 'react-router-dom';

export const useLandingNavigation = () => {
    const navigate = useNavigate();

    // Handler for pricing page navigation
    const handlePricingClick = (planType = null) => {
        if (planType) {
            navigate(`/pricing?plan=${planType}`);
        } else {
            navigate('/pricing');
        }
    };

    // Navigate to detailed data security page
    const handleSecurityClick = () => {
        navigate('/security');
    };

    // Navigate to contact page
    const handleContactClick = () => {
        navigate('/contact');
    };

    return {
        navigate,
        handlePricingClick,
        handleSecurityClick,
        handleContactClick,
    };
};
