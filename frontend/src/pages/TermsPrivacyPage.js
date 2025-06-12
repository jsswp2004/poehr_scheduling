import '../TermsPrivacyPage/TermsPrivacyPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

export const TermsPrivacyPage = ({ className }) => {
  return (
    <div className={`terms-privacy-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Terms of Service & Privacy Policy</h1>
        <p className="page-subtitle">Our commitment to transparency and security</p>
      </div>
      <div className="content-section">
        <div className="section">
          <h2 className="section-heading">Contact Information</h2>
          <p className="section-text">
            Address<br />
            16192 Coastal Highway<br />
            Lewes, Delaware 19958<br />
            Sussex County<br />
            Phone: (301) 880-6015<br />
            Email: <a href="mailto:info@powerhealthcareit.com">info@powerhealthcareit.com</a>
          </p>
        </div>

        <div className="section">
          <h2 className="section-heading">Terms of Service</h2>
          <ol className="section-text">
            <li><strong>Acceptance of Terms</strong> – By using the POWER Healthcare IT scheduling application ("the App"), you agree to these Terms of Service.</li>
            <li><strong>Service Description</strong> – We provide a secure platform to help healthcare organizations manage appointments, schedules, and communications.</li>
            <li><strong>Eligibility</strong> – Users must be at least 18 years old or authorized by a healthcare organization.</li>
            <li><strong>User Accounts</strong> – You are responsible for maintaining your login credentials and all activity under your account.</li>
            <li><strong>Permitted Use</strong> – The App may be used only for lawful purposes and in accordance with these Terms.</li>
            <li><strong>Data Security and Privacy</strong> – We protect your data with industry‑standard measures. See our Privacy Policy below.</li>
            <li><strong>Payment and Trial Period</strong> – Some features may require payment after a free trial.</li>
            <li><strong>Intellectual Property</strong> – All content is owned by POWER Healthcare IT Systems, LLC.</li>
            <li><strong>Termination</strong> – We may suspend or terminate access for conduct that violates these Terms.</li>
            <li><strong>Disclaimers and Limitation of Liability</strong> – The App is provided "as is" without warranty.</li>
            <li><strong>Changes to Terms</strong> – We may update these Terms and will notify users of significant changes.</li>
            <li><strong>Contact</strong> – Questions about these Terms can be sent to <a href="mailto:info@powerhealthcareit.com">info@powerhealthcareit.com</a>.</li>
          </ol>
        </div>

        <div className="section">
          <h2 className="section-heading">Privacy Policy</h2>
          <ol className="section-text">
            <li><strong>Information We Collect</strong> – Account details, appointment data, usage data, and communications.</li>
            <li><strong>How We Use Your Information</strong> – To operate and maintain the App, manage accounts and appointments, and meet legal requirements.</li>
            <li><strong>How We Share Your Information</strong> – With trusted service providers, when required by law, or during business transfers. We do not sell personal data.</li>
            <li><strong>Data Security</strong> – We implement reasonable safeguards such as encryption and access controls.</li>
            <li><strong>Data Retention</strong> – Information is retained while accounts are active or as needed for legal purposes.</li>
            <li><strong>Your Rights and Choices</strong> – You may access, update, or request deletion of your account information.</li>
            <li><strong>Children’s Privacy</strong> – The App is not intended for direct use by children under 18.</li>
            <li><strong>International Users</strong> – By using the App outside the U.S., you consent to information transfer to the United States.</li>
            <li><strong>HIPAA Compliance Statement</strong> – We maintain the privacy and security of Protected Health Information as required by HIPAA.</li>
            <li><strong>Changes to this Policy</strong> – Updates will be posted on our website or through the App.</li>
            <li><strong>Contact Us</strong> – For privacy questions, email <a href="mailto:info@powerhealthcareit.com">info@powerhealthcareit.com</a>.</li>
          </ol>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default TermsPrivacyPage;
