import { useState, useEffect } from "react";
import AutoEmailSetUpPage from "./AutoEmailSetUpPage";
import AutoSMSSetUpPage from "./AutoSMSSetUpPage";
import AnnouncementsPage from "./AnnouncementsPage";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { BuilderShell } from "../components/builders/BuilderShell";

// Messages: automatic email and text reminders plus announcements. Laid out like the builder pages
// (pinned header on the page background, pill tabs, a pinned toolbar for Save and Run Now).
function MessagesPage() {
  const [tab, setTab] = useState("email");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || "";
      if (role !== "admin" && role !== "system_admin" && role !== "registrar") {
        navigate("/");
      }
    } catch (err) {
      navigate("/login");
    }
  }, [navigate]);

  return (
    <BuilderShell
      title="Messages"
      subtitle="Automatic emails and texts to patients, and announcements for your organization."
      tabs={[
        { key: "email", label: "Email" },
        { key: "sms", label: "SMS" },
        { key: "announcements", label: "Announcements" },
      ]}
      tab={tab}
      onTab={setTab}
      maxWidth={1280}
    >
      {tab === "email" && <AutoEmailSetUpPage inShell />}
      {tab === "sms" && <AutoSMSSetUpPage inShell />}
      {tab === "announcements" && <AnnouncementsPage inShell />}
    </BuilderShell>
  );
}

export default MessagesPage;
