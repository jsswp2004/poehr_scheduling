import POWERLogo from '../assets/POWER_IT.png';

export const Footer = ({ pricingLink = "#pricing" }) => {
  return (
    <div className="footer-section">
      <div className="footer-container">
        <div className="footer-content">
          {/* Company branding and description */}
          <div className="footer-brand">
            <div className="footer-logo">
              <img className="power-logo-footer" src={POWERLogo} alt="POWER IT Systems" />
              <div className="footer-brand-name">POWER IT SYSTEMS</div>
            </div>
            <div className="footer-description">
              POWER was created for the new ways healthcare teams work. We make
              better scheduling solutions for clinics around the world.
            </div>
          </div>

          {/* Product navigation links */}
          <div className="footer-column">
            <div className="footer-column-title">Product</div>
            <div className="footer-links">
              <a href="#overview" className="footer-link">Overview</a>
              <a href={pricingLink} className="footer-link">Pricing</a>
              <a href="#features" className="footer-link">Features</a>
            </div>
          </div>

          {/* Resources navigation links */}
          <div className="footer-column">
            <div className="footer-column-title">Resources</div>
            <div className="footer-links">
              <a href="#guides" className="footer-link">Guides &amp; Tutorials</a>
              <a href="#help" className="footer-link">Help Center</a>
              <a href="#support" className="footer-link">Support</a>
            </div>
          </div>

          {/* Company navigation links */}
          <div className="footer-column">
            <div className="footer-column-title">Company</div>
            <div className="footer-links">
              <a href="#about" className="footer-link">About Us</a>
              <a href="#contact" className="footer-link">Contact</a>
            </div>
          </div>
        </div>

        {/* Footer bottom section */}
        <div className="footer-bottom">
          <div className="footer-copyright">
            ©2025 POWER IT Systems LLC. All rights reserved.
          </div>
          <div className="footer-legal-links">
            <a href="#terms" className="footer-legal-link">Terms &amp; Privacy</a>
            <a href="#security" className="footer-legal-link">Security</a>
            <a href="#status" className="footer-legal-link">Status</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Footer;
