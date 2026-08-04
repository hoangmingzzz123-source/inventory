import { createContext, useContext, useState, type ReactNode } from "react"

interface DemoCtx {
  isDemo: boolean
  setDemo: (v: boolean) => void
}

const Ctx = createContext<DemoCtx>({ isDemo: true, setDemo: () => {} })

export function DemoProvider({ children }: { children: ReactNode }) {
  // Default: demo mode ON (no real data until user logs in with a live org)
  const [isDemo, setDemo] = useState(true)
  return <Ctx.Provider value={{ isDemo, setDemo }}>{children}</Ctx.Provider>
}

export function useDemo() {
  return useContext(Ctx)
}
