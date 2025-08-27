import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../SupportPage/SupportPage.css';

const SupportPage = () => {
  return (
    <div className="support-page">
      <Header />
      <div className="support-container">
        
        <div className="hero-section">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">Organization Registration & Setup Guide</h1>
              <p className="hero-subtitle">Complete registration in under 10 minutes and get your healthcare platform ready</p>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-number">5 min</div>
                <div className="stat-label">Registration</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">10 min</div>
                <div className="stat-label">Full Setup</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">24/7</div>
                <div className="stat-label">Support</div>
              </div>
            </div>
          </div>
        </div>

        <div className="sections-container">
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">📋</div>
              <h2 className="section-title">Before You Start</h2>
              <p className="section-description">Essential information you'll need during registration</p>
            </div>
            
            <div className="info-grid">
              <div className="info-card">
                <h4 className="info-title">🏥 Organization Details</h4>
                <ul className="info-list">
                  <li>Organization name</li>
                  <li>Business address</li>
                  <li>Contact information</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">👤 Admin Contact</h4>
                <ul className="info-list">
                  <li>Primary contact name</li>
                  <li>Email address</li>
                  <li>Phone number</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">💳 Payment Method</h4>
                <ul className="info-list">
                  <li>Credit/debit card</li>
                  <li>Billing address</li>
                  <li>Plan selection</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🔧</div>
              <h2 className="section-title">Getting Started After Registration</h2>
              <p className="section-description">Your roadmap to a fully configured system</p>
            </div>
            
            <div className="setup-grid">
              <div className="setup-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4 className="step-title">Initial Setup</h4>
                  <ul className="step-list">
                    <li>Default Blocked Days – configure and Save Settings</li>
                    <li>Holidays – Load Year or add manually</li>
                    <li>Organization – upload logo, create clinics</li>
                  </ul>
                </div>
              </div>
              
              <div className="setup-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4 className="step-title">Test the System</h4>
                  <ul className="step-list">
                    <li>Create a test appointment</li>
                    <li>Send a test reminder</li>
                    <li>Explore the dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🆘</div>
              <h2 className="section-title">Support & Resources</h2>
              <p className="section-description">Get help when you need it</p>
            </div>
            
            <div className="support-grid">
              <div className="support-card">
                <div className="support-icon">📞</div>
                <h4 className="support-title">Phone Support</h4>
                <p className="support-detail">301-880-6015</p>
                <p className="support-hours">Mon-Fri, 8 AM - 6 PM EST</p>
              </div>
              
              <div className="support-card">
                <div className="support-icon">📧</div>
                <h4 className="support-title">Email Support</h4>
                <p className="support-detail">info@powerhealthcareit.com</p>
                <p className="support-hours">24-hour response time</p>
              </div>
              
              <div className="support-card">
                <div className="support-icon">❓</div>
                <h4 className="support-title">Common Questions</h4>
                <ul className="support-tips">
                  <li>Registration mistakes can be corrected</li>
                  <li>Plans can be changed anytime</li>
                  <li>Payment issues are quickly resolved</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">✅</div>
              <h2 className="section-title">Best Practices</h2>
              <p className="section-description">Tips for successful implementation</p>
            </div>
            
            <div className="info-grid">
              <div className="info-card">
                <h4 className="info-title">🔐 Security & Access</h4>
                <ul className="info-list">
                  <li>Save login information securely</li>
                  <li>Keep contact information updated</li>
                  <li>Review user permissions regularly</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">👥 Team Management</h4>
                <ul className="info-list">
                  <li>Schedule time to explore the platform</li>
                  <li>Plan comprehensive staff training</li>
                  <li>Start with a small pilot group</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">📊 Ongoing Success</h4>
                <ul className="info-list">
                  <li>Review subscription and usage regularly</li>
                  <li>Use available training resources</li>
                  <li>Provide feedback to improve the platform</li>
                </ul>
              </div>
            </div>
          </div>
          
        </div>
        {/*Step by Step Registration*/}
        <div className="sections-container">
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">✍️</div>
              <h2 className="section-title">Step-by-Step Registration Process</h2>
              <p className="section-description">If you have any questions during the registration process, please contact our support team.</p>
            </div>
            
            <div className="info-grid">
              <div className="info-card">
                <h4 className="info-title">✅ Step 1: Start Your Registration</h4>
                <ul className="info-list">
                  <li>1.	Visit the POWER Healthcare website</li>
                  <li>-	Go to https://www.powerhealthcareit.com</li>
                  <li>-	Click the "Get Started", "Try Power Free" or "Try it now” button
                  </li>
                  <li>2.	Choose Your Plan</li>
                  <li>Review the available subscription plans</li>
                  <li>Select the plan that best fits your organization's size and needs</li>
                  <li>Click "Get Started Free" or "Get Started Free"</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">✅ Step 2: Set Up Your Account Details</h4>
                <ul className="info-list">
                  <li>You'll now fill out a form with your practice information:</li>
                  <li>1. Create your account and enter account details</li>
                  <li>- Organization Name: Enter your clinic or practice's official name</li>
                  <li>- Organization Type: Enter/Select type of organization</li>
                  <li>- Firstname: Enter Firstname</li>
                  <li>- Lastname: Enter Lastname</li>
                  <li>- Username: Enter/create your username</li>
                  <li>- Email: A general contact email for your organization</li>
                  <li>- Phone Number: Enter your phone number</li>
                  <li>- Password: create your password</li>
                  <li>Choose a strong password (at least 8 characters)</li>
                  <li>Include uppercase and lowercase letters, numbers, and symbols</li>
                  <li>Confirm your password</li>
                  <li>As the person registering, you'll become the main administrator.</li>
                  <li>2. Choose Plan</li>
                  <li>- Review the plan you selected, click Next</li>
                  <li>3. Payment Information</li>
                  <li>- Enter your payment information (We accept all major credit and debit cards)</li>
                  <li>Credit Card Number: Enter your payment card details</li>
                  <li>Expiration Date: MM/YY format</li>
                  <li>Security Code: The 3–4-digit code on your card</li>
                  <li>4. Review and Confirm</li>
                  <li>- Review all information</li>
                  <li>- Verify your contact details</li>
                  <li>- Confirm your subscription plan</li>
                  <li>- Click "Complete Enrollment"</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">✅ What Happens Next?</h4>
                <ul className="info-list">
                  <li>- You'll be redirected to the log in screen</li>
                  <li>- A confirmation email will be sent to your administrator email</li>
                  <li>- Your account will be activated within a few minutes</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🔧</div>
              <h2 className="section-title">Getting Started After Registration</h2>
              <p className="section-description">Your roadmap to a fully configured system</p>
            </div>
            
            <div className="setup-grid">
              <div className="setup-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4 className="step-title">Initial Setup</h4>
                  <ul className="step-list">
                    <li>Default Blocked Days – configure and Save Settings</li>
                    <li>Holidays – Load Year or add manually</li>
                    <li>Organization – upload logo, create clinics</li>
                  </ul>
                </div>
              </div>
              
              <div className="setup-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4 className="step-title">Test the System</h4>
                  <ul className="step-list">
                    <li>Create a test appointment</li>
                    <li>Send a test reminder</li>
                    <li>Explore the dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🆘</div>
              <h2 className="section-title">Support & Resources</h2>
              <p className="section-description">Get help when you need it</p>
            </div>
            
            <div className="support-grid">
              <div className="support-card">
                <div className="support-icon">📞</div>
                <h4 className="support-title">Phone Support</h4>
                <p className="support-detail">301-880-6015</p>
                <p className="support-hours">Mon-Fri, 8 AM - 6 PM EST</p>
              </div>
              
              <div className="support-card">
                <div className="support-icon">📧</div>
                <h4 className="support-title">Email Support</h4>
                <p className="support-detail">info@powerhealthcareit.com</p>
                <p className="support-hours">24-hour response time</p>
              </div>
              
              <div className="support-card">
                <div className="support-icon">❓</div>
                <h4 className="support-title">Common Questions</h4>
                <ul className="support-tips">
                  <li>Registration mistakes can be corrected</li>
                  <li>Plans can be changed anytime</li>
                  <li>Payment issues are quickly resolved</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">✅</div>
              <h2 className="section-title">Best Practices</h2>
              <p className="section-description">Tips for successful implementation</p>
            </div>
            
            <div className="info-grid">
              <div className="info-card">
                <h4 className="info-title">🔐 Security & Access</h4>
                <ul className="info-list">
                  <li>Save login information securely</li>
                  <li>Keep contact information updated</li>
                  <li>Review user permissions regularly</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">👥 Team Management</h4>
                <ul className="info-list">
                  <li>Schedule time to explore the platform</li>
                  <li>Plan comprehensive staff training</li>
                  <li>Start with a small pilot group</li>
                </ul>
              </div>
              <div className="info-card">
                <h4 className="info-title">📊 Ongoing Success</h4>
                <ul className="info-list">
                  <li>Review subscription and usage regularly</li>
                  <li>Use available training resources</li>
                  <li>Provide feedback to improve the platform</li>
                </ul>
              </div>
            </div>
          </div>
          
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SupportPage;
