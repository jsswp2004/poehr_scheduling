import "../SupportPage/SupportPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const SupportPage = ({ className }) => {
  return (
    <div className={`support-page ${className || ""}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">🏥 How to Register Your Organization with POWER Healthcare</h1>
        <p className="page-subtitle">
          A step-by-step guide to getting your healthcare practice set up and running with POWER.
        </p>
      </div>
      <div className="support-content">
        <div className="section">
          <h2 className="section-heading">📋 What You'll Need Before You Start</h2>
          <ul className="section-list">
            <li><strong>Organization Information</strong>
              <ul>
                <li>✅ Your practice or clinic's official name</li>
                <li>✅ Business address (street, city, state, zip code)</li>
                <li>✅ Main phone number</li>
                <li>✅ Business email address</li>
              </ul>
            </li>
            <li><strong>Administrator Details</strong>
              <ul>
                <li>✅ Your full name (as the main administrator)</li>
                <li>✅ Your professional email address</li>
                <li>✅ Your direct phone number</li>
              </ul>
            </li>
            <li><strong>Subscription Information</strong>
              <ul>
                <li>✅ Credit card or payment method</li>
                <li>✅ Billing address (if different from business address)</li>
              </ul>
            </li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">🚀 Step-by-Step Registration Process</h2>
          <h3>Step 1: Start Your Registration</h3>
          <ul className="section-list">
            <li>Visit the POWER Healthcare website</li>
            <li>Go to your organization's POWER platform URL</li>
            <li>Click the "Get Started", "Try Power Free" or "Try it now" button</li>
          </ul>
          <h3>Step 2: Set Up Your Account Details</h3>
          <ul className="section-list">
            <li>Create your account and enter account details
              <ul>
                <li>Organization Name, Organization Type</li>
                <li>Firstname, Lastname, Username, Email</li>
                <li>Phone Number</li>
                <li>Password: at least 8 characters with mixed characters</li>
                <li>As the person registering, you'll become the main administrator</li>
              </ul>
            </li>
            <li>Choose Plan – review and click Next</li>
            <li>Payment Information – major credit/debit cards
              <ul>
                <li>Card Number, Expiration (MM/YY), Security Code</li>
              </ul>
            </li>
            <li>Review and Confirm – verify details and click "Complete Enrollment"</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">✅ What Happens Next?</h2>
          <ul className="section-list">
            <li>You'll be redirected to the login screen</li>
            <li>A confirmation email will be sent to your administrator email</li>
            <li>Your account will be activated within a few minutes</li>
          </ul>
          <h3>Welcome Email</h3>
          <ul className="section-list">
            <li>Login link and access to your POWER dashboard</li>
            <li>Getting started checklist</li>
            <li>Support contact information</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">🔧 Getting Started After Registration</h2>
          <h3>First Login</h3>
          <ol>
            <li>Check your email for the welcome message</li>
            <li>Click the login link or go to https://powerhealthcareit.com</li>
            <li>Click on the Solutions button</li>
            <li>Enter your email and password</li>
            <li>You'll be taken to your Management Portal</li>
          </ol>

          <h3>Initial Setup: Upload Your Data</h3>
          <ol>
            <li>
              Add Staff Members – providers and staff
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Providers / Staff: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Add Clinic Events – schedules and sessions
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Clinic Events: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Availability – provider schedules and slots
              <ol>
                <li>Settings &gt; Uploads / Downloads</li>
                <li>Availability: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
            <li>
              Patients – import patient records
              <ol>
                <li>Patients: Download Template</li>
                <li>Fill the CSV, Choose File, Upload CSV</li>
              </ol>
            </li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">🗓️ Set Up Schedule Maintenance</h2>
          <ol>
            <li>Go to Settings &gt; Schedule Maintenance</li>
            <li>Select Clinician (after providers are uploaded)</li>
            <li>Set start/end time, recurrence, and end date</li>
            <li>Use "Block this schedule" for block time</li>
            <li>Schedules appear on the overview panel</li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">⚙️ Set Up Environment Profile</h2>
          <ol>
            <li>Default Blocked Days – configure and Save Settings</li>
            <li>Holidays – Load Year or add manually</li>
            <li>Organization – upload logo, create clinics</li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">🧪 Test the System</h2>
          <ul className="section-list">
            <li>Create a test appointment</li>
            <li>Send a test reminder</li>
            <li>Explore the dashboard</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">🆘 Need Help?</h2>
          <h3>Common Questions</h3>
          <ul className="section-list">
            <li>If you make a mistake during registration, support can help update info.</li>
            <li>You can change plans anytime from account settings.</li>
            <li>If payment doesn’t go through, check your card or contact support.</li>
          </ul>
          <h3>Contact Support</h3>
          <ul className="section-list">
            <li>Email: info@powerhealthcareit.com</li>
            <li>Phone: 301-880-6015</li>
            <li>Hours: Monday–Friday, 8 AM – 6 PM EST</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">✅ After Registration</h2>
          <ul className="section-list">
            <li>Save your login information securely</li>
            <li>Schedule time to explore the platform</li>
            <li>Plan staff training sessions</li>
            <li>Start with a small pilot group</li>
          </ul>
          <h3>Best Practices</h3>
          <ul className="section-list">
            <li>Keep contact information updated</li>
            <li>Review subscription and usage regularly</li>
            <li>Use training resources</li>
            <li>Provide feedback to improve the platform</li>
          </ul>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SupportPage;
