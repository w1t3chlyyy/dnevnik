import { createClient } from "@supabase/supabase-js";

// service-role ключ используется только в server-side (api routes / bot),
// никогда не попадает в MiniApp-фронт
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
