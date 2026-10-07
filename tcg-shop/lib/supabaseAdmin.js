// Server-only client with the service role key (bypasses RLS). Import only from pages/api.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
