import { useCallback, useEffect, useRef, useState } from "react"
import {
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  EyeOff,
  FileText,
  PackageCheck,
  Play,
  RefreshCw,
  Trash2,
  Warehouse,
  XCircle,
} from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { useDemo } from "../contexts/DemoContext"
import { useLang } from "../i18n/LangContext"
import {
  cleanupDemoData,
  fetchDemoRuns,
  fetchDemoScenarios,
  runDemoScenario,
  type DemoRun,
  type DemoScenario,
} from "../lib/dataService"
import { confirmAppAction, showAppToast } from "../lib/appEvents"
import { formatDateTimeUtc7 } from "../lib/dateUtils"

type ResultSummary = {
  demoRunId: string
  created?: Record<string, number>
  links?: Record<string, string | null>
}

export default function SystemDemo({
  onNavigate,
  onHide,
}: {
  onNavigate: (screen: string) => void
  onHide: () => void
}) {
  const { lang } = useLang()
  const vi = lang === "vi"
  const { profile } = useAuth()
  const { isDemo } = useDemo()
  const [scenarios, setScenarios] = useState<DemoScenario[]>([])
  const [runs, setRuns] = useState<DemoRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [runningCode, setRunningCode] = useState<string | null>(null)
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ResultSummary | null>(null)
  const runLocked = useRef(false)
  const isAdmin = String(profile?.role ?? "").toLowerCase() === "admin"

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const ctx = { isDemo, orgId: profile?.org_id }
    const [scenarioResult, runResult] = await Promise.all([
      fetchDemoScenarios(ctx),
      fetchDemoRuns(ctx),
    ])
    const sourceError = scenarioResult.error ?? runResult.error
    if (sourceError) setError(sourceError.message ?? String(sourceError))
    setScenarios(scenarioResult.data ?? [])
    setRuns(runResult.data ?? [])
    setLoading(false)
  }, [isDemo, profile?.org_id])

  useEffect(() => {
    void load()
  }, [load])

  async function runScenario(scenario: DemoScenario) {
    if (runLocked.current) return
    runLocked.current = true
    setRunningCode(scenario.code)
    setLastResult(null)
    try {
      const idempotencyKey = crypto.randomUUID()
      const result = await runDemoScenario(scenario.code, idempotencyKey, {
        isDemo,
        orgId: profile?.org_id,
      })
      if (result.error) throw result.error
      setLastResult(result.data as ResultSummary)
      showAppToast(
        vi ? `Scenario ${scenario.name} đã chạy thành công.` : `${scenario.name} completed successfully.`,
        "success",
      )
      await load()
    } catch (runError: any) {
      showAppToast(runError?.message ?? (vi ? "Không thể chạy scenario" : "Scenario failed"))
      await load()
    } finally {
      runLocked.current = false
      setRunningCode(null)
    }
  }

  async function removeDemoData(runId: string | null) {
    if (!isAdmin || deletingRunId) return
    const confirmed = await confirmAppAction(
      runId
        ? (vi ? "Xóa toàn bộ dữ liệu của lần chạy Demo này? Dữ liệu thật sẽ không bị ảnh hưởng." : "Delete every record from this Demo run? Real data will not be affected.")
        : (vi ? "Xóa toàn bộ dữ liệu Demo do bạn tạo? Dữ liệu thật sẽ không bị ảnh hưởng." : "Delete all Demo data you created? Real data will not be affected."),
      {
        destructive: true,
        confirmLabel: vi ? "Xóa dữ liệu demo" : "Delete Demo data",
      },
    )
    if (!confirmed) return
    setDeletingRunId(runId ?? "all")
    try {
      const result = await cleanupDemoData(runId, { isDemo, orgId: profile?.org_id })
      if (result.error) throw result.error
      setLastResult(null)
      showAppToast(
        vi
          ? `Đã xóa ${result.data?.deletedRecords ?? 0} bản ghi thuộc ${result.data?.deletedRuns ?? 0} lần chạy.`
          : `Deleted ${result.data?.deletedRecords ?? 0} records from ${result.data?.deletedRuns ?? 0} runs.`,
        "success",
      )
      await load()
    } catch (cleanupError: any) {
      showAppToast(cleanupError?.message ?? (vi ? "Không thể xóa dữ liệu Demo" : "Could not delete Demo data"))
    } finally {
      setDeletingRunId(null)
    }
  }

  function openQuotation(quotationId: string) {
    window.history.replaceState({}, "", `?screen=quotations&id=${encodeURIComponent(quotationId)}`)
    onNavigate("quotations")
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><RefreshCw size={22} className="animate-spin text-blue-600" /></div>
  }

  return (
    <div className="h-full overflow-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Boxes size={18} /></div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">{vi ? "Demo nghiệp vụ" : "Business Demo"}</h1>
                <p className="text-xs text-slate-500">{vi ? "Chạy smoke test trực tiếp qua các RPC nghiệp vụ thật của hệ thống." : "Run smoke tests through the system's real business RPCs."}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className="flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs text-slate-600 hover:bg-slate-50"><RefreshCw size={13} />{vi ? "Làm mới" : "Refresh"}</button>
            <button onClick={onHide} className="flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs text-slate-600 hover:bg-slate-50"><EyeOff size={13} />{vi ? "Ẩn tab Demo" : "Hide Demo tab"}</button>
          </div>
        </header>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
          {vi
            ? "Mỗi lần chạy có demo_run_id riêng, mọi dữ liệu được đánh dấu source=dataDemo và có thể xóa độc lập. Scenario vẫn áp dụng quyền hiện tại của bạn; các bước duyệt cần quyền approve."
            : "Each run has its own demo_run_id, all records are marked source=dataDemo, and can be removed independently. Scenarios still enforce your current business permissions."}
        </div>

        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <span>{error}</span><button onClick={() => void load()} className="font-semibold underline">{vi ? "Thử lại" : "Retry"}</button>
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map(scenario => (
            <article key={scenario.code} className="flex min-h-44 flex-col rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  {scenario.finalStatus === "DELIVERED" ? <PackageCheck size={17} /> : scenario.code === "MASTER_DATA" ? <Database size={17} /> : <FileText size={17} />}
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">{scenario.finalStatus}</span>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-slate-900">{scenario.name}</h2>
              <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">{scenario.description}</p>
              <button disabled={Boolean(runningCode)} onClick={() => void runScenario(scenario)} className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {runningCode === scenario.code ? <><RefreshCw size={13} className="animate-spin" />{vi ? "Đang tạo dữ liệu..." : "Creating data..."}</> : <><Play size={13} />{vi ? "Chạy flow" : "Run flow"}</>}
              </button>
            </article>
          ))}
        </section>

        {lastResult && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} />{vi ? "Demo tạo thành công" : "Demo created successfully"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(lastResult.created ?? {}).map(([key, value]) => <span key={key} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] text-emerald-800">{key}: <b>{value}</b></span>)}
            </div>
            <div className="mt-3 flex gap-2">
              {lastResult.links?.quotationId && <button onClick={() => openQuotation(lastResult.links!.quotationId!)} className="flex h-8 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white"><FileText size={12} />{vi ? "Xem báo giá" : "View quotation"}</button>}
              {lastResult.links?.warehouseId && <button onClick={() => onNavigate("stock-balance")} className="flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800"><Warehouse size={12} />{vi ? "Xem tồn kho" : "View inventory"}</button>}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <div><h2 className="text-sm font-semibold text-slate-900">{vi ? "Các lần chạy gần đây" : "Recent runs"}</h2><p className="mt-0.5 text-[10px] text-slate-400">{vi ? "Tối đa 30 lần chạy trong tổ chức" : "Latest 30 organization runs"}</p></div>
            {isAdmin && runs.length > 0 && <button disabled={Boolean(deletingRunId)} onClick={() => void removeDemoData(null)} className="flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><Trash2 size={12} />{vi ? "Xóa dữ liệu Demo của tôi" : "Delete my Demo data"}</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead><tr className="bg-slate-50 text-left text-[10px] uppercase text-slate-500"><th className="px-4 py-2.5">{vi ? "Thời gian" : "Time"}</th><th className="px-4 py-2.5">Scenario</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">demo_run_id</th><th className="px-4 py-2.5 text-right">{vi ? "Thao tác" : "Action"}</th></tr></thead>
              <tbody>
                {runs.map(run => <tr key={run.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-3 text-slate-500">{formatDateTimeUtc7(run.started_at)}</td><td className="px-4 py-3 font-medium text-slate-800">{run.scenario_code}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${run.status === "SUCCESS" ? "bg-emerald-100 text-emerald-700" : run.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{run.status === "SUCCESS" ? <CheckCircle2 size={10} /> : run.status === "FAILED" ? <XCircle size={10} /> : <Clock3 size={10} />}{run.status}</span>{run.error_message && <div title={run.error_message} className="mt-1 max-w-xs truncate text-[9px] text-red-500">{run.error_message}</div>}</td><td className="px-4 py-3 font-mono text-[10px] text-slate-400">{run.id}</td><td className="px-4 py-3 text-right">{isAdmin && <button disabled={Boolean(deletingRunId)} onClick={() => void removeDemoData(run.id)} className="h-7 rounded-lg border px-2 text-[10px] text-red-600 hover:bg-red-50 disabled:opacity-40">{deletingRunId === run.id ? "..." : (vi ? "Xóa run" : "Delete run")}</button>}</td></tr>)}
                {runs.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-slate-400">{vi ? "Chưa có lần chạy Demo nào." : "No Demo runs yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          {!isAdmin && runs.length > 0 && <div className="border-t bg-amber-50 px-4 py-2.5 text-[10px] text-amber-700">{vi ? "Chỉ quản trị viên có thể xóa dữ liệu Demo." : "Only administrators can delete Demo data."}</div>}
        </section>
      </div>
    </div>
  )
}
