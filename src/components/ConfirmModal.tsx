import React from "react"
import { X, Check, XCircle } from "lucide-react"
import { useLang } from "../i18n/LangContext"

export default function ConfirmModal({ open, title, message, onConfirm, onCancel }: { open: boolean; title?: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  const { lang } = useLang()
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <XCircle size={22} className="text-red-500" />
          </div>
          {title && <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>}
          <p className="text-xs text-slate-500 leading-relaxed mb-1">{message}</p>
        </div>
        <div className="flex gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onCancel} className="flex-1 h-8 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>{lang === "vi" ? "Hủy" : "Cancel"}</button>
          <button onClick={onConfirm} className="flex-1 h-8 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700">{lang === "vi" ? "Xác nhận" : "Confirm"}</button>
        </div>
      </div>
    </div>
  )
}
