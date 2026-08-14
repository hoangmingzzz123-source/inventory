import { createContext, useContext, useState, type ReactNode } from "react"

interface DemoCtx {
  isDemo: boolean
  setDemo: (v: boolean) => void
}

const Ctx = createContext<DemoCtx>({ isDemo: false, setDemo: () => {} })

export function DemoProvider({ children }: { children: ReactNode }) {
  // Default to live mode so real Supabase data is used unless the app explicitly switches to demo.
  const [isDemo, setDemo] = useState(false)
  return <Ctx.Provider value={{ isDemo, setDemo }}>{children}</Ctx.Provider>
}

export function useDemo() {
  return useContext(Ctx)
}
