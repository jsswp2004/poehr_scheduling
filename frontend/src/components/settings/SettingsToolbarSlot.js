import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// SettingsPage supplies an element inside its pinned header block (under the title and tabs). Each tab renders its
// toolbar (Save, Add, counts) into it so it stays put while the page scrolls. Without a slot (tests, a component
// used on its own) the toolbar renders inline where it is written.
export const SettingsToolbarSlotContext = createContext(null);

// Where pinned content sits: under the navy bar (64px) and the pinned block.
export const SETTINGS_STICKY_TOP = "calc(64px + var(--settings-sticky-h, 150px))";

export default function SettingsToolbarPortal({ children }) {
  const slot = useContext(SettingsToolbarSlotContext);
  return slot ? createPortal(children, slot) : children;
}
