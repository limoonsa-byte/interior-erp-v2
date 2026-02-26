"use client";

import { createContext, useContext, useState } from "react";

type RightPanelContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const RightPanelContext = createContext<RightPanelContextType | null>(null);

export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <RightPanelContext.Provider value={{ open, setOpen }}>
      {children}
    </RightPanelContext.Provider>
  );
}

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  if (!ctx) return { open: true, setOpen: () => {} };
  return ctx;
}
