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
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
// Import reusable Header component
import Header from '../components/Header';
// Import logo for footer
import Footer from '../components/Footer';

// Main pricing page component for POWER IT healthcare scheduling software
export const PricingPage = ({ className, ...props }) => {
  // Get URL search parameters to check for plan pre-selection
  const [searchParams] = useSearchParams();
  
  // Get initial tab from URL parameter, defaulting to 'personal'
  const getInitialTab = () => {
    const planParam = searchParams.get('plan');
    // Only allow 'personal' or 'clinic' pre-selection (Group goes to contact page)
    if (planParam === 'clinic') {
      return 'clinic';
    }
    return 'personal'; // Default to personal for any other value or no parameter
  };

  // State for active tab with URL parameter support
  const [activeTab, setActiveTab] = useState(getInitialTab());

  // Update tab when URL parameters change
  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [searchParams]);

  // Handler function for tab clicks
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
                    <span className="price-amount">$19.99</span>

                  </div>
                </div>
                <div className="panel-description">
                  Perfect for individual healthcare providers just getting started
                </div>                <div className="panel-features">

                  <div className="feature">Basic scheduling with up to 50 appointments</div>
                  
                  <div className="feature">Basic calendar view with daily/weekly views</div>
                  <div className="feature">SMS + Email appointment notifications</div>
                  <div className="feature">Mobile app access for on-the-go management</div>
                  <div className="feature">Basic reporting on appointment statistics</div>

                </div>                <div className="panel-button">
                  <Link to="/enroll?plan=personal&tier=basic" className="btn-panel">Get Started Free</Link>
                </div>
              </div>

              {/* Personal Panel 2 - Pro */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                <div className="panel-title">Features</div>
                  {/*<div className="panel-badge popular">Most Popular</div>
                  <div className="panel-title">Personal Pro</div>
                  <div className="panel-price">
                    <span className="price-amount">$15</span>
                    <span className="price-period">per month</span>
                  </div>*/}
                </div>
                <div className="panel-description">
                  Advanced features for growing individual practices
                </div>                
                <div className="panel-features">
                  <div className="feature">Simple appointment scheduling for individual providers - Easily schedule and manage appointments for individual healthcare providers using an intuitive, user-friendly interface designed to streamline your daily workflow.</div>
                  <div className="feature">Standard calendar with daily and weekly views - Stay organized with a standard calendar that offers both daily and weekly views, allowing you to quickly review, add, or update appointments at a glance.

</div>
                  <div className="feature">Basic patient notification system via SMS and email - Keep patients informed and reduce no-shows with an integrated notification system that automatically sends appointment reminders and updates via SMS and email.</div>
                  <div className="feature">Access your schedule on iOS and Android devices - Enjoy the convenience of accessing your appointment schedule anytime, anywhere, from any iOS or Android mobile device, ensuring you are always up to date.</div>
                  <div className="feature">Essential reporting for appointment analytics - Make informed decisions with essential reporting tools that provide clear analytics on appointment trends, patient attendance, and provider utilization.</div>
                  {/*<div className="feature">Appointments with comprehensive patient history tracking to monitor progress over time</div>
                  <div className="feature">Calendar system with customizable color coding, multiple view options, and filtering capabilities</div>
                  <div className="feature">SMS template builder and email communication system with delivery tracking</div>
                  <div className="feature">Full patient records management including medical history, documents, and custom fields</div>
                  <div className="feature">Intelligent reminder system with automated patient confirmation and follow-up sequences</div>
                  <div className="feature">Comprehensive analytics dashboard with custom reporting and exportable data insights</div>
                  <div className="feature">Fully branded appointment scheduling page with your practice's logo and color scheme</div>
                  <div className="feature">Integration capabilities with EHR systems and third-party healthcare applications</div>*/}
                </div>
                {/*<div className="panel-button">
                  <div className="btn-panel">Start Free Trial</div>
                </div>*/}
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
                  <div className="panel-title">Clinic</div>
                  <div className="panel-price">
                    <span className="price-amount">$49.99</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Essential tools for small to medium healthcare clinics
                </div>
                <div className="panel-features">
                  <div className="feature">Everything in Personal</div>
                  <div className="feature">Up to 10 providers</div>
                  <div className="feature">Unlimited appointments</div>
                  <div className="feature">Advanced calendar features</div>
                  <div className="feature">Team collaboration tools</div>
                  <div className="feature">SMS + Email notifications</div>
                  <div className="feature">Bulk SMS notifications</div>
                  <div className="feature">Patient management system</div>                  
                  <div className="feature">Automated reminders</div>
                  <div className="feature">Advanced reporting & analytics</div>
                </div>                <div className="panel-button">
                  <Link to="/enroll?plan=clinic&tier=premium" className="btn-panel">Start Free Trial</Link>
                </div>
              </div>

              {/* Clinic Panel 2 - Premium */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                  <div className="panel-title">Features</div>
                </div>
                <div className="panel-description">
                  Advanced features for busy clinics with complex needs
                </div>
                <div className="panel-features">
                  <div className="feature">Everything in Personal
                  - Includes all the essential features from the Personal plan, ensuring a strong foundation for your clinic or group practice.</div>
                  <div className="feature">Up to 10 providers
                  - Manage scheduling and appointments for up to ten individual healthcare providers within your organization, supporting group practices and clinics of varying sizes.</div>
                  <div className="feature">Unlimited appointments
                  - Enjoy the flexibility of booking and managing an unlimited number of appointments without any restrictions, allowing your team to grow without limits.</div>
                  <div className="feature">Advanced calendar features
                  - Benefit from enhanced calendar capabilities, including color-coded schedules, recurring appointments, and customizable views to better organize your practice.</div>
                  <div className="feature">Team collaboration tools
                  - Improve coordination and efficiency with built-in team collaboration tools, enabling staff members to share notes, assign tasks, and communicate seamlessly within the platform.</div>
                  <div className="feature">SMS + Email notifications
                  - Automatically send appointment confirmations, reminders, and updates to patients through both SMS and email, ensuring timely communication and improved attendance.</div>
                  <div className="feature">Bulk SMS notifications
                  - Easily send bulk SMS notifications to groups of patients or staff for important announcements, last-minute changes, or promotional messages.</div>
                  <div className="feature">Patient management system
                  - Streamline patient care with a comprehensive management system that allows you to store, update, and access essential patient information securely.</div>
                  <div className="feature">Automated reminders
                  - Reduce missed appointments and improve patient engagement with automated reminders delivered directly to patients through their preferred communication channels.</div>
                  <div className="feature">Advanced reporting & analytics
                  - Leverage advanced reporting and analytics tools to gain deeper insights into appointment trends, patient flow, and staff performance, supporting data-driven decision making.</div>

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
                  <div className="panel-title">Group</div>
                  <div className="panel-price">
                    <span className="price-amount">$129.99</span>
                    <span className="price-period">per month</span>
                  </div>
                </div>
                <div className="panel-description">
                  Comprehensive solution for large healthcare organizations
                </div>
                <div className="panel-features">
                 <div className="feature">Everything in Clinic</div>
                 <div className="feature">Unlimited users</div>
                 <div className="feature">Advanced analytics</div>
                 <div className="feature">Priority support</div>
                 <div className="feature">Custom integrations</div>
                  <div className="feature">Multi-organization support</div>
                  <div className="feature">Advanced analytics & reporting</div>
                  <div className="feature">Custom branding</div>
                  <div className="feature">24/7 dedicated support</div>
                  <div className="feature">On-premise deployment option</div>
                  <div className="feature">Custom feature development</div>
                  <div className="feature">White-label solutions</div>
                  <div className="feature">Custom integrations</div>
                  <div className="feature">Dedicated account manager</div>
                  <div className="feature">SLA guarantees</div>
                  <div className="feature">Professional services</div>                  
                </div>                <div className="panel-button">
                  <Link to="/enroll?plan=group&tier=enterprise" className="btn-panel">Contact Sales</Link>
                </div>
              </div>

              {/* Group Panel 2 - Custom */}
              <div className="pricing-panel featured">
                <div className="panel-header">
                  <div className="panel-title">Features</div>
                </div>
                <div className="panel-description">
                  Tailored solutions for unique organizational requirements
                </div>
                <div className="panel-features">
                  <div className="feature">Everything in Clinic
                  - Access all the robust features included in the Clinic plan, providing a comprehensive solution to manage your organization’s scheduling and communications at scale.</div>
                  <div className="feature">Unlimited users
                  - Add and manage an unlimited number of users, making it easy for large teams and growing organizations to collaborate without limitations.</div>
                  <div className="feature">Advanced analytics
                  - Utilize powerful analytics tools to track key performance metrics, monitor appointment trends, and optimize operational efficiency across your organization.</div>
                  <div className="feature">Priority support
                  - Receive expedited, high-priority support from our expert team, ensuring your issues are addressed promptly and your operations remain uninterrupted.</div>
                  <div className="feature">Custom integrations
                  - Integrate seamlessly with your existing systems and third-party applications through customized integrations tailored to your specific needs.</div>
                  <div className="feature">Multi-organization support
                  - Manage multiple organizations or locations from a single platform, enabling centralized oversight and flexible configuration for complex healthcare networks.</div>
                  <div className="feature">Advanced analytics & reporting
                  - Access comprehensive analytics and detailed reporting features to gain actionable insights and support data-driven decision making at every level of your organization.</div>
                  <div className="feature">Custom branding
                  - Customize the look and feel of your application with your own logos, color schemes, and branding elements to deliver a cohesive experience for your staff and patients.</div>
                  <div className="feature">24/7 dedicated support
                  - Benefit from around-the-clock dedicated support, ensuring assistance is always available whenever you need it, day or night.</div>
                  <div className="feature">On-premise deployment option
                  - Choose to deploy the application on your own servers or infrastructure for enhanced control, security, and compliance with organizational requirements.</div>
                  <div className="feature">Custom feature development
                  - Request bespoke feature development to address unique workflows or specialized needs within your organization, ensuring the platform evolves with you.</div>
                  <div className="feature">White-label solutions
                  - Offer the platform under your own brand with a complete white-label solution, providing your clients or partners with a seamless, branded experience.</div>
                  <div className="feature">Custom integrations
                  - Connect your system to other critical applications through tailor-made integrations designed to fit your operational ecosystem.</div>
                  <div className="feature">Dedicated account manager
                  - Work with a dedicated account manager who understands your organization’s goals, provides personalized assistance, and helps you maximize the value of your solution.</div>
                  <div className="feature">SLA guarantees
                  - Rely on service level agreement (SLA) guarantees that provide assurance of platform uptime, performance, and rapid issue resolution.</div>
                  <div className="feature">Professional services
                  - Access professional services including onboarding, training, technical consulting, and ongoing optimization to ensure your organization’s success with the platform.</div>

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
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default PricingPage;
