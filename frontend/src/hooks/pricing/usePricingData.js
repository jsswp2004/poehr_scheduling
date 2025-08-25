/**
 * Custom hook for managing pricing plan data
 * Provides structured data for different pricing tiers
 */
export const usePricingData = () => {
    const personalPlans = {
        basic: {
            badge: 'Starter',
            title: 'Professional',
            price: '$19.99',
            period: '',
            description: 'Perfect for individual healthcare providers just getting started',
            features: [
                'Basic scheduling with up to 50 appointments',
                'Basic calendar view with daily/weekly views',
                'SMS + Email appointment notifications',
                'Mobile app access for on-the-go management',
                'Basic reporting on appointment statistics'
            ],
            buttonText: 'Get Started Free',
            enrollLink: '/enroll?plan=personal&tier=basic'
        },
        features: {
            title: 'Features',
            description: 'Advanced features for growing individual practices',
            features: [
                'Simple appointment scheduling for individual providers - Easily schedule and manage appointments for individual healthcare providers using an intuitive, user-friendly interface designed to streamline your daily workflow.',
                'Standard calendar with daily and weekly views - Stay organized with a standard calendar that offers both daily and weekly views, allowing you to quickly review, add, or update appointments at a glance.',
                'Basic patient notification system via SMS and email - Keep patients informed and reduce no-shows with an integrated notification system that automatically sends appointment reminders and updates via SMS and email.',
                'Access your schedule on iOS and Android devices - Enjoy the convenience of accessing your appointment schedule anytime, anywhere, from any iOS or Android mobile device, ensuring you are always up to date.',
                'Essential reporting for appointment analytics - Make informed decisions with essential reporting tools that provide clear analytics on appointment trends, patient attendance, and provider utilization.'
            ]
        }
    };

    const clinicPlans = {
        standard: {
            badge: 'Standard',
            title: 'Clinic',
            price: '$49.99',
            period: 'per month',
            description: 'Essential tools for small to medium healthcare clinics',
            features: [
                'Everything in Personal',
                'Up to 10 providers',
                'Unlimited appointments',
                'Advanced calendar features',
                'Team collaboration tools',
                'SMS + Email notifications',
                'Bulk SMS notifications',
                'Patient management system',
                'Automated reminders',
                'Advanced reporting & analytics'
            ],
            buttonText: 'Start Free Trial',
            enrollLink: '/enroll?plan=clinic&tier=premium'
        },
        features: {
            title: 'Features',
            description: 'Advanced features for busy clinics with complex needs',
            features: [
                'Everything in Professional - Includes all the essential features from the Professional plan, ensuring a strong foundation for your clinic or group practice.',
                'Up to 10 providers - Manage scheduling and appointments for up to ten individual healthcare providers within your organization, supporting group practices and clinics of varying sizes.',
                'Unlimited appointments - Enjoy the flexibility of booking and managing an unlimited number of appointments without any restrictions, allowing your team to grow without limits.',
                'Advanced calendar features - Benefit from enhanced calendar capabilities, including color-coded schedules, recurring appointments, and customizable views to better organize your practice.',
                'Team collaboration tools - Improve coordination and efficiency with built-in team collaboration tools, enabling staff members to share notes, assign tasks, and communicate seamlessly within the platform.',
                'SMS + Email notifications - Automatically send appointment confirmations, reminders, and updates to patients through both SMS and email, ensuring timely communication and improved attendance.',
                'Bulk SMS notifications - Easily send bulk SMS notifications to groups of patients or staff for important announcements, last-minute changes, or promotional messages.',
                'Patient management system - Streamline patient care with a comprehensive management system that allows you to store, update, and access essential patient information securely.',
                'Automated reminders - Reduce missed appointments and improve patient engagement with automated reminders delivered directly to patients through their preferred communication channels.',
                'Advanced reporting & analytics - Leverage advanced reporting and analytics tools to gain deeper insights into appointment trends, patient flow, and staff performance, supporting data-driven decision making.'
            ]
        }
    };

    const groupPlans = {
        enterprise: {
            badge: 'Enterprise',
            title: 'Group',
            price: '$129.99',
            period: 'per month',
            description: 'Comprehensive solution for large healthcare organizations',
            features: [
                'Everything in Clinic',
                'Unlimited users',
                'Advanced analytics',
                'Priority support',
                'Custom integrations',
                'Multi-organization support',
                'Advanced analytics & reporting',
                'Custom branding',
                '24/7 dedicated support',
                'On-premise deployment option',
                'Custom feature development',
                'White-label solutions',
                'Custom integrations',
                'Dedicated account manager',
                'SLA guarantees',
                'Professional services'
            ],
            buttonText: 'Contact Sales',
            enrollLink: '/enroll?plan=group&tier=enterprise'
        },
        features: {
            title: 'Features',
            description: 'Tailored solutions for unique organizational requirements',
            features: [
                'Everything in Clinic - Access all the robust features included in the Clinic plan, providing a comprehensive solution to manage your organization\'s scheduling and communications at scale.',
                'Unlimited users - Add and manage an unlimited number of users, making it easy for large teams and growing organizations to collaborate without limitations.',
                'Advanced analytics - Utilize powerful analytics tools to track key performance metrics, monitor appointment trends, and optimize operational efficiency across your organization.',
                'Priority support - Receive expedited, high-priority support from our expert team, ensuring your issues are addressed promptly and your operations remain uninterrupted.',
                'Custom integrations - Integrate seamlessly with your existing systems and third-party applications through customized integrations tailored to your specific needs.',
                'Multi-organization support - Manage multiple organizations or locations from a single platform, enabling centralized oversight and flexible configuration for complex healthcare networks.',
                'Advanced analytics & reporting - Access comprehensive analytics and detailed reporting features to gain actionable insights and support data-driven decision making at every level of your organization.',
                'Custom branding - Customize the look and feel of your application with your own logos, color schemes, and branding elements to deliver a cohesive experience for your staff and patients.',
                '24/7 dedicated support - Benefit from around-the-clock dedicated support, ensuring assistance is always available whenever you need it, day or night.',
                'On-premise deployment option - Choose to deploy the application on your own servers or infrastructure for enhanced control, security, and compliance with organizational requirements.',
                'Custom feature development - Request bespoke feature development to address unique workflows or specialized needs within your organization, ensuring the platform evolves with you.',
                'White-label solutions - Offer the platform under your own brand with a complete white-label solution, providing your clients or partners with a seamless, branded experience.',
                'Custom integrations - Connect your system to other critical applications through tailor-made integrations designed to fit your operational ecosystem.',
                'Dedicated account manager - Work with a dedicated account manager who understands your organization\'s goals, provides personalized assistance, and helps you maximize the value of your solution.',
                'SLA guarantees - Rely on service level agreement (SLA) guarantees that provide assurance of platform uptime, performance, and rapid issue resolution.',
                'Professional services - Access professional services including onboarding, training, technical consulting, and ongoing optimization to ensure your organization\'s success with the platform.'
            ]
        }
    };

    return {
        personalPlans,
        clinicPlans,
        groupPlans
    };
};
