import React from 'react';
import './RegistrationModal.css';

const RegistrationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">POWER Scheduling System – Account Registration Quick Reference</h2>
          <button className="modal-close" onClick={onClose}>
            <span>&times;</span>
          </button>
        </div>
        
        <div className="modal-body">
          <div className="registration-section">
            <h3 className="section-number">1. Patient Self‑Registration</h3>
            <ul className="registration-steps">
              <li>Go to <code>/register</code> (see route in App.js).</li>
              <li>Fill out required fields: <strong>First Name</strong>, <strong>Last Name</strong>, <strong>Username</strong>, <strong>Email</strong>, <strong>Phone Number</strong>, <strong>Password</strong>.</li>
              <li>(Optional) Select your doctor from the dropdown if known.</li>
              <li>Submit the form.</li>
              <li>Upon success, you'll be redirected to the login page.</li>
            </ul>
          </div>

          <div className="registration-section">
            <h3 className="section-number">2. Doctor/Admin Service Enrollment</h3>
            <ul className="registration-steps">
              <li>On the Pricing page, select your plan and proceed to <code>/enroll?plan=&lt;plan&gt;&tier=&lt;tier&gt;</code>.</li>
              <li>Complete the 4 enrollment steps:
                <ul className="sub-steps">
                  <li>Account Details</li>
                  <li>Choose Plan</li>
                  <li>Payment Info</li>
                  <li>Confirmation</li>
                </ul>
              </li>
              <li>On submission, an organization admin account is created and a trial is started.</li>
              <li>After confirmation, login with your credentials.</li>
            </ul>
          </div>

          <div className="registration-section">
            <h3 className="section-number">3. Admin Registration (Patients & Staff)</h3>
            
            <div className="sub-section">
              <h4 className="sub-section-title">Add Patient:</h4>
              <ul className="registration-steps">
                <li>Go to the <strong>Patients</strong> page.</li>
                <li>Use the <strong>Register</strong> tab and fill out the Quick Register form.</li>
              </ul>
            </div>

            <div className="sub-section">
              <h4 className="sub-section-title">Add Staff (Doctor, Receptionist, Admin, Registrar):</h4>
              <ul className="registration-steps">
                <li>Go to <code>/create-profile</code>.</li>
                <li>Upload profile picture, select role, and assign to an organization.</li>
              </ul>
            </div>

            <div className="note-section">
              <p><strong>Note:</strong> Submitting either form sends a POST to <code>/api/auth/register/</code> with relevant role and organization.</p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default RegistrationModal;
