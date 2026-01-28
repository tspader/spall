import {
  createContext,
  useContext,
  type ParentProps,
  type Accessor,
} from "solid-js";

export type SidebarSection = "files" | "comments";

interface SidebarContextValue {
  activeSection: Accessor<SidebarSection>;
}

const SidebarContext = createContext<SidebarContextValue>();

export function SidebarProvider(
  props: ParentProps<{ activeSection: Accessor<SidebarSection> }>,
) {
  const value: SidebarContextValue = {
    activeSection: props.activeSection,
  };

  return (
    <SidebarContext.Provider value={value}>
      {props.children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
