import AnnouncementsManager from "../components/announcements/AnnouncementsManager";

// Announcements tab of Messages: write, schedule and switch off the notices on the dashboard.
// (inShell is kept so Messages can pass it; the layout is the same either way.)
function AnnouncementsPage() {
  return <AnnouncementsManager />;
}

export default AnnouncementsPage;
