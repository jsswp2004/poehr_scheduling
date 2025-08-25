import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { getAccessToken } from '../utils/tokenManager';

/**
 * Custom hook for subscription-based feature access control
 * Determines what features a user can access based on their subscription tier
 */
export const useSubscriptionAccess = () => {
    const [userTier, setUserTier] = useState(null);
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = getAccessToken();
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const tier = decoded.subscription_tier || 'basic';
                setUserTier(tier);
                setPermissions(getPermissionsForTier(tier));
            } catch (error) {
                console.error('Failed to decode token for subscription access:', error);
                // Default to basic tier permissions if token is invalid
                setUserTier('basic');
                setPermissions(getPermissionsForTier('basic'));
            }
        } else {
            // No token, default to basic tier
            setUserTier('basic');
            setPermissions(getPermissionsForTier('basic'));
        }
        setLoading(false);
    }, []);

    return {
        userTier,
        permissions,
        loading,
        isBasic: userTier === 'basic',
        isPremium: userTier === 'premium', 
        isEnterprise: userTier === 'enterprise',
        canAccess: (feature) => permissions[feature] === true,
        requiresUpgrade: (feature) => permissions[feature] === false && userTier === 'basic'
    };
};

/**
 * Define permissions for each subscription tier
 */
const getPermissionsForTier = (tier) => {
    const permissions = {
        // Basic features available to all tiers
        basicScheduling: true,
        basicCalendar: true,
        emailNotifications: true,
        basicReporting: true,
        patientManagement: true,
        
        // Professional tier limitations
        mobileAppAccess: false,
        appointmentLimit: tier === 'basic' ? 200 : 999999,
        
        // Premium features (Clinic plan and above)
        advancedCalendar: tier === 'premium' || tier === 'enterprise',
        teamManagement: tier === 'premium' || tier === 'enterprise',
        unlimitedAppointments: tier === 'premium' || tier === 'enterprise',
        advancedReporting: tier === 'premium' || tier === 'enterprise',
        bulkNotifications: tier === 'premium' || tier === 'enterprise',
        analyticsSection: tier === 'premium' || tier === 'enterprise',
        smsNotifications: tier === 'premium' || tier === 'enterprise',
        
        // Enterprise features
        multiLocationSupport: tier === 'enterprise',
        customBranding: tier === 'enterprise',
        prioritySupport: tier === 'enterprise',
        apiAccess: tier === 'enterprise',
        customIntegrations: tier === 'enterprise'
    };

    return permissions;
};

/**
 * Component wrapper for subscription-gated features
 */
export const SubscriptionGate = ({ 
    feature, 
    userTier, 
    permissions, 
    children, 
    fallback = null,
    showUpgradePrompt = false 
}) => {
    if (permissions[feature]) {
        return children;
    }

    if (showUpgradePrompt && userTier === 'basic') {
        return (
            <div style={{
                padding: '20px',
                border: '2px dashed #1976d2',
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: '#f5f5f5',
                margin: '10px 0'
            }}>
                <h4 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>
                    🚀 Upgrade to Clinic Plan
                </h4>
                <p style={{ margin: '0 0 15px 0', color: '#666' }}>
                    This feature requires a Clinic or Group plan subscription.
                </p>
                <button 
                    style={{
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                    onClick={() => window.location.href = '/pricing?plan=clinic'}
                >
                    Upgrade Now
                </button>
            </div>
        );
    }

    return fallback;
};

export default useSubscriptionAccess;
