import '../SupportPage/SupportPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import RegistrationModal from '../components/RegistrationModal';
import LoginModal from '../components/LoginModal';
import React, { useState } from 'react';

export const SupportPage = ({ className }) => {
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const openRegistrationModal = () => setIsRegistrationModalOpen(true);
  const closeRegistrationModal = () => setIsRegistrationModalOpen(false);
  
  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <div className={`support-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">POWER Support Center</h1>
        <p className="page-subtitle">
          Welcome to the POWER Support Center. Here you’ll find helpful information to guide you through setup, usage, and troubleshooting. Our team is committed to delivering exceptional support.
        </p>
      </div>
      <div className="support-content">
        <div className="section">
          <h2 className="section-heading">Getting Started 🧭</h2>
          <ul className="section-list">            <li>
              <strong>
                <span className="registration-link" onClick={openRegistrationModal}>
                  Registering an Account
                </span>
              </strong> – Step-by-step guide for patients, doctors, and staff to register.
            </li>
            <li>
              <strong>
                <span className="registration-link" onClick={openLoginModal}>
                  Logging In & Out
                </span>
              </strong> – Learn how to securely log in and out of your account.
              </li>
            <li><strong>Navigating the Dashboard</strong> – Overview of features like appointments, patient list, and scheduling blocks. </li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Appointments 📅</h2>
          <ul className="section-list">
            <li>Creating and Managing Appointments – Instructions for patients and staff on how to book, edit, or cancel appointments.</li>
            <li>Recurring Appointments – Explanation of daily, weekly, and monthly recurrence logic.</li>
            <li>Viewing Appointments in the Calendar – Using the Calendar view to track availability, blocked times, and appointments.</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Patients & Providers 🧑‍⚕️</h2>
          <ul className="section-list">
            <li>Patient Registration and Provider Assignment – How patients are linked to providers during signup.</li>
            <li>Managing Patient Records – Filtering, exporting, and viewing patient details from the Patients page.</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">System Maintenance 🛠️</h2>
          <ul className="section-list">
            <li>Blocking Schedules for Providers – Instructions on adding unavailable times using the Maintenance panel.</li>
            <li>Environment Settings – How to define default blocked days and apply global settings.</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Notifications 📨 </h2>
          <ul className="section-list">
            <li>Text & Email Reminders – Explaining automated reminders and bulk messaging (if enabled in your plan).</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Reports & Exporting 📄 </h2>
          <ul className="section-list">
            <li>Exporting CSVs – How to export patient lists or appointment schedules for offline use.</li>
            <li>Planned Analytics Features – Coming soon: Reporting dashboards for appointment trends and staff utilization.</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Frequently Asked Questions ❓ </h2>
          <ul className="section-list">
            <li>What do I do if I forget my password? – Add instructions or a link to password reset.</li>
            <li>How can I change my assigned doctor? – Patients can contact clinic administrators.</li>
            <li>Why can’t I create appointments on certain days? – Days may be blocked due to clinic policy or holidays.</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Technical Support 🧑‍💻 </h2>
          <ul className="section-list">
            <li>For assistance, please contact:</li>
            <li>Email: info@powerhealthcareit.com</li>
            <li>Phone: 3018806015</li>
            <li>Live Chat: [Link to chat support if applicable]</li>
          </ul>
        </div>

        <div className="section">
          <h2 className="section-heading">Security & Privacy 🔒 </h2>
          <ul className="section-list">
            <li>Overview of how we handle your data securely using token authentication and role-based access.</li>
          </ul>        </div>      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
      <RegistrationModal isOpen={isRegistrationModalOpen} onClose={closeRegistrationModal} />
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
    </div>
  );
};

export default SupportPage;
