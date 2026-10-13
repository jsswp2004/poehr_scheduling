// Fixed answers to the problems patients actually hit. No AI, no network calls, nothing sent
// anywhere: it can't see the visit or the patient, so there is nothing for it to leak.
const TOPICS = [
  {
    q: "My camera or microphone isn't working",
    a: [
      "When your browser asks to use the camera and microphone, choose Allow. If you chose Block, tap the lock or camera icon next to the web address and change it to Allow.",
      "Close other apps that might be using the camera, such as FaceTime, Zoom or Teams.",
      "Refresh this page. If it says the link can't be used, call the clinic for a new link.",
    ],
  },
  {
    q: "I can't hear, or they can't hear me",
    a: [
      "Turn up your device volume and check it isn't on silent.",
      "Make sure the Mute button in the call says Mute, not Unmute.",
      "Try headphones, or hold the phone closer.",
    ],
  },
  {
    q: "The picture is frozen or choppy",
    a: [
      "Move closer to your Wi-Fi router, or switch between Wi-Fi and mobile data.",
      "Close other tabs and apps.",
      "Turn your camera off with the Camera button. Your provider can still hear you, and it uses much less data.",
    ],
  },
  {
    q: "I left the visit by accident",
    a: ["Tap Rejoin visit. You don't need a new link."],
  },
  {
    q: "Nothing is happening",
    a: [
      "In the waiting room, your provider lets you in when they're ready. Keep this page open.",
      "On a phone, don't lock the screen. It can disconnect you.",
    ],
  },
];

export default function PatientHelp({ clinicPhone }) {
  return (
    <section className="th-help" aria-label="Help">
      <details>
        <summary>Need help?</summary>
        {TOPICS.map((topic) => (
          <details key={topic.q} className="th-help-topic">
            <summary>{topic.q}</summary>
            <ul className="th-plain-list">
              {topic.a.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ))}
        <p>
          Still stuck?{" "}
          {clinicPhone ? (
            <a href={`tel:${clinicPhone}`}>Call the clinic at {clinicPhone}</a>
          ) : (
            "Call the clinic and they'll help you."
          )}
        </p>
      </details>
    </section>
  );
}
