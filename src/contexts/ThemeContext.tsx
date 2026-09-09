import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type ThemePreference = "light" | "dark" | "system"
type ResolvedTheme = Exclude<ThemePreference, "system">

type ThemeContextValue = {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = "warehouseos-theme"

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system"
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system"
  } catch {
    return "system"
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "light" : getSystemTheme(),
  )
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(media.matches ? "dark" : "light")
    handleChange()
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Theme still applies for this session when storage is unavailable.
    }
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.dataset.theme = resolvedTheme
  }, [theme, resolvedTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be inside ThemeProvider")
  return context
}
