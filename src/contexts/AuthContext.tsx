import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string
  org_id: string
}

interface AuthCtx {
  session: Session | null
  user: User | null
  profile: Profile | null
  profileError: string | null
  loading: boolean
  permissions: Record<string, boolean>
  can: (module: string, action: string) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
    orgName: string,
    inviteToken?: string | null,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})

  async function loadProfile(userId: string) {
    setProfile(null)
    setProfileError(null)
    setPermissions({})
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
    if (error || !data) {
      setProfileError(
        error?.message ??
          "Authenticated profile was not found. Apply the latest database migrations and try again.",
      )
      return
    }
    if (data) {
      setProfile(data as Profile)
      if (String(data.role).toLowerCase() !== "admin" && data.org_id) {
        const { data: roleRows, error: roleError } = await (supabase as any)
          .from("roles")
          .select("id")
          .eq("org_id", data.org_id)
          .ilike("code", data.role)
          .limit(1)
        if (roleError) {
          setProfileError(roleError.message)
          return
        }
        const roleId = roleRows?.[0]?.id
        if (roleId) {
          const { data: permissionRows, error: permissionError } =
            await (supabase as any)
              .from("role_permissions")
              .select("module, action, allowed")
              .eq("role_id", roleId)
          if (permissionError) {
            setProfileError(permissionError.message)
            return
          }
          setPermissions(
            Object.fromEntries(
              (permissionRows ?? [])
                .filter((row: any) => row.allowed)
                .map((row: any) => [
                  `${String(row.module).toLowerCase()}:${String(row.action).toLowerCase()}`,
                  true,
                ]),
            ),
          )
        } else {
          setProfileError(
            `Role "${data.role}" is not configured for this organization.`,
          )
        }
      }
    }
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        void loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setProfileError(null)
        setPermissions({})
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error: error?.message ?? null }
  }

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    orgName: string,
    inviteToken?: string | null,
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          org_name: orgName,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        },
      },
    })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const can = useCallback(
    (module: string, action: string) => {
      if (!user) return true
      if (String(profile?.role ?? "").toLowerCase() === "admin") return true
      return Boolean(
        permissions[`${module.toLowerCase()}:${action.toLowerCase()}`],
      )
    },
    [user, profile?.role, permissions],
  )

  return (
    <Ctx.Provider
      value={{
        session,
        user,
        profile,
        profileError,
        loading,
        permissions,
        can,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be inside AuthProvider")
  return ctx
}
