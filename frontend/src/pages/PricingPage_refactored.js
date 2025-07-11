/*
 * POWER IT Healthcare Scheduling - Pricing Page Component (Refactored)
 *
 * PAGE LAYOUT STRUCTURE:
 * =====================
 * 1. Navigation Header - Same as landing page with logo, menu, login/trial buttons
 * 2. Page Title - "Pick your plan" heading
 * 3. Tab Navigation - Personal, Clinic, Group tabs with URL parameter support
 * 4. Pricing Cards Section - Dynamic content based on selected tab
 * 5. Footer - Same footer as landing page
 */

import React from 'react';
import '../PricingPage/PricingPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { usePricingTabs, usePricingData } from '../hooks/pricing';
import {
    PricingPageHeader,
    TabNavigation,
    PricingSection
} from '../components/pricing';

/**
 * PricingPage Component (Refactored)
 * Main pricing page component for POWER IT healthcare scheduling software
 * 
 * Features:
 * - URL parameter support for plan pre-selection
 * - Tab-based navigation between Personal, Clinic, and Group plans
 * - Structured pricing data with features and enrollment links
 * - Responsive design with consistent header and footer
 * - Modular components for maintainability
 */
export const PricingPage = ({ className, ...props }) => {
    // Tab navigation state and handlers
    const { activeTab, handleTabClick } = usePricingTabs();

    // Structured pricing data for all plans
    const { personalPlans, clinicPlans, groupPlans } = usePricingData();

    return (
        <div className={'pricing-page ' + (className || '')}>
            {/* ===================================================================
          SECTION 1: NAVIGATION HEADER - TOP OF PAGE
          - Company logo and branding
          - Main navigation menu (Solutions, Resources, Pricing)
          - Login and "Try POWER for free" buttons
          ================================================================= */}
            <Header />

            {/* ===================================================================
          SECTION 2: PAGE TITLE AND TAB NAVIGATION
          - "Pick your plan" main heading
          - Tab navigation for Personal, Clinic, Group
          ================================================================= */}
            <PricingPageHeader />
            <TabNavigation activeTab={activeTab} onTabClick={handleTabClick} />

            {/* ===================================================================
          SECTION 3: PRICING CARDS WITH TAB CONTENT
          - Dynamic content based on selected tab
          - Pricing panels with features and enrollment options
          ================================================================= */}
            <PricingSection
                activeTab={activeTab}
                personalPlans={personalPlans}
                clinicPlans={clinicPlans}
                groupPlans={groupPlans}
            />

            {/* ===================================================================
          SECTION 4: FOOTER - BOTTOM OF PAGE
          - Company branding and logo
          - Navigation links in columns
          - Footer bottom bar with copyright and legal links
          ================================================================= */}
            <Footer pricingLink="/pricing" featuresLink="/features" />
        </div>
    );
};

export default PricingPage;
