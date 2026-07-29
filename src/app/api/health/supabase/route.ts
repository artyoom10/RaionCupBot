import { NextResponse } from "next/server";
import { TOURNAMENT_LOGO_URL } from "@/lib/branding";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result: {
    ok: boolean;
    env: "ok" | "missing";
    database: "ok" | "error" | "skipped";
    storageLogo: "ok" | "error";
    message?: string;
  } = {
    ok: false,
    env: hasEnv ? "ok" : "missing",
    database: "skipped",
    storageLogo: "error"
  };

  try {
    const logoResponse = await fetch(TOURNAMENT_LOGO_URL, { method: "HEAD", cache: "no-store" });
    result.storageLogo = logoResponse.ok ? "ok" : "error";
  } catch {
    result.storageLogo = "error";
  }

  if (!hasEnv) {
    result.message = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing";
    return NextResponse.json(result, { status: 500 });
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("app_settings").select("id").limit(1).maybeSingle();
    result.database = error ? "error" : "ok";
    result.ok = !error && result.storageLogo === "ok";
    if (error) {
      result.message = error.message;
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    result.database = "error";
    result.message = error instanceof Error ? error.message : "Unknown Supabase health error";
    return NextResponse.json(result, { status: 500 });
  }
}
