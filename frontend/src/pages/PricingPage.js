/*
 * POWER IT Healthcare Scheduling - Pricing Page Component
 * 
 * PAGE LAYOUT STRUCTURE:
 * =====================
 * 1. Navigation Header - Same as landing page with logo, menu, login/trial buttons
 * 2. Page Title - "Pick your plan" heading
 * 3. Tab Navigation - Personal, Clinic, Group tabs (functionality to be added later)
 * 4. Pricing Cards Section - Three pricing tiers copied from landing page
 * 5. Footer - Same footer as landing page
 */

// Import styles for the pricing page component
import '../PricingPage/PricingPage.css';
// Import React hooks for state management
import { useState } from 'react';
// Import reusable Header component
import Header from '../components/Header';
// Import logo for footer
import POWERLogo from '../assets/POWER_IT.png';

// Main pricing page component for POWER IT healthcare scheduling software
export const PricingPage = ({ className, ...props }) => {  // State for active tab (will be used later for tab functionality)
  const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'clinic', 'group'

  // Handler function for tab clicks (will be implemented later)
  const handleTabClick = (tab) => {
    setActiveTab(tab);
  };
  return (
    <div className={"pricing-page " + (className || "")}>
      
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
          - Tab navigation for Personal, Clinic, Group (to be implemented)
          ================================================================= */}
      <div className="pricing-page-header">
        <div className="page-title-section">
          <h1 className="page-title">Pick your plan</h1>
          <p className="page-subtitle">
            Whether you're practicing solo or with a clinic or Physician Group, we have a plan that fits your needs.
          </p>
        </div>        {/* Tab Navigation - Functional implementation */}
        <div className="tab-navigation">
          <div className="tab-container">
            <div 
              className={`tab-item ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => handleTabClick('personal')}
            >
              Personal
            </div>
            <div 
              className={`tab-item ${activeTab === 'clinic' ? 'active' : ''}`}
              onClick={() => handleTabClick('clinic')}
            >
              Clinic
            </div>
            <div 
              className={`tab-item ${activeTab === 'group' ? 'active' : ''}`}
              onClick={() => handleTabClick('group')}
            >
              Group
            </div>
          </div>
        </div>
      </div>      {/* ===================================================================
          SECTION 3: PRICING CARDS WITH TAB CONTENT
          - Two panels per tab: Personal, Clinic, Group
          - Each panel shows different pricing options or features
          ================================================================= */}
      <div className="pricing-section">
        {/* Personal Tab Content */}
        {activeTab === 'personal' && (
          <div className="tab-content">
            <div className="pricing-panels">
              {/* Personal Panel 1 - Basic */}
              <div className="pricing-panel">
                <div className="panel-header">
                  <div className="panel-badge">Starter</div>
                  <div className="panel-title">Personal Basic</div>
                  <div className="panel-price">
                    <span className="price-amount">Free</span>
                    <span className="price-period">Forever</span>
                  </div>
                </div>
                <div className="panel-description">
                  Perfect for individual healthcare providers just getting started
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Up to 5 appointments per month</div>
                  <div className="feature">✓ Basic calendar view</div>
                  <div className="feature">✓ Email notifications</div>
                  <div className="feature">✓ Mobile app access</div>
                  <div className="feature">✓ Basic reporting</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Get Started Free</div>
                </div>
              </div>

              {/* Personal Panel 2 - Pro */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                  <div className="panel-badge popular">Most Popular</div>
                  <div className="panel-title">Personal Pro</div>
                  <div className="panel-price">
                    <span className="price-amount">$15</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Advanced features for growing individual practices
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Unlimited appointments</div>
                  <div className="feature">✓ Advanced calendar features</div>
                  <div className="feature">✓ SMS + Email notifications</div>
                  <div className="feature">✓ Patient management</div>
                  <div className="feature">✓ Automated reminders</div>
                  <div className="feature">✓ Advanced reporting & analytics</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Start Free Trial</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clinic Tab Content */}
        {activeTab === 'clinic' && (
          <div className="tab-content">
            <div className="pricing-panels">
              {/* Clinic Panel 1 - Standard */}
              <div className="pricing-panel">
                <div className="panel-header">
                  <div className="panel-badge">Standard</div>
                  <div className="panel-title">Clinic Standard</div>
                  <div className="panel-price">
                    <span className="price-amount">$49.99</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Essential tools for small to medium healthcare clinics
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Up to 10 providers</div>
                  <div className="feature">✓ Team collaboration tools</div>
                  <div className="feature">✓ Multi-location support</div>
                  <div className="feature">✓ Patient management system</div>
                  <div className="feature">✓ Bulk SMS notifications</div>
                  <div className="feature">✓ Basic integrations</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Start Free Trial</div>
                </div>
              </div>

              {/* Clinic Panel 2 - Premium */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                  <div className="panel-badge popular">Recommended</div>
                  <div className="panel-title">Clinic Premium</div>
                  <div className="panel-price">
                    <span className="price-amount">$89.99</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Advanced features for busy clinics with complex needs
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Unlimited providers</div>
                  <div className="feature">✓ Advanced scheduling rules</div>
                  <div className="feature">✓ Custom workflows</div>
                  <div className="feature">✓ Advanced patient portal</div>
                  <div className="feature">✓ Priority support</div>
                  <div className="feature">✓ API access & integrations</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Start Free Trial</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Group Tab Content */}
        {activeTab === 'group' && (
          <div className="tab-content">
            <div className="pricing-panels">
              {/* Group Panel 1 - Enterprise */}
              <div className="pricing-panel">
                <div className="panel-header">
                  <div className="panel-badge">Enterprise</div>
                  <div className="panel-title">Group Enterprise</div>
                  <div className="panel-price">
                    <span className="price-amount">$199.99</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Comprehensive solution for large healthcare organizations
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Unlimited everything</div>
                  <div className="feature">✓ Multi-organization support</div>
                  <div className="feature">✓ Advanced analytics & reporting</div>
                  <div className="feature">✓ Custom branding</div>
                  <div className="feature">✓ 24/7 dedicated support</div>
                  <div className="feature">✓ On-premise deployment option</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Contact Sales</div>
                </div>
              </div>

              {/* Group Panel 2 - Custom */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                  <div className="panel-badge popular">Custom</div>
                  <div className="panel-title">Group Custom</div>
                  <div className="panel-price">
                    <span className="price-amount">Custom</span>
                    <span className="price-period">pricing</span>
                  </div>
                </div>
                <div className="panel-description">
                  Tailored solutions for unique organizational requirements
                </div>
                <div className="panel-features">
                  <div className="feature">✓ Custom feature development</div>
                  <div className="feature">✓ White-label solutions</div>
                  <div className="feature">✓ Custom integrations</div>
                  <div className="feature">✓ Dedicated account manager</div>
                  <div className="feature">✓ SLA guarantees</div>
                  <div className="feature">✓ Professional services</div>
                </div>
                <div className="panel-button">
                  <div className="btn-panel">Get Quote</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================
          SECTION 4: FOOTER - BOTTOM OF PAGE
          - Company branding and logo
          - Navigation links in columns
          - Footer bottom bar with copyright and legal links
          ================================================================= */}
      <div className="footer-section">
        <div className="footer-container">
          <div className="footer-content">
            {/* Company branding and description */}
            <div className="footer-brand">
              <div className="footer-logo">
                <img className="power-logo-footer" src={POWERLogo} alt="POWER IT Systems" />
                <div className="footer-brand-name">POWER IT SYSTEMS</div>
              </div>
              <div className="footer-description">
                POWER was created for the new ways healthcare teams work. We make
                better scheduling solutions for clinics around the world.
              </div>
            </div>
            
            {/* Product navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Product</div>
              <div className="footer-links">
                <a href="#overview" className="footer-link">Overview</a>
                <a href="/pricing" className="footer-link">Pricing</a>
                <a href="#features" className="footer-link">Features</a>
              </div>
            </div>
            
            {/* Resources navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Resources</div>
              <div className="footer-links">
                <a href="#guides" className="footer-link">Guides & Tutorials</a>
                <a href="#help" className="footer-link">Help Center</a>
                <a href="#support" className="footer-link">Support</a>
              </div>
            </div>
            
            {/* Company navigation links */}
            <div className="footer-column">
              <div className="footer-column-title">Company</div>
              <div className="footer-links">
                <a href="#about" className="footer-link">About Us</a>
                <a href="#contact" className="footer-link">Contact</a>
              </div>
            </div>
          </div>
          
          {/* Footer bottom bar */}
          <div className="footer-bottom">
            <div className="footer-copyright">
              ©2025 POWER IT Systems LLC. All rights reserved.
            </div>
            <div className="footer-legal-links">
              <a href="#terms" className="footer-legal-link">Terms & Privacy</a>
              <a href="#security" className="footer-legal-link">Security</a>
              <a href="#status" className="footer-legal-link">Status</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
