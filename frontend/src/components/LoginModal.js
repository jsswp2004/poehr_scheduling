import React from 'react';
import './LoginModal.css';

const LoginModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">POWER Scheduler – Login & Logout Quick Reference</h2>
          <button className="modal-close" onClick={onClose}>
            <span>&times;</span>
          </button>
        </div>
        
        <div className="modal-body">
          <div className="login-section">
            <h3 className="section-number">How to Log In</h3>
            
            <div className="step-group">
              <h4 className="step-title">Go to the Login Page:</h4>
              <p className="step-description">
                Open your web browser and visit <code>/login</code>.
              </p>
            </div>

            <div className="step-group">
              <h4 className="step-title">Enter Your Details:</h4>
              <p className="step-description">
                Type in your <strong>username</strong> and <strong>password</strong>.
              </p>
            </div>

            <div className="step-group">
              <h4 className="step-title">Click the Login Button:</h4>
              <p className="step-description">
                If your details are correct, you'll be signed in and taken to your dashboard or main page.
              </p>
            </div>
          </div>

          <div className="login-section">
            <h3 className="section-number">How to Log Out</h3>
            
            <div className="step-group">
              <h4 className="step-title">Click Logout:</h4>
              <p className="step-description">
                Find the <strong>"Logout"</strong> button or icon at the top of the screen (in the navigation bar).
              </p>
            </div>

            <div className="step-group">
              <h4 className="step-title">Confirm If Asked:</h4>
              <p className="step-description">
                If the system asks you to confirm, click <strong>"Yes"</strong> or <strong>"Logout."</strong>
              </p>
            </div>

            <div className="step-group">
              <h4 className="step-title">All Done:</h4>
              <p className="step-description">
                You'll be safely signed out and sent back to the main solutions page.
              </p>
            </div>
          </div>

          <div className="login-section security-section">
            <h3 className="section-number">🔒 Security Tips</h3>
            
            <ul className="security-tips">
              <li>Always log out if you're using a shared or public computer.</li>
              <li>Your session will expire after about <strong>1 hour</strong> if you're inactive. Simply log in again to continue.</li>
              <li>Keep your password safe and do not share it with others.</li>
              <li>If you have trouble logging in, click <strong>"Forgot Password"</strong> or contact your administrator for help.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
