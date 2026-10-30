import React from 'react';
import { LegalPage, LegalSection } from '../components/LegalPage';

const UPDATED = 'October 30, 2026';

const PRIVACY = [
  {
    title: "1. Information We Collect",
    content: [
      "We collect information you provide directly to us, such as when you:",
      { list: ["Create an account or profile", "Schedule, modify, or cancel appointments", "Communicate with healthcare providers", "Use our messaging services", "Provide feedback or contact us"] },
      "This may include your name, email address, phone number, date of birth, medical information, appointment details, and communication preferences.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    content: [
      "We use the information we collect to:",
      { list: ["Provide, maintain, and improve our scheduling services", "Process and manage your appointments", "Send appointment reminders and health alerts via SMS (with your consent)", "Facilitate communication between you and your healthcare providers", "Respond to your comments, questions, and requests", "Ensure the security and integrity of our services", "Comply with legal obligations and healthcare regulations"] },
    ],
  },
  {
    title: "3. SMS Communications",
    content: [
      "By providing your phone number and consenting to SMS communications, you agree to receive:",
      { list: ["Automated appointment reminders", "Health alerts and notifications", "Service-related messages"] },
      "Message frequency varies. Message and data rates may apply. You can opt out at any time by replying STOP to any message. Reply HELP for support information.",
    ],
  },
  {
    title: "4. Information Sharing and Disclosure",
    content: [
      "We do not sell, trade, or otherwise transfer your personal information to third parties except in the following circumstances:",
      { list: ["With your healthcare providers as necessary for your care", "With your explicit consent", "To comply with legal obligations or court orders", "To protect our rights, property, or safety, or that of others", "In connection with a business transfer or acquisition"] },
    ],
  },
  {
    title: "5. Data Security",
    content: [
      "We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure.",
    ],
  },
  {
    title: "6. HIPAA Compliance",
    content: [
      "As a healthcare technology service, we are committed to maintaining the privacy and security of your protected health information (PHI) in accordance with the Health Insurance Portability and Accountability Act (HIPAA) and other applicable healthcare privacy laws.",
    ],
  },
  {
    title: "7. Your Rights",
    content: [
      "Depending on your location, you may have the following rights regarding your personal information:",
      { list: ["Access and obtain a copy of your personal information", "Correct inaccurate personal information", "Request deletion of your personal information", "Withdraw consent for SMS communications", "Request restrictions on how we use your information"] },
    ],
  },
];

const TERMS = [
  {
    title: "1. Acceptance of Terms",
    content: [
      "By accessing and using the POWER Healthcare IT Systems scheduling application, you accept and agree to be bound by the terms and provision of this agreement.",
    ],
  },
  {
    title: "2. Use License",
    content: [
      "Permission is granted to temporarily use this application for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:",
      { list: ["Modify or copy the materials", "Use the materials for any commercial purpose or for any public display", "Attempt to reverse engineer any software contained in the application", "Remove any copyright or other proprietary notations from the materials"] },
    ],
  },
  {
    title: "3. User Responsibilities",
    content: [
      "As a user of our scheduling application, you agree to:",
      { list: ["Provide accurate and complete information", "Maintain the security of your account credentials", "Use the service only for its intended healthcare scheduling purposes", "Comply with all applicable laws and regulations", "Respect the privacy and rights of other users", "Not use the service for any unlawful or prohibited activities"] },
    ],
  },
  {
    title: "4. Appointment Scheduling",
    content: [
      "Our application facilitates appointment scheduling between patients and healthcare providers. Please note:",
      { list: ["All appointments are subject to provider availability and confirmation", "You are responsible for arriving on time for scheduled appointments", "Cancellation policies may vary by provider", "Emergency medical situations should not be handled through this application"] },
    ],
  },
  {
    title: "5. Service Availability",
    content: [
      "We strive to maintain high availability of our services, but we do not guarantee uninterrupted access. The service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.",
    ],
  },
  {
    title: "6. Limitation of Liability",
    content: [
      "POWER Healthcare IT Systems shall not be liable for any damages arising from the use or inability to use this application, including but not limited to direct, indirect, incidental, punitive, and consequential damages.",
    ],
  },
  {
    title: "7. Modifications",
    content: [
      "We may revise these terms of service from time to time. For material changes we will give notice by email or in the application at least 30 days before they take effect. By continuing to use this application after a change takes effect, you agree to be bound by the then current version of these terms of service.",
    ],
  },
  {
    title: "8. Medical Disclaimer",
    content: [
      "This application is for scheduling purposes only and does not provide medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for medical concerns. In case of emergency, call 911 or your local emergency services.",
    ],
  },
];

function renderContent(content) {
  return content.map((c, i) =>
    typeof c === 'string' ? (
      <p key={i}>{c}</p>
    ) : (
      <ul key={i}>
        {c.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  );
}

function PrivacyAndTermsPage() {
  return (
    <LegalPage
      title="Privacy Policy and Terms of Service"
      subtitle="POWER Healthcare IT Systems - Scheduling Application"
      updated={UPDATED}
    >
      <nav className="lg-jump" aria-label="On this page">
        <a href="#privacy-policy">Privacy Policy</a>
        <a href="#terms-of-service">Terms of Service</a>
        <a href="#contact">Contact</a>
      </nav>

      <h2 className="lg-part" id="privacy-policy">Privacy Policy</h2>
      {PRIVACY.map((s) => (
        <LegalSection key={s.title} title={s.title} level={3}>
          {renderContent(s.content)}
        </LegalSection>
      ))}

      <h2 className="lg-part" id="terms-of-service">Terms of Service</h2>
      {TERMS.map((s) => (
        <LegalSection key={s.title} title={s.title} level={3}>
          {renderContent(s.content)}
        </LegalSection>
      ))}

      <h2 className="lg-part" id="contact">Contact Information</h2>
      <LegalSection title="POWER Healthcare IT Systems" level={3}>
        <p>
          If you have any questions about this Privacy Policy and Terms of Service, please contact us at:
        </p>
        <p>
          Email: <a href="mailto:power@powerhealthit.com">power@powerhealthit.com</a>
          <br />
          Website: <a href="https://powerhealthit.com">https://powerhealthit.com</a>
        </p>
      </LegalSection>

      <p className="lg-note">
        This Privacy Policy and Terms of Service document is effective as of {UPDATED}. We may update this document
        from time to time to reflect changes in our practices or applicable laws. Please check this page periodically
        for updates.
      </p>
    </LegalPage>
  );
}

export default PrivacyAndTermsPage;
