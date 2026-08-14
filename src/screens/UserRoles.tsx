import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import type { Database } from "../lib/database.types"
import { useLang } from "../i18n/LangContext"

export default function UserRoles() {
  const { profile } = useAuth()
  const { lang } = useLang()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    async function load() {
      if (!profile) return
      setLoading(true)
      const { data: userData, error: userErr } = await supabase.from("profiles").select("id, email, full_name, role").eq("org_id", profile.org_id)
      if (userErr) {
        setLoading(false)
        return showToast(lang === "vi" ? "Không tải được người dùng" : "Unable to load users", false)
      }

      const safeUserData = (userData ?? []).map((u: any) => ({ ...u, role: u.role ?? "user" }))
      setUsers(safeUserData)
      setLoading(false)
    }
    load()
  }, [profile, lang])

  const changeRole = async (id: string, role: string) => {
    if (!profile) return
    setLoading(true)
    const { error } = await (supabase as any).from("profiles").update({ role } as any).eq("id", id).eq("org_id", profile.org_id)
    setLoading(false)
    if (error) { showToast(lang === "vi" ? "Cập nhật vai trò thất bại" : "Failed to update role", false); return }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
    showToast(lang === "vi" ? "Đã cập nhật vai trò" : "Role updated")
  }

  return (
    <div className="p-5">
      {toast && <div className={`mb-4 p-3 rounded ${toast.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}
      <h2 className="text-lg font-semibold mb-4">{lang === "vi" ? "Quản lý vai trò" : "User Roles"}</h2>
      {loading && <div className="text-sm text-slate-500">{lang === "vi" ? "Đang tải..." : "Loading..."}</div>}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-4 p-3 border rounded" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1">
              <div className="text-sm font-medium">{u.full_name || u.email}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <select value={u.role || "user"} onChange={e => changeRole(u.id, e.target.value)} className="h-8 px-3 rounded border text-sm" style={{ borderColor: "var(--border)" }}>
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
