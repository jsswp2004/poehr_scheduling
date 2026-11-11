import { useState } from "react";
import { Button } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./headerApi";
import { HeaderEditDialog } from "./PatientChartHeader";

/**
 * "Allergy Manager" for use inside a note: opens the same dialog as the patient header's edit pencil
 * (add, inactivate or remove an allergy, or record no known allergies). `onChanged` runs after each change
 * so the note can re-read the chart; the header banner is told to refresh as well.
 */
export default function AllergyManagerButton({ patientId, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const headers = await authHeader();
    const res = await api.get(apiEndpoints.patientHeader(patientId), { headers });
    setData(res.data);
    return res.data;
  };

  const open = async () => {
    setBusy(true);
    try {
      await load();
    } catch (err) {
      toast.error(errorText(err, "Could not open the Allergy Manager."));
    } finally {
      setBusy(false);
    }
  };

  const changed = async () => {
    await load();
    window.dispatchEvent(new Event("patient-header-changed"));
    if (onChanged) onChanged();
  };

  return (
    <>
      <Button size="small" variant="outlined" onClick={open} disabled={!patientId || busy}>
        Allergy Manager
      </Button>
      {data && <HeaderEditDialog patientId={patientId} data={data} onChanged={changed} onClose={() => setData(null)} />}
    </>
  );
}
