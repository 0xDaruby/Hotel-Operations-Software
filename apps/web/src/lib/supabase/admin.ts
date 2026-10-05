import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
export function createAdminClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error(
      "Staff account creation requires the server SUPABASE_SERVICE_ROLE_KEY.",
    );
  return createClient(getSupabaseConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function staffSetupRedirect() {
  const origin = process.env.WEB_ORIGIN;
  if (!origin) throw new Error("Staff setup requires WEB_ORIGIN.");
  const url = new URL(origin);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("WEB_ORIGIN must be a trusted application origin.");
  return `${url.origin}/auth/confirm?next=/set-password`;
}
