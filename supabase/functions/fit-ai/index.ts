// Superhero - ИИ-тренер. Режимы: chat (вопрос тренеру), parse (текст тренировки -> подходы).
// Доступ: любой вошедший пользователь, 20 запросов в день (таблица fit_ai_log). Ключ Groq только в секретах сервера.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"];
const LIMIT = 20;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SYS_CHAT = `Ты - ИИ-тренер в приложении Superhero (фитнес-РПГ). Отвечаешь по-русски, коротко и по делу: 2-6 предложений или короткий список. Говоришь как опытный тренер-друг: тепло, честно, без воды и без канцелярита. Используешь данные спортсмена из контекста (уровни мышц, подходы за неделю, рекорды, питание). Советы основаны на науке: прогрессия нагрузки, 10-20 рабочих подходов на мышцу в неделю, белок 1.6-2.2 г/кг, сон. Еда - только халяль. Ты не врач: при боли, травме, головокружении советуешь обратиться к специалисту и не ставишь диагнозов. Никогда не используй длинное тире, только короткое "-".`;

const SYS_PARSE = `Разбери запись тренировки в зале. Человек пишет как попало: "жим 80 на 8 три подхода, разводка 14 по 12", "присед 100х5х5", "подтягивания 10 8 7". Верни ТОЛЬКО JSON:
{"items":[{"name":"название упражнения как в зале, по-русски","sets":[{"w":0,"reps":0}]}]}
Правила: w - вес в кг (для упражнений с собственным весом 0 или дополнительный вес); "80х8х3" и "80 на 8 три подхода" - три одинаковых подхода; "10 8 7" - три подхода с разными повторами; если вес не указан - 0. Не выдумывай упражнения, которых нет в тексте.`;

async function groq(model: string, messages: unknown[], jsonMode: boolean, tokens = 900) {
  const body: Record<string, unknown> = { model, temperature: 0.4, max_tokens: tokens, messages };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  if (jsonMode) body.response_format = { type: "json_object" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(40000),
  });
  if (!r.ok) throw new Error(`${model}:${r.status}:${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { data } = await db.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
    if (!data?.user) return json({ error: "login" }, 401);
    const uid = data.user.id;
    const a = new Date(Date.now() + 5 * 3600e3), mid = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - 5 * 3600e3);
    const { count } = await db.from("fit_ai_log").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("at", mid.toISOString());
    if ((count || 0) >= LIMIT) return json({ error: "limit", limit: LIMIT }, 429);
    if (!GROQ) return json({ error: "no_key" }, 500);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "parse" ? "parse" : "chat";
    const text = String(body.text || "").trim().slice(0, 1500);
    if (text.length < 2) return json({ error: "empty" }, 400);
    const ctx = String(body.context || "").slice(0, 4000);
    const hist = Array.isArray(body.history) ? body.history.slice(-6).map((m: { r?: string; t?: string }) => ({ role: m.r === "a" ? "assistant" : "user", content: String(m.t || "").slice(0, 1200) })) : [];
    let out = "", err = "";
    for (const m of MODELS) {
      try {
        out = mode === "parse"
          ? await groq(m, [{ role: "system", content: SYS_PARSE }, { role: "user", content: text }], true, 1200)
          : await groq(m, [{ role: "system", content: SYS_CHAT + (ctx ? "\n\nДанные спортсмена:\n" + ctx : "") }, ...hist, { role: "user", content: text }], false);
        if (out) break;
      } catch (e) { err += " " + (e as Error).message; }
    }
    await db.from("fit_ai_log").insert({ user_id: uid, kind: mode, ok: !!out });
    if (!out) return json({ error: "ai_failed", detail: err.trim().slice(0, 300) }, 502);
    if (mode === "parse") {
      try { const s = out.indexOf("{"), e = out.lastIndexOf("}"); return json({ ok: true, ...JSON.parse(out.slice(s, e + 1)), left: LIMIT - (count || 0) - 1 }); }
      catch { return json({ error: "bad_json" }, 502); }
    }
    return json({ ok: true, text: out.replace(/[—–]/g, "-"), left: LIMIT - (count || 0) - 1 });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
