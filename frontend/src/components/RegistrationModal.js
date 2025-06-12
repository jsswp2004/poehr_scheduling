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
            <h3 className="section-number">1. For Patients: Creating Your Own Account</h3>
            
            <div className="step-group">
              <p className="step-description">
                Go to the <strong>Register</strong> page (look for a "Register" or "Sign Up" button on the main menu).
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                Fill out your details: <strong>First Name</strong>, <strong>Last Name</strong>, <strong>Username</strong>, <strong>Email</strong>, <strong>Phone Number</strong>, and <strong>Password</strong>.
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                If you know your doctor, you can select them from a dropdown list.
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                Click <strong>Register</strong> to finish.
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                Once successful, you'll be directed to the login page to sign in.
              </p>
            </div>
          </div>

          <div className="registration-section">
            <h3 className="section-number">2. For Doctors & Organizations: Signing Up Your Clinic or Office</h3>
            
            <div className="step-group">
              <p className="step-description">
                Start on the <strong>Pricing</strong> page and choose the plan that fits your needs.
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                Click the button to begin enrollment.
              </p>
            </div>

            <div className="step-group">
              <h4 className="step-title">Follow these 4 easy steps:</h4>
              <ul className="sub-steps">
                <li>Enter your account details</li>
                <li>Choose your plan</li>
                <li>Enter payment information</li>
                <li>Review and confirm</li>
              </ul>
            </div>

            <div className="step-group">
              <p className="step-description">
                After you finish, your admin account will be created, and your free trial will start.
              </p>
            </div>

            <div className="step-group">
              <p className="step-description">
                Use your new login details to access your dashboard.
              </p>
            </div>
          </div>

          <div className="registration-section">
            <h3 className="section-number">3. For Admins: Adding New Patients or Staff</h3>
            
            <div className="sub-section">
              <h4 className="sub-section-title">To add a new patient:</h4>
              <div className="step-group">
                <p className="step-description">
                  Open the <strong>Patients</strong> page.
                </p>
              </div>
              <div className="step-group">
                <p className="step-description">
                  Click the <strong>Register</strong> tab and fill out the short registration form.
                </p>
              </div>
            </div>

            <div className="sub-section">
              <h4 className="sub-section-title">To add a new staff member (doctor, receptionist, admin, or registrar):</h4>
              <div className="step-group">
                <p className="step-description">
                  Go to the <strong>Create Profile</strong> page (usually found in the main menu or admin area).
                </p>
              </div>
              <div className="step-group">
                <p className="step-description">
                  Enter their information, upload a profile picture, select their role, and assign them to the correct organization.
                </p>
              </div>
            </div>
          </div>

          <div className="registration-section help-section">
            <h3 className="section-number">💡 Need help?</h3>
            
            <div className="help-tip">
              <p>
                If you have questions or need assistance, contact your clinic administrator or support.
              </p>
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
