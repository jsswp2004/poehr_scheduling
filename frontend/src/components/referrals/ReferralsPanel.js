import ReferralWorklist from "./ReferralWorklist";
import useMe from "./useMe";

/** The Referral List chart tab: the selected patient's referrals. */
export default function ReferralsPanel({ patient }) {
  const me = useMe();
  return <ReferralWorklist key={patient.id} patient={patient} me={me} />;
}
