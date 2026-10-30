import { useEffect, useMemo } from "react";
import "../SolutionsPage/SolutionsPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { currentSignIn, solutionsFor } from "../utils/landing";

import SchedulerImage from "../assets/Scheduler.png";
import CommunicatorImage from "../assets/communicator.png";
import PortalImage from "../assets/Portal.png";
import StaffingImage from "../assets/dashboard_clinician.png";
import DocumentationImage from "../assets/documentation.png";
import TelehealthImage from "../assets/telehealth.jpg";
import DictationImage from "../assets/dictation.jpg";

const IMAGES = {
  notes: DocumentationImage,
  scheduler: SchedulerImage,
  communicator: CommunicatorImage,
  portal: PortalImage,
  staffing: StaffingImage,
  telehealth: TelehealthImage,
  dictate: DictationImage,
};

// The page people reach after signing in: one tile for each service their organization has and their role
// may open. Someone who is not signed in is sent to the login page.
export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();
  const me = useMemo(() => currentSignIn(), []);
  const tiles = useMemo(() => (me ? solutionsFor(me.role, me.modules) : []), [me]);

  useEffect(() => {
    if (!me) navigate("/login", { replace: true });
  }, [me, navigate]);

  return (
    <div className={`solutions-page ${className || ""}`}>
      <Header />
      <div className="solutions-content">
        {tiles.map((t) => (
          <div
            key={t.key}
            className="solution-button"
            role="button"
            tabIndex={0}
            onClick={() => navigate(t.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(t.path);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <img src={IMAGES[t.key]} alt="" className="solution-image" />
            <div className="solution-label">{t.label}</div>
          </div>
        ))}
        {me && tiles.length === 0 && (
          <p style={{ textAlign: "center", width: "100%" }}>
            No services are available for your account yet. Please contact your administrator.
          </p>
        )}
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
