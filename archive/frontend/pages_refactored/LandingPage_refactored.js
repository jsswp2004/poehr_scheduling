/*
 * POWER IT Healthcare Scheduling - Landing Page Component
 * 
 * PAGE LAYOUT STRUCTURE:
 * =====================
 * 1. Hero Section - Main banner with headline and CTA button
 * 2. Navigation Header - Logo, menu items, login/trial buttons  
 * 3. Product Features - POWER Scheduling feature showcase
 * 4. Collaboration Section - Team collaboration features
 * 5. Customer Testimonials - Client reviews and feedback
 * 6. Cross-Platform Section - Multi-device availability info
 * 7. Data Security Section - Security and privacy features
 * 8. Pricing Section - Three-tier pricing plans (Personal/Clinic/Group)
 * 9. Free Trial CTA - Final call-to-action with platform links
 * 10. Footer - Company info, navigation links, legal
 */

// Import styles for the landing page component
import '../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css';
// Import reusable components
import Header from '../components/Header';
import Footer from '../components/Footer';

// Import custom hooks and components
import { useLandingNavigation } from '../hooks/landing';
import {
    HeroSection,
    ProductFeatures,
    CrossPlatformSection,
    DataSecuritySection,
    PricingSection,
    FinalCTASection,
} from '../components/landing';

// Asset imports for page content
import DashboardImage from '../assets/dashboard_clinician.png';
import DashboardSchedulingImage from '../assets/dashboard_scheduling.jpg';
import DashboardTogetherImage from '../assets/dashboard_together.png';

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
    // Custom hooks
    const {
        handlePricingClick,
        handleSecurityClick,
        handleContactClick,
    } = useLandingNavigation();

    return (
        <div className={"landing-page-v-1-desktop-1920-px " + className}>
            {/* Navigation Header */}
            <Header />

            {/* Hero Section */}
            <HeroSection
                onPricingClick={handlePricingClick}
                dashboardImage={DashboardImage}
            />

            {/* Product Features */}
            <ProductFeatures
                onPricingClick={handlePricingClick}
                schedulingImage={DashboardSchedulingImage}
                togetherImage={DashboardTogetherImage}
            />

            {/* Cross-Platform Section */}
            <CrossPlatformSection onPricingClick={handlePricingClick} />

            {/* Data Security Section */}
            <DataSecuritySection onSecurityClick={handleSecurityClick} />

            {/* Pricing Section */}
            <PricingSection
                onPricingClick={handlePricingClick}
                onContactClick={handleContactClick}
            />

            {/* Final CTA Section */}
            <FinalCTASection onPricingClick={handlePricingClick} />

            {/* Footer */}
            <Footer pricingLink="/pricing" featuresLink="/features" />
        </div>
    );
};

/*
 * LANDING PAGE VISUAL FLOW SUMMARY:
 * =================================
 * 
 * TOP OF PAGE
 * ↓
 * [1] Hero Section - Main headline "Smarter Scheduling. Better Outcomes. Powered by POWER."
 * ↓  
 * [2] Navigation Header - Logo + Menu (Products, Solutions, Resources, Pricing) + Login/Trial buttons
 * ↓
 * [3] Product Features - "POWER Scheduling" with feature bullet points + "POWER together" collaboration
 * ↓
 * [4] Customer Testimonials - "What Our Clients Says" with two client reviews
 * ↓
 * [5] Cross-Platform Section - "Efficient scheduling—anywhere, anytime" multi-device info
 * ↓
 * [6] Data Security - "100% your data" with security features and HIPAA compliance
 * ↓
 * [7] Pricing Plans - "Choose Your Plan" with 3 tiers (Personal Free, Clinic $11.99, Group $49.99)
 * ↓
 * [8] Final CTA - "Try POWER today" with download links for all platforms
 * ↓
 * [9] Footer - Company info, navigation links, legal information
 * ↓
 * BOTTOM OF PAGE
 * 
 * KEY INTERACTIVE ELEMENTS:
 * - Multiple "Try POWER free" buttons throughout the page
 * - Login button in header (navigates to /login route)
 * - Pricing plan action buttons
 * - Platform download links (App Store, Windows, Google Play)
 * - Footer navigation links
 */
