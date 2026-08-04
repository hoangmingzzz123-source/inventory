import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "jvyclpseixkqojcdxujp"}.supabase.co`
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2eWNscHNlaXhrcW9qY2R4dWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzQwNDUsImV4cCI6MjEwMTQxMDA0NX0.1A_N39G2afD1BpjI48R8cZoeYsKnsQo4NN1UCp3UGxA"

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
