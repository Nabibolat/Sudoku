import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

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

function getSupabaseSecretKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof keys.default === "string" ? keys.default : null;
  } catch {
    return null;
  }
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
    const fields = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
    const calculatedHash = toHex(await hmacSha256(secretKey, fields));
    if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) return response({ error: "Telegram signature verification failed" }, 401);

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(authDate) || authDate > now + 60 || now - authDate > 86_400) {
      return response({ error: "Telegram session expired. Reopen the Mini App." }, 401);
    }

    const userRaw = params.get("user");
    if (!userRaw) return response({ error: "Telegram user is missing" }, 401);
    const user = JSON.parse(userRaw);
    if (!Number.isSafeInteger(user?.id) || user.id <= 0) return response({ error: "Invalid Telegram user" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = getSupabaseSecretKey();
    if (!supabaseUrl || !serviceKey) return response({ error: "Database connection is not configured" }, 503);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const telegramId = String(user.id);
    const profile = {
      telegram_id: telegramId,
      first_name: typeof user.first_name === "string" ? user.first_name : "",
      last_name: typeof user.last_name === "string" ? user.last_name : null,
      username: typeof user.username === "string" ? user.username : null,
      photo_url: typeof user.photo_url === "string" ? user.photo_url : null,
      language_code: typeof user.language_code === "string" ? user.language_code : null,
      updated_at: new Date().toISOString(),
    };
    const { error: profileError } = await admin.from("player_profiles").upsert(profile, { onConflict: "telegram_id" });
    if (profileError) {
      console.error("Player profile upsert failed:", profileError.message);
      return response({ error: "Could not save player profile" }, 500);
    }

    const result = body?.result;
    if (result !== undefined && result !== null) {
      const validId = typeof result.game_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.game_id);
      const validLevel = ["Beginner", "Easy", "Medium", "Hard", "Expert", "Extreme"].includes(result.level);
      const validDuration = Number.isInteger(result.duration_seconds) && result.duration_seconds >= 0 && result.duration_seconds <= 86_400;
      const validScore = Number.isInteger(result.score) && result.score >= 0 && result.score <= 10_000_000;
      const validMistakes = Number.isInteger(result.mistakes) && result.mistakes >= 0 && result.mistakes <= 3;
      const validDailyDate = result.daily_date === null || result.daily_date === undefined || /^\d{4}-\d{2}-\d{2}$/.test(result.daily_date);
      if (!validId || !validLevel || typeof result.won !== "boolean" || !validDuration || !validScore || !validMistakes || !validDailyDate) {
        return response({ error: "Invalid game result" }, 400);
      }
      const { error: resultError } = await admin.from("game_results").upsert({
        id: result.game_id,
        telegram_id: telegramId,
        level: result.level,
        won: result.won,
        duration_seconds: result.duration_seconds,
        score: result.score,
        mistakes: result.mistakes,
        daily_date: result.daily_date || null,
      }, { onConflict: "id", ignoreDuplicates: true });
      if (resultError) {
        console.error("Game result save failed:", resultError.message);
        return response({ error: "Could not save game result" }, 500);
      }
    }

    const [games, wins, best, history] = await Promise.all([
      admin.from("game_results").select("id", { count: "exact", head: true }).eq("telegram_id", telegramId),
      admin.from("game_results").select("id", { count: "exact", head: true }).eq("telegram_id", telegramId).eq("won", true),
      admin.from("game_results").select("duration_seconds").eq("telegram_id", telegramId).eq("won", true).order("duration_seconds", { ascending: true }).limit(1).maybeSingle(),
      admin.from("game_results").select("level,won,duration_seconds,mistakes,daily_date,created_at").eq("telegram_id", telegramId).order("created_at", { ascending: false }).limit(500),
    ]);
    if (games.error || wins.error || best.error || history.error) {
      console.error("Player stats query failed:", games.error?.message, wins.error?.message, best.error?.message, history.error?.message);
      return response({ error: "Could not load player statistics" }, 500);
    }
    const rows = history.data || [];
    const gamesPlayed = games.count || 0;
    const winsCount = wins.count || 0;
    const wonRows = rows.filter((row) => row.won);
    const wonLevels = new Set(wonRows.map((row) => row.level));
    const dailyDays = new Set(wonRows.filter((row) => row.daily_date).map((row) => row.daily_date));
    const cleanWins = wonRows.filter((row) => row.mistakes === 0);
    let winStreak = 0;
    for (const row of rows) { if (!row.won) break; winStreak++; }
    const hardWins = wonRows.filter((row) => row.level === "Hard");
    const expertWins = wonRows.filter((row) => row.level === "Expert");
    const extremeWins = wonRows.filter((row) => row.level === "Extreme");
    const achievements = [
      ["first_game", "Первый шаг", gamesPlayed >= 1],
      ["first_win", "Новичок", winsCount >= 1],
      ["five_wins", "Пять побед", winsCount >= 5],
      ["ten_wins", "Уверенный игрок", winsCount >= 10],
      ["twenty_five_wins", "На пути к мастерству", winsCount >= 25],
      ["fifty_wins", "Полсотни побед", winsCount >= 50],
      ["hundred_wins", "Легенда Sudoku", winsCount >= 100],
      ["five_games", "Разминка", gamesPlayed >= 5],
      ["ten_games", "Постоянство", gamesPlayed >= 10],
      ["twenty_five_games", "В игре", gamesPlayed >= 25],
      ["fifty_games", "Ветеран", gamesPlayed >= 50],
      ["hundred_games", "Не остановить", gamesPlayed >= 100],
      ["easy_win", "Лёгкая победа", wonLevels.has("Easy")],
      ["medium_win", "Средний класс", wonLevels.has("Medium")],
      ["hard_win", "Покоритель сложного", wonLevels.has("Hard")],
      ["expert_win", "Эксперт", wonLevels.has("Expert")],
      ["extreme_win", "На пределе", wonLevels.has("Extreme")],
      ["three_levels", "Разносторонний", wonLevels.size >= 3],
      ["all_levels", "Мастер логики", ["Beginner","Easy","Medium","Hard","Expert","Extreme"].every((level) => wonLevels.has(level))],
      ["clean_win", "Без ошибок", cleanWins.length >= 1],
      ["five_clean_wins", "Точность", cleanWins.length >= 5],
      ["clean_hard", "Чистая сложность", hardWins.some((row) => row.mistakes === 0)],
      ["fast_hard", "Быстрый сложный", hardWins.some((row) => row.duration_seconds <= 600)],
      ["fast_expert", "Быстрый эксперт", expertWins.some((row) => row.duration_seconds <= 900)],
      ["fast_extreme", "Молниеносный", extremeWins.some((row) => row.duration_seconds <= 1200)],
      ["daily_first", "Ежедневная привычка", dailyDays.size >= 1],
      ["daily_seven", "Неделя логики", dailyDays.size >= 7],
      ["daily_thirty", "Месяц логики", dailyDays.size >= 30],
      ["win_streak_three", "Триумфальная серия", winStreak >= 3],
      ["win_streak_five", "Победная серия", winStreak >= 5],
    ].map(([id, title, unlocked]) => ({ id, title, unlocked: Boolean(unlocked) }));
    return response({
      ok: true,
      user: {
        id: user.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        username: profile.username,
        photo_url: profile.photo_url,
        language_code: profile.language_code,
      },
      stats: {
        games_played: gamesPlayed,
        wins: winsCount,
        losses: gamesPlayed - winsCount,
        win_rate: gamesPlayed ? Math.round((winsCount / gamesPlayed) * 100) : 0,
        best_time_seconds: best.data?.duration_seconds ?? null,
      },
      achievements,
      auth_date: authDate,
    });
  } catch (error) {
    console.error("Telegram auth error:", error);
    return response({ error: "Invalid request" }, 400);
  }
});
