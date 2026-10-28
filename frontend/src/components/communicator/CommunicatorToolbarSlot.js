import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// CommunicatorPage supplies an element inside its frozen header block (under the title and tabs). Each tab renders
// its toolbar into it, so the toolbar stays put while the page scrolls. Without a slot (the Messages page, tests)
// the toolbar renders inline where it is written.
export const CommunicatorToolbarSlotContext = createContext(null);

// Where the pinned table header sits: under the navy bar (64px) and the frozen block.
export const STICKY_TOP = "calc(64px + var(--communicator-sticky-h, 150px))";

export function useToolbarSlot() {
  return useContext(CommunicatorToolbarSlotContext);
}

export default function ToolbarPortal({ children }) {
  const slot = useContext(CommunicatorToolbarSlotContext);
  return slot ? createPortal(children, slot) : children;
}
