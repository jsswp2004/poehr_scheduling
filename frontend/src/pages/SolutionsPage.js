import "../SolutionsPage/SolutionsPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

import SchedulerImage from "../assets/Scheduler.png";
import CommunicatorImage from "../assets/communicator.png";
import PortalImage from "../assets/Portal.png";
import CheckInImage from "../assets/check_in.png";

export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();
  const handleSchedulerClick = () => {
    navigate("/login");
  };
  const handleCommunicatorClick = () => {
    // Always navigate to login with communicator redirect
    navigate("/login?redirect=communicator");
  };

  const handlePortalClick = () => {
    // Always navigate to login with portal redirect (to dashboard)
    navigate("/login?redirect=portal");
  };
  const handleCheckInClick = () => {
    // Always navigate to login with check-in redirect (to dashboard)
    navigate("/login?redirect=check-in");
  };
  return (
    <div className={`solutions-page ${className || ""}`}>
      <Header />
      <div className="solutions-content">
        <div
          className="solution-button"
          onClick={handleSchedulerClick}
          style={{ cursor: "pointer" }}
        >
          <img
            src={SchedulerImage}
            alt="Scheduler"
            className="solution-image"
          />
          <div className="solution-label">Scheduler</div>
        </div>
        <div
          className="solution-button"
          onClick={handleCommunicatorClick}
          style={{ cursor: "pointer" }}
        >
          <img
            src={CommunicatorImage}
            alt="Communicator"
            className="solution-image"
          />
          <div className="solution-label">Communicator</div>
        </div>{" "}
        <div
          className="solution-button"
          onClick={handlePortalClick}
          style={{ cursor: "pointer" }}
        >
          <img src={PortalImage} alt="Portal" className="solution-image" />
          <div className="solution-label">Patient Portal</div>
        </div>
        <div
          className="solution-button"
          onClick={handleCheckInClick}
          style={{ cursor: "pointer" }}
        >
          <img src={CheckInImage} alt="Check In" className="solution-image" />
          <div className="solution-label">Check-In</div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
