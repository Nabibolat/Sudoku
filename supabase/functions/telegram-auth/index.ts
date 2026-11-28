import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return response({ error: "Telegram auth is not configured" }, 503);
  try {
    const body = await req.json();
    const initData = typeof body?.initData === "string" ? body.initData : "";
    if (!initData || initData.length > 10_000) return response({ error: "Invalid initData" }, 400);
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash") || "";
    if (!/^[a-f0-9]{64}$/i.test(receivedHash)) return response({ error: "Invalid Telegram signature" }, 401);
    const fields = [...params.entries()].filter(([key]) => key !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
    const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
    const calculatedHash = toHex(await hmacSha256(secretKey, fields));
    if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) return response({ error: "Telegram signature verification failed" }, 401);
    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(authDate) || authDate > now + 60 || now - authDate > 86_400) return response({ error: "Telegram session expired. Reopen the Mini App." }, 401);
    const userRaw = params.get("user");
    if (!userRaw) return response({ error: "Telegram user is missing" }, 401);
    const user = JSON.parse(userRaw);
    if (!Number.isSafeInteger(user?.id) || user.id <= 0) return response({ error: "Invalid Telegram user" }, 401);
    return response({ ok: true, user: { id: user.id, first_name: typeof user.first_name === "string" ? user.first_name : "", last_name: typeof user.last_name === "string" ? user.last_name : "", username: typeof user.username === "string" ? user.username : null, photo_url: typeof user.photo_url === "string" ? user.photo_url : null, language_code: typeof user.language_code === "string" ? user.language_code : null }, auth_date: authDate });
  } catch {
    return response({ error: "Invalid request" }, 400);
  }
});
