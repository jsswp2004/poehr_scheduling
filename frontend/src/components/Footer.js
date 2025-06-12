import POWERLogo from '../assets/POWER_IT.png';
import { Link } from 'react-router-dom';

export const Footer = ({ pricingLink = "/pricing", featuresLink = "/features" }) => {
  return (
    <div className="footer-section">
      <div className="footer-container">
        <div className="footer-content">
          {/* Company branding and description */}
          <div className="footer-brand">
            <div className="footer-logo">
              <img className="power-logo-footer" src={POWERLogo} alt="POWER IT Systems" />
              <div className="footer-brand-name">POWER HEALTHCARE IT SYSTEMS</div>
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
              <Link to="/overview" className="footer-link">Overview</Link>
              <Link to={pricingLink} className="footer-link">Pricing</Link>
              <Link to={featuresLink} className="footer-link">Features</Link>
            </div>
          </div>

          {/* Resources navigation links */}
          <div className="footer-column">
            <div className="footer-column-title">Resources</div>
            <div className="footer-links">
              {/*<a href="#guides" className="footer-link">Guides &amp; Tutorials</a>
              <a href="#help" className="footer-link">Help Center</a>*/}
              <Link to="/support" className="footer-link">Support</Link>
            </div>
          </div>

          {/* Company navigation links */}
          <div className="footer-column">
            <div className="footer-column-title">Company</div>
            <div className="footer-links">
              <Link to="/about" className="footer-link">About Us</Link>
              <Link to="/contact" className="footer-link">Contact</Link>
            </div>
          </div>
        </div>

        {/* Footer bottom section */}
        <div className="footer-bottom">
          <div className="footer-copyright">
            ©2025 POWER HEALTHCARE IT Systems LLC. All rights reserved.
          </div>
          <div className="footer-legal-links">
            <Link to="/terms" className="footer-legal-link">Terms &amp; Privacy</Link>
            {/*<a href="#security" className="footer-legal-link">Security</a>
            <a href="#status" className="footer-legal-link">Status</a>*/}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Footer;
