/**
 * Refactored LandingPage component
 * 
 * This is a much more maintainable version of the original 514-line LandingPage.js
 * - Business logic separated into focused hooks
 * - UI components modularized for reusability
 * - Better organization and maintainability
 * - Each section is now a separate component
 */
import React from 'react';
// Import styles for the landing page component
import '../LandingPageV1Desktop1920Px/LandingPageV1Desktop1920Px.css';
// Import reusable components
import Header from '../components/Header';
import Footer from '../components/Footer';
// Import custom hook
import { useLandingPageNavigation } from '../hooks/landing-page/useLandingPageNavigation';
// Import modular section components
import { HeroSection } from '../components/landing-page/HeroSection';
import { ProductFeaturesSection } from '../components/landing-page/ProductFeaturesSection';
import { CrossPlatformSection } from '../components/landing-page/CrossPlatformSection';
import { DataSecuritySection } from '../components/landing-page/DataSecuritySection';
import { PricingSection } from '../components/landing-page/PricingSection';
import { FinalCTASection } from '../components/landing-page/FinalCTASection';

// Main landing page component for POWER IT healthcare scheduling software
export const LandingPageV1Desktop1920Px = ({ className, ...props }) => {
    // Use navigation hook for all navigation actions
    const {
        handlePricingClick,
        handleSecurityClick,
        handleContactClick
    } = useLandingPageNavigation();

    return (
        <div className={"landing-page-v-1-desktop-1920-px " + className}>
            {/* Navigation Header */}
            <Header />

            {/* Hero Section - Main value proposition */}
            <HeroSection onTrialClick={handlePricingClick} />

            {/* Product Features - POWER Scheduling & POWER together */}
            <ProductFeaturesSection onGetStartedClick={handlePricingClick} />

            {/* Cross-Platform Section - Multi-device availability */}
            <CrossPlatformSection onTryPowerClick={handlePricingClick} />

            {/* Data Security Section - HIPAA compliance and privacy */}
            <DataSecuritySection onReadMoreClick={handleSecurityClick} />

            {/* Pricing Section - Three-tier pricing plans */}
            <PricingSection
                onPricingClick={handlePricingClick}
                onContactClick={handleContactClick}
            />

            {/* Final CTA Section - Try POWER today */}
            <FinalCTASection
                onTryPowerClick={handlePricingClick}
                onContactSalesClick={handlePricingClick}
            />

            {/* Footer - Company info and navigation */}
            <Footer pricingLink="/pricing" featuresLink="/features" />
        </div>
    );
};
