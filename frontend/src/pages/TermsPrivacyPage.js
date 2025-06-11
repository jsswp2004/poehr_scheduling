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
        </div>        <div className="section">
          <h2 className="section-heading">Terms of Service</h2>
          <p className="section-text"><strong>Effective Date: January 1, 2025</strong></p>
          
          <div className="section-text">            <h3><strong>1. Acceptance of Terms</strong></h3>
            <ul>
              <li>By accessing or using the POWER Healthcare IT Systems, LLC scheduling application ("the App"), you agree to be bound by these Terms of Service ("Terms").</li>
              <li>If you do not agree with these Terms, please do not use the App.</li>
            </ul>

            <h3><strong>2. Service Description</strong></h3>
            <ul>
              <li>POWER Healthcare IT Systems, LLC ("POWER Healthcare," "we," "us," or "our") provides a secure online platform to help healthcare organizations, clinics, and providers manage appointments, schedules, and patient communications.</li>
            </ul>

            <h3><strong>3. Eligibility</strong></h3>
            <ul>
              <li>You must be at least 18 years old or have the authority of a healthcare organization to use this App.</li>
              <li>By registering, you represent and warrant that you meet these requirements.</li>
            </ul>

            <h3><strong>4. User Accounts</strong></h3>
            <ul>
              <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate.</li>
              <li>You are responsible for all activities that occur under your account.</li>
            </ul>

            <h3><strong>5. Permitted Use</strong></h3>
            <p>You may use the App only for lawful purposes and in accordance with these Terms. You agree not to use the App for any activity that:</p>
            <ul>
              <li>Violates any applicable law or regulation.</li>
              <li>Infringes the rights of any third party.</li>
              <li>Compromises the security, integrity, or availability of the App.</li>
            </ul>

            <h3><strong>6. Data Security and Privacy</strong></h3>
            <ul>
              <li>We take data security and patient privacy seriously. Please review our Privacy Policy below.</li>
              <li>We use industry-standard security measures to protect your data, including encryption and access controls.</li>
            </ul>

            <h3><strong>7. Payment and Trial Period</strong></h3>
            <ul>
              <li>Some features may require payment after a free trial period. By providing payment information, you authorize us to charge applicable fees.</li>
              <li>Details of plans and pricing are available within the App.</li>
            </ul>            <h3><strong>8. Intellectual Property</strong></h3>
            <ul>
              <li>The App and all related content are owned by POWER Healthcare IT Systems, LLC.</li>
              <li>You may not copy, modify, distribute, or reverse engineer any part of the App.</li>
            </ul>

            <h3><strong>9. Termination</strong></h3>
            <ul>
              <li>We reserve the right to suspend or terminate your access to the App at our sole discretion, with or without notice, for conduct that violates these Terms or is otherwise harmful to other users or us.</li>
            </ul>

            <h3><strong>10. Disclaimers and Limitation of Liability</strong></h3>
            <ul>
              <li>The App is provided "as is" without warranty of any kind.</li>
              <li>POWER Healthcare IT Systems, LLC is not responsible for any indirect, incidental, or consequential damages arising from your use of the App.</li>
            </ul>            <h3><strong>11. Changes to Terms</strong></h3>
            <ul>
              <li>We may update these Terms at any time.</li>
              <li>We will notify users of significant changes.</li>
              <li>Continued use of the App constitutes acceptance of updated Terms.</li>
            </ul>

            
          </div>
        </div>

        <div className="section">
          <h2 className="section-heading">Privacy Policy</h2>
          <p className="section-text"><strong>Effective Date: January 1, 2025</strong></p>
          
          <div className="section-text">
            <p>POWER Healthcare IT Systems, LLC ("POWER Healthcare," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and safeguard your information when you use our website and scheduling application ("the App").</p>

            <h3><strong>1. Information We Collect</strong></h3>
            <p>We may collect the following types of information:</p>
            <ul>
              <li><strong>Account Information:</strong> Your name, email address, organization, and role when you register for an account.</li>
              <li><strong>Appointment and Schedule Data:</strong> Details about appointments, schedules, assigned clinicians, and patient information (including pediatric patients) as needed to provide the App's services.</li>
              <li><strong>Usage Data:</strong> Device information, IP address, browser type, operating system, referring URLs, and pages accessed within the App.</li>
              <li><strong>Communications:</strong> Copies of your communications with us, including support inquiries or feedback.</li>
            </ul>

            <h3><strong>2. How We Use Your Information</strong></h3>
            <p>We may use your information to:</p>
            <ul>
              <li>Provide, operate, and maintain the App.</li>
              <li>Create and manage your user account.</li>
              <li>Process and manage appointments and communications.</li>
              <li>Communicate with you about updates, system alerts, support, or administrative matters.</li>
              <li>Improve our services, perform analytics, and enhance user experience.</li>
              <li>Meet legal, regulatory, and compliance requirements.</li>
            </ul>

            <h3><strong>3. How We Share Your Information</strong></h3>
            <p>We may share your information in the following circumstances:</p>
            <ul>
              <li><strong>Service Providers:</strong> With trusted third-party vendors who provide services such as hosting, payment processing, SMS/email delivery (e.g., Twilio), analytics, and IT support.</li>
              <li><strong>Legal Compliance:</strong> When required by law, regulation, legal process, or governmental request.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction, subject to the promises in this policy.</li>
              <li><strong>No Sale of Personal Data:</strong> We do not sell your personal information to third parties.</li>
            </ul>

            <h3><strong>4. Data Security</strong></h3>
            <ul>
              <li>We implement reasonable physical, technical, and administrative safeguards designed to protect your personal information.</li>
              <li>Examples include encryption, access controls, secure hosting, and regular security reviews. However, no method of transmission over the internet or electronic storage is 100% secure.</li>
            </ul>

            <h3><strong>5. Data Retention</strong></h3>
            <ul>
              <li>We retain your information for as long as your account is active or as needed to provide our services, comply with legal obligations, resolve disputes, or enforce our agreements.</li>
              <li>You may request account deletion at any time by contacting us.</li>
            </ul>

            <h3><strong>6. Your Rights and Choices</strong></h3>
            <ul>
              <li><strong>Access and Updates:</strong> You may access, update, or correct your account information at any time by logging into the App or contacting support.</li>
              <li><strong>Deletion:</strong> You may request deletion of your account and data, subject to applicable legal requirements.</li>
              <li><strong>For Patients:</strong> If your data is being processed by a healthcare provider using our App, please contact your provider for access or deletion requests.</li>
            </ul>

            <h3><strong>7. Children's Privacy and Pediatric Patients</strong></h3>
            <ul>
              <li>Our App is not intended for direct use by children under 18 years old. We do not knowingly allow minors to register for or access the App themselves.</li>
              <li>However, parents, legal guardians, or healthcare providers may enter and manage information for pediatric patients as part of clinical scheduling and care management. In such cases, information about pediatric patients is collected and processed solely for providing healthcare services and is handled with the same level of privacy and security as all patient data.</li>
              <li>If we learn that a child under 18 has registered an account or provided personal information directly, we will take steps to delete such information promptly.</li>
            </ul>

            <h3><strong>8. International Users</strong></h3>
            <ul>
              <li>If you use the App from outside the United States, your information may be transferred to, stored, and processed in the United States or other countries.</li>
              <li>By using the App, you consent to this transfer.</li>
            </ul>

            <h3><strong>9. HIPAA Compliance Statement</strong></h3>
            <ul>
              <li>POWER Healthcare IT Systems, LLC is committed to maintaining the privacy and security of Protected Health Information (PHI) as required by the Health Insurance Portability and Accountability Act (HIPAA).</li>
              <li>We implement administrative, physical, and technical safeguards to protect PHI against unauthorized access, use, or disclosure.</li>
              <li>We only use and disclose PHI as permitted by law and applicable business associate agreements with covered healthcare providers and organizations.</li>
              <li>If you have questions about our HIPAA compliance, please contact us at <a href="mailto:info@powerhealthcareit.com">info@powerhealthcareit.com</a>.</li>
            </ul>

            <h3><strong>10. Changes to this Privacy Policy</strong></h3>
            <ul>
              <li>We may update this Privacy Policy from time to time.</li>
              <li>We will notify users of significant changes by posting the new policy on our website or through the App.</li>
              <li>Your continued use of the App after any changes indicates your acceptance of the revised policy.</li>
            </ul>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default TermsPrivacyPage;
