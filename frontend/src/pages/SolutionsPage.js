import "../SolutionsPage/SolutionsPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

import SchedulerImage from "../assets/Scheduler.png";
import CommunicatorImage from "../assets/communicator.png";
import PortalImage from "../assets/Portal.png";
import StaffingImage from "../assets/dashboard_clinician.png";
import DocumentationImage from "../assets/documentation.png";
import TelehealthImage from "../assets/telehealth.jpg";
import DictationImage from "../assets/dictation.jpg";
import MdsImage from "../assets/mds.jpg";

export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();
  const handleDocumentationClick = () => {
    // Documentation keeps the previous default Scheduler-button behavior:
    // plain login, role-based default landing (Patients tab for clinical
    // staff roles).
    navigate("/login");
  };
  const handleSchedulerClick = () => {
    // Scheduler now sends users straight to the Appointments tab (which
    // itself opens on "Today's Appointments") instead of the Patients tab.
    navigate("/login?redirect=scheduler");
  };
  const handleCommunicatorClick = () => {
    // Always navigate to login with communicator redirect
    navigate("/login?redirect=communicator");
  };

  const handlePortalClick = () => {
    // Always navigate to login with portal redirect (to dashboard)
    navigate("/login?redirect=portal");
  };
  const handleStaffingClick = () => {
    // Always navigate to login with staffing redirect
    navigate("/login?redirect=staffing");
  };
  const handleTelehealthClick = () => {
    // Always navigate to login with telehealth redirect
    navigate("/login?redirect=telehealth");
  };
  const handleDictateClick = () => {
    // Always navigate to login with dictate redirect
    navigate("/login?redirect=dictate");
  };
  const handleMdsClick = () => {
    // No dedicated MDS route yet: login with the default role-based landing.
    navigate("/login?redirect=mds");
  };
  return (
    <div className={`solutions-page ${className || ""}`}>
      <Header />
      <div className="solutions-content">
        <div
          className="solution-button"
          onClick={handleDocumentationClick}
          style={{ cursor: "pointer" }}
        >
          <img
            src={DocumentationImage}
            alt="POWER Notes"
            className="solution-image"
          />
          <div className="solution-label">POWER Notes</div>
        </div>
        <div
          className="solution-button"
          onClick={handleSchedulerClick}
          style={{ cursor: "pointer" }}
        >
          <img
            src={SchedulerImage}
            alt="POWER Scheduler"
            className="solution-image"
          />
          <div className="solution-label">POWER Scheduler</div>
        </div>
        <div
          className="solution-button"
          onClick={handleCommunicatorClick}
          style={{ cursor: "pointer" }}
        >
          <img
            src={CommunicatorImage}
            alt="POWER Communicator"
            className="solution-image"
          />
          <div className="solution-label">POWER Communicator</div>
        </div>{" "}
        <div
          className="solution-button"
          onClick={handlePortalClick}
          style={{ cursor: "pointer" }}
        >
          <img src={PortalImage} alt="POWER Patient Portal" className="solution-image" />
          <div className="solution-label">POWER Patient Portal</div>
        </div>
        <div
          className="solution-button"
          onClick={handleStaffingClick}
          style={{ cursor: "pointer" }}
        >
          <img src={StaffingImage} alt="POWER Staffing" className="solution-image" />
          <div className="solution-label">POWER Staffing</div>
        </div>
        <div
          className="solution-button"
          onClick={handleTelehealthClick}
          style={{ cursor: "pointer" }}
        >
          <img src={TelehealthImage} alt="POWER Telehealth" className="solution-image" />
          <div className="solution-label">POWER Telehealth</div>
        </div>
        <div
          className="solution-button"
          onClick={handleDictateClick}
          style={{ cursor: "pointer" }}
        >
          <img src={DictationImage} alt="POWER Dictate" className="solution-image" />
          <div className="solution-label">POWER Dictate</div>
        </div>
        <div
          className="solution-button"
          onClick={handleMdsClick}
          style={{ cursor: "pointer" }}
        >
          <img src={MdsImage} alt="POWER MDS Assessment Portal" className="solution-image" />
          <div className="solution-label">POWER MDS</div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
