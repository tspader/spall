import { createContext, useContext, createSignal, type JSX, type ParentProps } from "solid-js"

interface DialogContextValue {
  show: (element: () => JSX.Element) => void
  clear: () => void
  isOpen: () => boolean
  content: () => JSX.Element | null
}

const DialogContext = createContext<DialogContextValue>()

export function DialogProvider(props: ParentProps) {
  const [content, setContent] = createSignal<(() => JSX.Element) | null>(null)

  const value: DialogContextValue = {
    show: (element) => setContent(() => element),
    clear: () => setContent(null),
    isOpen: () => content() !== null,
    content: () => {
      const c = content()
      return c ? c() : null
    },
  }

  return (
    <DialogContext.Provider value={value}>
      {props.children}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error("useDialog must be used within DialogProvider")
  return ctx
}
