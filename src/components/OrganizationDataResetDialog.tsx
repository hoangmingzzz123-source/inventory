import { useState, type FormEvent } from "react"
import { AlertTriangle, KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react"
import { verifyResetCodeAndResetOrganization } from "../lib/organizationReset"

const CONFIRMATION_PHRASE = "XOA DU LIEU"

export default function OrganizationDataResetDialog({
  orgId,
  organizationName,
  lang,
  onClose,
}: {
  orgId: string
  organizationName: string
  lang: "vi" | "en"
  onClose: () => void
}) {
  const vi = lang === "vi"
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [phrase, setPhrase] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const verifyAndReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!resetCode.trim()) {
      setError(vi ? "Nhập mã xác nhận." : "Enter the confirmation code.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const result = await verifyResetCodeAndResetOrganization({
        code: resetCode.trim(),
        orgId,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      window.location.reload()
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-dialog-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              {step === 3 ? <ShieldCheck size={19} /> : <AlertTriangle size={19} />}
            </div>
            <div>
              <h2 id="reset-dialog-title" className="text-sm font-semibold text-slate-900">
                {vi ? `Xóa dữ liệu · Bước ${step}/3` : `Clear data · Step ${step}/3`}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {organizationName}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={vi ? "Đóng" : "Close"}
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {step < 3 ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                {vi
                  ? "Thao tác này xóa vĩnh viễn sản phẩm, tồn kho, đơn hàng, báo giá, tài chính, danh mục, cài đặt và nhật ký của tổ chức. Hồ sơ thành viên đã tham gia được giữ lại trong tổ chức trống mới; vai trò và quyền cần cấu hình lại, lời mời đang chờ sẽ bị xóa. Không thể khôi phục dữ liệu cũ."
                  : "This permanently clears the organization’s products, inventory, orders, quotations, finance records, catalogs, settings, and audit history. Existing member profiles remain in a new empty organization; roles and permissions must be configured again, and pending invitations are removed. Deleted data cannot be restored."}
              </div>
              {step === 2 && (
                <label className="block text-xs font-medium text-slate-700">
                  {vi ? "Nhập chính xác cụm từ để tiếp tục:" : "Type this phrase exactly to continue:"}
                  <span className="mt-2 block font-mono font-bold tracking-wider text-red-700">
                    {CONFIRMATION_PHRASE}
                  </span>
                  <input
                    autoFocus
                    value={phrase}
                    onChange={event => setPhrase(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    autoComplete="off"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {vi ? "Hủy" : "Cancel"}
                </button>
                {step === 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="h-9 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    {vi ? "Tôi hiểu, tiếp tục" : "I understand, continue"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={phrase !== CONFIRMATION_PHRASE || busy}
                    onClick={() => setStep(3)}
                    className="flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy && <LoaderCircle size={14} className="animate-spin" />}
                    {vi ? "Xác nhận lần 2 · Tiếp tục" : "Confirm 2 · Continue"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={verifyAndReset} className="space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <KeyRound size={14} />
                  {vi ? "Xác nhận lần 3 bằng mã cố định" : "Confirm 3 with fixed code"}
                </div>
                {vi
                  ? "Nhập mã xác nhận để hoàn tất việc xóa dữ liệu."
                  : "Enter the confirmation code to finish clearing the data."}
              </div>
              <label className="block text-xs font-medium text-slate-700">
                {vi ? "Mã xác nhận" : "Confirmation code"}
                <input
                  autoFocus
                  required
                  type="password"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={resetCode}
                  onChange={event => setResetCode(event.target.value.toUpperCase())}
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-sm tracking-wider outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {vi ? "Hủy" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={!resetCode.trim() || busy}
                  className="flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <LoaderCircle size={14} className="animate-spin" />}
                  {vi ? "Xác minh mã và xóa" : "Verify code and clear"}
                </button>
              </div>
            </form>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>
      </section>
    </div>
  )
}
