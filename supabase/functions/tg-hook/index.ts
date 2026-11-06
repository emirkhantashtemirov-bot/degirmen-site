// Диспетчер Telegram-бота Degirmen: сам ведёт закупы («Дегирмен учёт»), отчёт дня владельцев и доступ новых людей,
// всё остальное (вход через Telegram, списания, /report, /order, /stop) передаёт в nexus без изменений.
// Вебхук проверяется тем же секретом, что и в nexus. Задачи (отчёты, настройка) - только с trigger_token.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buyIncoming, buyCallback, buyUndo, joinRequest, joinCallback, buyDaily, buyMonth, BUY_HELP } from "./purchases.ts";
import { isReport, parseDay, reportPhoto, reportCallback, reportText, dayReportText, reportAsk, reportDayPicked, reportWaiting, REPORT_HELP } from "./report.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TG = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"];
const NEXUS = Deno.env.get("SUPABASE_URL") + "/functions/v1/nexus";
const almNow = () => new Date(Date.now() + 5 * 3600e3);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function tg(method: string, body: any) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
const ctx = { db, tg, almNow, iso, groq: GROQ, models: MODELS, token: TG };
async function sha(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function cfg(k: string) { const { data } = await db.from("paloma_config").select("v").eq("k", k).maybeSingle(); return data?.v ?? null; }

const isWo = (t: string) => /^\/?(списани[ея]|списал[иа]?|списать)(?=[\s:]|$)/i.test(t.trim());
const isCancel = (t: string) => /^\/?(отмена|cancel)$/i.test(t.trim());
const STAFF_HELP = "🗑 <b>Списание</b>: напишите <i>списание: баклава 2 шт 1800</i>";

async function owners() { const { data } = await db.from("tg_chats").select("chat_id").eq("active", true); return (data || []).map((x: any) => x.chat_id); }
async function whoIs(chat: number) {
  const [{ data: own }, { data: stf }] = await Promise.all([
    db.from("tg_chats").select("name,active").eq("chat_id", chat).maybeSingle(),
    db.from("tg_staff").select("name,active").eq("chat_id", chat).maybeSingle(),
  ]);
  if (own?.active) return { who: own.name || "Владелец", owner: true };
  if (stf?.active) return { who: stf.name || "Сотрудник", owner: false };
  return { who: null, owner: false };
}
async function forward(update: any, secret: string) {
  await fetch(NEXUS, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) });
}
async function broadcast(text: string) {
  let n = 0;
  for (const chat of await owners()) { const r = await tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }); if (r.ok) n++; }
  return n;
}

async function onUpdate(u: any, secret: string) {
  if (u.callback_query) {
    const q = u.callback_query, chat = q.message?.chat?.id;
    const { who, owner } = await whoIs(chat);
    if (String(q.data).startsWith("buy:")) return buyCallback(ctx, q, who);
    if (String(q.data).startsWith("repd:")) return reportDayPicked(ctx, q);
    if (String(q.data).startsWith("rep:")) return reportCallback(ctx, q);
    if (String(q.data).startsWith("join:")) return joinCallback(ctx, q, owner, STAFF_HELP);
    return tg("answerCallbackQuery", { callback_query_id: q.id });
  }
  const m = u.message;
  if (!m || m.chat?.type !== "private") return;
  const chat = m.chat.id, txt = String(m.text ?? "").trim(), cap = String(m.caption ?? "").trim();
  const { who, owner } = await whoIs(chat);
  // команды и вход - в nexus как раньше
  if (txt.startsWith("/start ") || ["/report", "/order", "/stop"].includes(txt) || (txt && isWo(txt))) return forward(u, secret);
  if (txt === "/start" || txt === "/help") {
    if (who) return tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: `${BUY_HELP}\n\n${STAFF_HELP}${owner ? `\n\n${REPORT_HELP}\n\n/otchet - загрузить отчёт дня\n/report - утренний отчёт за вчера\n/order - заявка в Degirmen\n/zakup - закуп за сегодня` : ""}` });
    return joinRequest(ctx, m.from, chat, await owners());
  }
  if (!who) {
    if (m.photo || m.voice || txt) return tg("sendMessage", { chat_id: chat, text: "Нет доступа. Нажмите /start, и я отправлю заявку владельцу." });
    return;
  }
  if (isCancel(txt)) { if (await buyUndo(ctx, chat)) return; return forward(u, secret); }
  if (txt === "/otchet") return owner ? reportAsk(ctx, chat) : tg("sendMessage", { chat_id: chat, text: "Отчёт дня отправляют владельцы. Вы можете присылать закупы и списания." });
  if (txt === "/zakup" && owner) { const r = await buyDaily(ctx, parseDay(txt, iso(almNow())) ?? undefined); return tg("sendMessage", { chat_id: chat, text: r.text, parse_mode: "HTML" }); }
  const isImg = !!(m.photo?.length || m.document?.mime_type?.startsWith?.("image/"));
  // отчёт дня (владельцы): фото листа с подписью «отчёт ...» или текст «отчёт вчера»
  if (owner && isImg && isReport(cap)) return reportPhoto(ctx, chat, m, cap);
  if (owner && isImg) { const wd = await reportWaiting(ctx, chat); if (wd) return reportPhoto(ctx, chat, m, cap, wd); }
  if (owner && !isImg && txt && isReport(txt)) return reportText(ctx, chat, txt);
  if (!owner && (isReport(cap) || isReport(txt))) return tg("sendMessage", { chat_id: chat, text: "Отчёт дня отправляют владельцы. Вы можете присылать закупы и списания." });
  if (txt.startsWith("/")) return forward(u, secret);
  if (isImg || m.voice || txt) {
    // дата закупа из текста или подписи: владельцы - до 62 дней назад, сотрудники - до 7
    const today = iso(almNow());
    let day = parseDay(txt || cap, today);
    if (day && !owner && Date.parse(today) - Date.parse(day) > 7 * 864e5) day = null;
    return buyIncoming(ctx, chat, who, m, day ?? undefined);
  }
}

Deno.serve(async (req) => {
  try {
    const trig = await cfg("trigger_token");
    const hook = trig ? (await sha("tg:" + trig)).slice(0, 48) : null;
    const sec = req.headers.get("x-telegram-bot-api-secret-token");
    if (sec) {
      if (!hook || sec !== hook) return new Response("forbidden", { status: 403 });
      const u = await req.json();
      try { await onUpdate(u, hook); } catch (e) { console.error("tg-hook", e); }
      return new Response("ok");
    }
    const body = await req.json().catch(() => ({}));
    if (!trig || body.token !== trig) return new Response("forbidden", { status: 403 });
    let res: any;
    switch (body.job) {
      case "setup": {
        const url = Deno.env.get("SUPABASE_URL") + "/functions/v1/tg-hook";
        res = { webhook: await tg("setWebhook", { url, secret_token: hook, allowed_updates: ["message", "callback_query"] }),
          cmds: await tg("setMyCommands", { commands: [{ command: "otchet", description: "📒 Загрузить отчёт дня (владельцы)" }, { command: "start", description: "Как отправить закуп и отчёт" }, { command: "zakup", description: "Закуп за сегодня (владельцы)" }, { command: "report", description: "Утренний отчёт за вчера (владельцы)" }, { command: "order", description: "Заявка в Degirmen (владельцы)" }] }),
          info: await tg("getWebhookInfo", {}) };
        break;
      }
      case "info": res = await tg("getWebhookInfo", {}); break;
      case "buy_daily": { const r = await buyDaily(ctx, body.day); res = { ...r, sent: body.preview ? 0 : await broadcast(r.text) }; break; }
      case "buy_month": { const r = await buyMonth(ctx, body.ym); res = { ...r, sent: body.preview ? 0 : await broadcast(r.text) }; break; }
      case "day_report": { const { data: o } = await db.from("tg_chats").select("user_id").eq("active", true).limit(1).maybeSingle(); res = { text: await dayReportText(ctx, body.user ?? o?.user_id, body.day ?? iso(almNow())) }; break; }
      case "date_test": res = (body.texts || []).map((t: string) => [t, parseDay(t, body.today ?? iso(almNow())), isReport(t)]); break;
      case "parse_test": {
        // проверка разбора текста без записи (ИИ + защита от выдуманных цифр)
        const fake: any[] = [];
        const c2 = { ...ctx, db: { from: () => ({ insert: (x: any) => { fake.push(x); return { select: () => ({ single: async () => ({ data: { id: 0, ...x }, error: null }) }) }; }, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { v: "[]" } }) }) }) }) }, tg: async (_m: string, b: any) => { fake.push({ msg: b.text }); return { ok: true }; } };
        await buyIncoming(c2 as any, 0, "test", { text: String(body.text ?? "") }, parseDay(String(body.text ?? ""), iso(almNow())) ?? undefined);
        res = fake; break;
      }
      default: return new Response("unknown job", { status: 400 });
    }
    return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
