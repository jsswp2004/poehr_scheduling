import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";

const OFF = { enabled: false, cleanup: false, specialty: null };
const DictationContext = createContext(OFF);

const EVENT = "dictation-config-changed";

/** Tell every open note form that the Dictation settings were saved, so the microphone appears or goes away. */
export const announceDictationChange = () => window.dispatchEvent(new Event(EVENT));

/**
 * Asks the server whether this person may dictate. Wrap a note form in it; anything outside it
 * (and anyone not allowed) sees dictation switched off. The server enforces the same rules.
 */
export function DictationProvider({ children }) {
  const [config, setConfig] = useState(OFF);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const { data } = await api.get(apiEndpoints.dictationConfig, { headers: await authHeader() });
        if (live) setConfig({ enabled: !!data.enabled, cleanup: !!data.cleanup, specialty: data.specialty || null });
      } catch (e) {
        if (live) setConfig(OFF);
      }
    };
    load();
    window.addEventListener(EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(EVENT, load);
    };
  }, []);

  return <DictationContext.Provider value={config}>{children}</DictationContext.Provider>;
}

export const useDictationConfig = () => useContext(DictationContext);
