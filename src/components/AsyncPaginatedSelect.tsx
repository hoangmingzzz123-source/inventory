import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Loader2, Search, X } from "lucide-react"

export type AsyncSelectOption = {
  value: string
  label: string
  [key: string]: unknown
}

export type AsyncSelectPage<T extends AsyncSelectOption = AsyncSelectOption> = {
  options: T[]
  hasMore: boolean
}

type AsyncPaginatedSelectProps<T extends AsyncSelectOption> = {
  value: string
  onChange: (value: string, option: T | null) => void
  loadPage: (search: string, offset: number, limit: number) => Promise<AsyncSelectPage<T>>
  selectedOption?: T | null
  placeholder: string
  searchPlaceholder?: string
  emptyText?: string
  loadingText?: string
  loadMoreText?: string
  disabled?: boolean
  allowClear?: boolean
  pageSize?: number
  className?: string
  buttonClassName?: string
}

function uniqueOptions<T extends AsyncSelectOption>(options: T[]) {
  const byValue = new Map<string, T>()
  for (const option of options) byValue.set(option.value, option)
  return Array.from(byValue.values())
}

export default function AsyncPaginatedSelect<T extends AsyncSelectOption>({
  value,
  onChange,
  loadPage,
  selectedOption = null,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No matching data",
  loadingText = "Loading...",
  loadMoreText = "Load more",
  disabled = false,
  allowClear = true,
  pageSize = 30,
  className = "",
  buttonClassName = "h-9 text-sm",
}: AsyncPaginatedSelectProps<T>) {
  const listboxId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const loadingRef = useRef(false)
  const optionsRef = useRef<T[]>([])
  const searchRef = useRef("")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [options, setOptions] = useState<T[]>([])
  const [selection, setSelection] = useState<T | null>(selectedOption)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState("")
  const [panelPosition, setPanelPosition] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
  }>({ left: 0, width: 240, top: 0 })

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    searchRef.current = search
  }, [search])

  useEffect(() => {
    if (!value) {
      setSelection(null)
      return
    }
    if (selectedOption?.value === value) {
      setSelection(current => current?.value === selectedOption.value && current.label === selectedOption.label
        ? current
        : selectedOption)
      return
    }
    const loaded = options.find(option => option.value === value)
    if (loaded) setSelection(loaded)
  }, [options, selectedOption, value])

  const updatePanelPosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    const availableBelow = window.innerHeight - rect.bottom
    const openAbove = availableBelow < 280 && rect.top > availableBelow
    const panelWidth = Math.min(Math.max(rect.width, 240), Math.max(window.innerWidth - 16, 0))
    setPanelPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8)),
      width: panelWidth,
      ...(openAbove
        ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) }
        : { top: rect.bottom + 4 }),
    })
  }, [])

  const replacePage = useCallback(async (query: string) => {
    const requestId = ++requestIdRef.current
    loadingRef.current = true
    setLoading(true)
    setError("")
    try {
      const page = await loadPage(query, 0, pageSize)
      if (requestId !== requestIdRef.current) return
      setOptions(uniqueOptions(page.options))
      setHasMore(page.hasMore)
    } catch (loadError: any) {
      if (requestId !== requestIdRef.current) return
      setOptions([])
      setHasMore(false)
      setError(loadError?.message ?? String(loadError))
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [loadPage, pageSize])

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    const requestId = ++requestIdRef.current
    const query = searchRef.current
    const offset = optionsRef.current.length
    loadingRef.current = true
    setLoading(true)
    setError("")
    try {
      const page = await loadPage(query, offset, pageSize)
      if (requestId !== requestIdRef.current) return
      setOptions(current => uniqueOptions([...current, ...page.options]))
      setHasMore(page.hasMore)
    } catch (loadError: any) {
      if (requestId !== requestIdRef.current) return
      setError(loadError?.message ?? String(loadError))
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [hasMore, loadPage, pageSize])

  useEffect(() => {
    if (!open) return
    updatePanelPosition()
    const timer = window.setTimeout(() => void replacePage(search), search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [open, replacePage, search, updatePanelPosition])

  useEffect(() => {
    if (!open) return
    const closeWhenOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    const reposition = () => updatePanelPosition()
    document.addEventListener("mousedown", closeWhenOutside)
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside)
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [open, updatePanelPosition])

  const choose = (option: T | null) => {
    setSelection(option)
    onChange(option?.value ?? "", option)
    setOpen(false)
    setSearch("")
  }

  const panel = open && !disabled ? createPortal(
    <div
      ref={panelRef}
      className="fixed z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
      style={panelPosition}
    >
      <div className="border-b border-slate-100 p-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-slate-200 px-2 focus-within:border-blue-400">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            autoFocus
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => { if (event.key === "Escape") setOpen(false) }}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          {search && <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>}
        </div>
      </div>
      <div
        id={listboxId}
        role="listbox"
        className="max-h-56 overflow-y-auto py-1"
        onScroll={event => {
          const target = event.currentTarget
          if (target.scrollHeight - target.scrollTop - target.clientHeight < 48) void loadNextPage()
        }}
      >
        {options.map(option => (
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            key={option.value}
            onClick={() => choose(option)}
            className={`block w-full truncate px-3 py-2 text-left text-xs hover:bg-blue-50 ${option.value === value ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700"}`}
            title={option.label}
          >
            {option.label}
          </button>
        ))}
        {!loading && options.length === 0 && !error && <div className="px-3 py-6 text-center text-xs text-slate-400">{emptyText}</div>}
        {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
        {loading && <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" />{loadingText}</div>}
        {!loading && hasMore && options.length > 0 && (
          <button type="button" onClick={() => void loadNextPage()} className="w-full px-3 py-2 text-center text-[10px] font-medium text-blue-600 hover:bg-blue-50">{loadMoreText}</button>
        )}
        {!loading && error && (
          <button type="button" onClick={() => void replacePage(search)} className="w-full px-3 py-2 text-center text-[10px] font-medium text-blue-600 hover:bg-blue-50">Retry</button>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div ref={anchorRef} className={`relative flex rounded-lg border bg-white focus-within:border-blue-400 ${disabled ? "bg-slate-50" : ""} ${className}`} style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={`min-w-0 flex-1 truncate px-3 text-left outline-none disabled:cursor-default ${selection || value ? "text-slate-800" : "text-slate-400"} ${buttonClassName}`}
        title={selection?.label ?? ""}
      >
        {selection?.label || placeholder}
      </button>
      {allowClear && value && !disabled && <button type="button" aria-label="Clear selection" onClick={() => choose(null)} className="px-1 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => setOpen(current => !current)} className="px-2 text-slate-400 disabled:cursor-default"><ChevronDown size={14} /></button>
      {panel}
    </div>
  )
}
