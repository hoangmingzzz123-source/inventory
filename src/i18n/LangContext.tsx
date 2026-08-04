import { createContext, useContext, useState, type ReactNode } from "react"
import { type Lang, type TKey, t as translate } from "./index"

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}

const LangContext = createContext<LangCtx>({
  lang: "vi",
  setLang: () => {},
  t: (key) => translate("vi", key),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("vi")
  const t = (key: TKey) => translate(lang, key)
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
