import {
  createContext,
  useContext,
  type ParentProps,
  type Accessor,
} from "solid-js";

export type SidebarSection = "files" | "comments" | "patches";

interface SidebarContextValue {
  activeSection: Accessor<SidebarSection>;
  isFocused: Accessor<boolean>;
}

const SidebarContext = createContext<SidebarContextValue>();

export function SidebarProvider(
  props: ParentProps<{
    activeSection: Accessor<SidebarSection>;
    isFocused: Accessor<boolean>;
  }>,
) {
  const value: SidebarContextValue = {
    activeSection: props.activeSection,
    isFocused: props.isFocused,
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
