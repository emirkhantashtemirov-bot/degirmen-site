// Отчёт дня через Telegram (только владельцы): фото листа кассы с подписью «отчёт 5 ноября» -> распознаём (fin-ocr)
// -> показываем сводку по разделам -> «Записать» сохраняет в «Отчёт дня» за эту дату (как в приложении).
// Текст «отчёт вчера» без фото -> общий отчёт дня по разделам.
import type { Ctx } from "./purchases.ts";
import { tgFile, b64, buyPeriod, blockLines, SRC } from "./purchases.ts";

const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number) => Math.round(+n || 0).toLocaleString("ru-RU").replace(/[  ]/g, " ") + " ₸";
const nn = (v: any) => (v == null || v === "" || !isFinite(+v) ? null : +v);
const DM = (s: string) => `${+s.slice(8, 10)} ${["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][+s.slice(5, 7) - 1]}`;
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const GB: Record<string, string> = { doner: "Донер", kitchen: "Кухня", bar: "Бар/раздача", bazar: "Базар (без нала)", degirmen: "Дегирмен (без нала)" };
const GS: Record<string, string> = { usta: "Уста донер", kassa: "Касса", kitchen: "Кухня", tech: "Техперсонал", other: "Прочее" };
const MON = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

export const isReport = (t: string) => /^\/?(отч[её]т|otchet|report)(?=[\s:,.]|$)/i.test(String(t ?? "").trim());

// Дата из текста: сегодня/вчера/позавчера, 5.11, 05.11.2026, «5 ноября». Будущее и старше 62 дней не берём.
export function parseDay(text: string, today: string): string | null {
  const t = String(text ?? "").toLowerCase();
  const add = (n: number) => new Date(Date.parse(today + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  let d: string | null = null;
  if (/позавчера/.test(t)) d = add(-2); else if (/вчера/.test(t)) d = add(-1); else if (/сегодня/.test(t)) d = today;
  const y0 = +today.slice(0, 4);
  const mk = (dd: number, mm: number, yy?: number) => {
    let y = yy ? (yy < 100 ? 2000 + yy : yy) : y0;
    let s = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    if (!yy && s > today) s = `${y - 1}-${s.slice(5)}`; // «28 декабря» в январе - прошлый год
    const x = new Date(s + "T00:00:00Z");
    return isNaN(+x) || x.getUTCDate() !== dd ? null : s;
  };
  const m1 = !d && t.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)/);
  if (m1) d = mk(+m1[1], +m1[2], m1[3] ? +m1[3] : undefined);
  const m2 = !d && t.match(/(?:^|\D)(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/);
  if (m2) d = mk(+m2[1], MON.findIndex((p) => m2[2].startsWith(p)) + 1);
  if (!d || d > today || Date.parse(today) - Date.parse(d) > 62 * 864e5) return null;
  return d;
}

const ownerUid = async (c: Ctx, chat: number) => (await c.db.from("tg_chats").select("user_id").eq("chat_id", chat).eq("active", true).maybeSingle()).data?.user_id ?? null;
async function finAs(c: Ctx, uid: string, op: string, d: string, p: any = null) {
  const { data, error } = await c.db.rpc("fin_as", { p_user: uid, p_op: op, p_d: d, p });
  if (error) throw new Error(error.message);
  return data;
}

// ---------- двойной учёт: закуп из бота и та же строка в отчёте дня ----------
const dupW = (s: string) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w));
const dupSim = (a: string, b: string) => { const A = dupW(a), B = dupW(b); return A.some((x) => B.some((y) => x.slice(0, 4) === y.slice(0, 4))); };
const dupNear = (a: number, b: number, p = 0) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(p ? 0 : 20, (p || 0.02) * Math.max(a, b));
// lines - строки закупа (kind buy), bot - закупы из бота за день. Ответ: индекс строки -> что в боте
export function findDups(lines: any[], bot: any[]) {
  const res: Record<number, { by: string; what: string; total: number }> = {}, used = new Set<string>();
  const cand: any[] = [];
  for (const b of bot || []) { const its = b.items || []; its.forEach((it: any, k: number) => cand.push({ b, key: `${b.id}:${k}`, name: it.name, total: +it.total || 0 })); if (its.length > 1) cand.push({ b, all: 1, key: `${b.id}:all`, name: `${b.vendor || ""} ${its.map((i: any) => i.name).join(" ")}`, total: +b.total || 0 }); }
  for (const pass of [1, 2]) lines.forEach((l, i) => {
    if (l.kind !== "buy" || l.dup_ok || res[i]) return;
    const t = +l.total || Math.round((+l.qty || 0) * (+l.price || 0)); if (!t) return;
    const c = cand.find((c) => !used.has(c.key) && !used.has(`${c.b.id}:all`) && (pass === 1 ? dupSim(l.name, c.name) && dupNear(t, c.total, 0.2) : dupNear(t, c.total)));
    if (!c) return;
    res[i] = { by: c.b.by || "сотрудник", what: c.all ? (c.b.vendor || "закуп") : c.name, total: c.total }; used.add(c.key);
    if (c.all) (c.b.items || []).forEach((_: any, k: number) => used.add(`${c.b.id}:${k}`));
  });
  return res;
}

// ---------- общий отчёт дня по разделам ----------
export async function dayReportText(c: Ctx, uid: string, d: string) {
  const D = await finAs(c, uid, "day", d);
  const dd = D.day || {}, L: any[] = D.lines || [], P = D.pal || {}, bot: any[] = D.bot || [];
  const sum = (f: (l: any) => boolean) => L.filter(f).reduce((a, l) => a + (+l.total || 0), 0);
  const filled = !!dd.d;
  let t = `📒 <b>Отчёт дня: ${DM(d)}, ${WD[new Date(d + "T00:00:00Z").getUTCDay()]}</b>\n${dd.status === "closed" ? "✅ День закрыт" : filled ? "📝 День открыт" : "⚪️ Отчёт за этот день ещё не заполнен"}\n`;

  // 1. Выручка
  const kaspi = nn(dd.kaspi), halyk = nn(dd.halyk), glovo = nn(dd.glovo) || 0, cashS = nn(dd.cash_sales) ?? (+P.cash || 0);
  const rev = kaspi != null || halyk != null ? (kaspi || 0) + (halyk || 0) + glovo + cashS : (+P.total || 0) + glovo;
  t += `\n💰 <b>Выручка: ${money(rev)}</b>\n`;
  if (kaspi != null || halyk != null) t += `Kaspi ${money(kaspi || 0)} · Halyk ${money(halyk || 0)}${glovo ? ` · Glovo ${money(glovo)}` : ""}\nНаличные ${money(cashS)}\n`;
  if (+P.total) t += `<i>По Paloma: ${money(+P.total)} (${P.n || 0} чеков), карта ${money((+P.card || 0) + (+P.qr || 0))}, нал ${money(+P.cash || 0)}</i>\n`;
  if (kaspi != null || halyk != null) { const diff = (kaspi || 0) + (halyk || 0) - ((+P.card || 0) + (+P.qr || 0)); if (Math.abs(diff) > 1000) t += `⚠️ Kaspi + Halyk расходятся с Paloma на ${money(diff)}\n`; }

  // 2. Закуп из кассы
  const g = (k: string) => sum((l) => l.kind === "buy" && l.grp === k);
  const botCash = bot.filter((b) => (b.source || "cash") === "cash").reduce((a, b) => a + (+b.total || 0), 0);
  const buyCash = g("doner") + g("kitchen") + g("bar") + botCash;
  if (buyCash) {
    t += `\n🧺 <b>Закуп из кассы: ${money(buyCash)}</b>\n`;
    for (const k of ["doner", "kitchen", "bar"]) if (g(k)) t += `${GB[k]}: ${money(g(k))}\n`;
    if (botCash) t += `Через бота: ${money(botCash)}\n`;
  }
  // 3. Закуп не из кассы
  const botOther = bot.filter((b) => b.source && b.source !== "cash");
  const noCash = g("bazar") + g("degirmen") + botOther.reduce((a, b) => a + (+b.total || 0), 0);
  if (noCash) {
    t += `\n🏢 <b>Закуп не из кассы: ${money(noCash)}</b>\n`;
    for (const k of ["bazar", "degirmen"]) if (g(k)) t += `${GB[k]}: ${money(g(k))}\n`;
    for (const s of ["biz", "kaspi", "own"]) { const v = botOther.filter((b) => b.source === s).reduce((a, b) => a + (+b.total || 0), 0); if (v) t += `${SRC[s]}: ${money(v)}\n`; }
  }
  // 4. Закуп из бота по блокам
  if (bot.length) { const { P: BP, B } = await buyPeriod(c, d, d); if (BP.total) t += `\n📦 <b>Закуп из бота по блокам</b>\n${blockLines(BP, B)}\n`; }
  // 5. Расходы и зарплаты
  const exp = sum((l) => l.kind === "exp"), pay = sum((l) => l.kind === "pay");
  if (exp) { t += `\n🧾 <b>Расходы: ${money(exp)}</b>\n`; for (const l of L.filter((l) => l.kind === "exp")) t += `• ${esc(l.name || GS[l.grp] || "Расход")}: ${money(+l.total)}\n`; }
  if (pay) { t += `\n👥 <b>Зарплаты и авансы: ${money(pay)}</b>\n`; for (const l of L.filter((l) => l.kind === "pay")) t += `• ${esc(l.name || GS[l.grp] || "")}: ${money(+l.total)}\n`; }
  const dups = findDups(L, bot), dk = Object.keys(dups);
  if (dk.length) t += `\n⚠️ <b>Возможный двойной учёт: ${dk.length}</b>\n${dk.map((i) => `• ${esc(L[+i].name || "закуп")} ${money(+L[+i].total)} - есть и в отчёте, и в боте (${esc(dups[+i].by)})`).join("\n")}\nПроверьте в приложении: Финансы → День.\n`;
  const ar = (D.arrivals || []).filter((a: any) => a.in);
  if (ar.length) {
    const { data: sc } = await c.db.from("paloma_config").select("v").eq("k", "shift_start").maybeSingle();
    let S: Record<string, string> = {}; try { S = JSON.parse(sc?.v || "{}"); } catch { /* */ }
    const m = (t: string) => { const [h, mi] = t.split(":"); return +h * 60 + +mi; };
    t += `\n⏰ <b>Приход на работу</b>\n${ar.map((a: any) => { const st = S[a.role], late = st ? m(a.in) - m(st) : 0; return `• ${esc(a.name || GS[a.role] || "")} ${a.in}${late > 10 ? ` - опоздание ${late} мин` : ""}`; }).join("\n")}\n`;
  }
  // 6. Касса
  const prev = nn(D.prev_cash), out = nn(dd.owner_out) || 0, left = nn(dd.cash_left);
  const expect = (prev || 0) + cashS - buyCash - exp - pay - out;
  t += `\n💵 <b>Касса (наличные)</b>\n`;
  if (prev != null) t += `На начало дня: ${money(prev)}\n`;
  t += `+ продажи наличными ${money(cashS)}\n− закуп из кассы ${money(buyCash)}${exp ? `\n− расходы ${money(exp)}` : ""}${pay ? `\n− зарплаты ${money(pay)}` : ""}${out ? `\n− забрал владелец ${money(out)}` : ""}\n`;
  t += `Должно остаться: <b>${money(expect)}</b>\n`;
  if (left != null) { const df = left - expect; t += `Фактически: <b>${money(left)}</b> ${Math.abs(df) <= 500 ? "✅ сходится" : df < 0 ? `❗️ недостача ${money(-df)}` : `➕ излишек ${money(df)}`}\n`; }
  // 7. Итог
  if (rev) t += `\n📊 Выручка ${money(rev)} − закуп ${money(buyCash + noCash)} − расходы и зарплаты ${money(exp + pay)} = <b>${money(rev - buyCash - noCash - exp - pay)}</b> <i>(без аренды и налогов)</i>`;
  return t;
}

// ---------- фото листа кассы -> черновик ----------
const ASK: Record<string, string> = { biz: "🏢 Деньги ТОО", own: "👤 Свои деньги", cash: "💵 Из кассы" };
const ASK_S: Record<string, string> = { biz: "🏢 ТОО", own: "👤 Свои", cash: "💵 Касса" };
function draftKb(id: number, x: any) {
  const ask = x.ask || [];
  return { inline_keyboard: [
    ...ask.map((a: any, i: number) => (["biz", "own", "cash"] as const).map((k) => ({ text: `${a.src === k ? "✅" : `${i + 1}.`} ${ASK_S[k]}`, callback_data: `rpa:${id}:${i}:${k}` }))),
    ...((x._dup || []).length ? [[{ text: "✅ Записать без повторов", callback_data: `rep:${id}:nodup` }]] : []),
    [{ text: "✅ Записать", callback_data: `rep:${id}:save` }, { text: "✅ Записать и закрыть день", callback_data: `rep:${id}:close` }],
    [{ text: "❌ Отмена", callback_data: `rep:${id}:void` }],
  ] };
}
// кнопка «откуда деньги» под черновиком: запоминаем выбор и перерисовываем сообщение
export async function reportAskPick(c: Ctx, q: any) {
  const [, idS, iS, k] = String(q.data).split(":");
  const chat = q.message?.chat?.id, ans = (text: string) => c.tg("answerCallbackQuery", { callback_query_id: q.id, text });
  if (!(await ownerUid(c, chat))) { await ans("Только владелец"); return; }
  const { data: dr } = await c.db.from("bot_day_drafts").select("*").eq("id", Number(idS)).maybeSingle();
  if (!dr || dr.chat_id !== chat || dr.status !== "draft" || !ASK[k]) { await ans("Уже неактуально"); return; }
  const x = dr.data, a = (x.ask || [])[Number(iS)];
  if (!a) { await ans("Не найдено"); return; }
  a.src = k;
  await c.db.from("bot_day_drafts").update({ data: x }).eq("id", dr.id).eq("status", "draft");
  await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, parse_mode: "HTML", text: draftText(dr.d, x, !!x._ex, x._dupd || {}), reply_markup: draftKb(dr.id, x) });
  await ans(`${a.name}: ${ASK[k]}`);
}

function draftText(d: string, x: any, existing: boolean, dups: Record<number, any> = {}) {
  const sum = (a: any[]) => (a || []).reduce((s, l) => s + (+l.total || 0), 0);
  const buy = x.buy || [], exp = x.exp || [], pay = x.pay || [];
  let t = `📋 <b>Распознал отчёт за ${DM(d)}</b>\n`;
  const rv = [["Kaspi", x.kaspi], ["Halyk", x.halyk], ["Glovo", x.glovo], ["Наличные", x.cash_sales], ["Остаток в кассе", x.cash_left]].filter(([, v]) => nn(v) != null);
  if (rv.length) t += `\n💰 <b>Продажи и касса</b>\n${rv.map(([k, v]) => `${k}: ${money(+v)}`).join("\n")}\n`;
  for (const k of ["doner", "kitchen", "bar", "bazar", "degirmen"]) {
    const ls = buy.filter((l: any) => l.grp === k); if (!ls.length) continue;
    t += `\n🧺 <b>Закуп ${GB[k]}: ${money(sum(ls))}</b>\n${ls.map((l: any) => `• ${esc(l.name)}${l.qty ? ` - ${l.qty} ${esc(l.unit || "")}` : ""}: ${money(+l.total || (+l.qty || 0) * (+l.price || 0))}`).join("\n")}\n`;
  }
  if (exp.length) t += `\n🧾 <b>Расходы: ${money(sum(exp))}</b>\n${exp.map((l: any) => `• ${esc(l.name || GS[l.grp])}: ${money(+l.total)}`).join("\n")}\n`;
  if (pay.length) t += `\n👥 <b>Зарплаты и авансы: ${money(sum(pay))}</b>\n${pay.map((l: any) => `• ${esc(l.name || GS[l.grp])}: ${money(+l.total)}`).join("\n")}\n`;
  const ask = x.ask || [];
  if (ask.length) t += `\n❓ <b>Откуда были деньги?</b> Сумма записана в названии, а не в «цена Итого». Выберите кнопками ниже:\n${ask.map((a: any, i: number) => `${i + 1}. ${esc(a.name)} - ${money(a.total)}${a.src ? ` → ${ASK[a.src]}` : " → ?"}`).join("\n")}\n`;
  const ar = (x.arrivals || []).filter((a: any) => a.in);
  if (ar.length) t += `\n⏰ <b>Приход</b> (не деньги)\n${ar.map((a: any) => `• ${esc(a.name || GS[a.role] || "")} ${a.in}${a.out ? `-${a.out}` : ""}`).join("\n")}\n`;
  if ((x.unsure || []).length) t += `\n⚠️ <i>Проверьте: ${esc(x.unsure.slice(0, 6).join("; "))}</i>\n`;
  const dk = Object.keys(dups);
  if (dk.length) t += `\n⚠️ <b>Похоже на двойной учёт: ${dk.length}</b>\nЭти закупы уже пришли через бота:\n${dk.map((i) => `• ${esc(buy[+i].name || "закуп")} ${money(+buy[+i].total)} - в боте: ${esc(dups[+i].what)} ${money(dups[+i].total)} (${esc(dups[+i].by)})`).join("\n")}\nЕсли это те же покупки, нажмите «Записать без повторов».\n`;
  if (existing) t += `\n❗️ За ${DM(d)} уже есть отчёт в приложении. «Записать» <b>заменит</b> его этими цифрами.`;
  return t + `\n\nВсё верно?`;
}

// ---------- кнопка «Загрузить отчёт»: выбор даты -> ждём фото 15 минут ----------
export async function reportAsk(c: Ctx, chat: number) {
  const today = c.iso(c.almNow());
  const add = (n: number) => new Date(Date.parse(today + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const days = [0, -1, -2, -3].map(add);
  const lbl = ["Сегодня", "Вчера", "Позавчера"];
  return c.tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: "📒 <b>Загрузить отчёт дня</b>\nЗа какой день отчёт?\n\n<i>Другая дата - пришлите фото с подписью, например «отчёт 25 октября».</i>",
    reply_markup: { inline_keyboard: [
      [{ text: `${lbl[0]}, ${DM(days[0])}`, callback_data: `repd:${days[0]}` }, { text: `${lbl[1]}, ${DM(days[1])}`, callback_data: `repd:${days[1]}` }],
      [{ text: `${lbl[2]}, ${DM(days[2])}`, callback_data: `repd:${days[2]}` }, { text: DM(days[3]), callback_data: `repd:${days[3]}` }],
    ] } });
}
export async function reportDayPicked(c: Ctx, q: any) {
  const chat = q.message?.chat?.id, d = String(q.data).slice(5);
  const uid = await ownerUid(c, chat);
  if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(d)) { await c.tg("answerCallbackQuery", { callback_query_id: q.id, text: "Только владелец" }); return; }
  await c.db.from("bot_day_drafts").update({ status: "void" }).eq("chat_id", chat).eq("status", "wait");
  await c.db.from("bot_day_drafts").insert({ chat_id: chat, user_id: uid, d, data: {}, status: "wait" });
  await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, parse_mode: "HTML", text: `📒 Отчёт за <b>${DM(d)}</b>.\n\n📷 Теперь пришлите фото листа кассы - целиком, ровно, при хорошем свете. Жду 15 минут.` });
  await c.tg("answerCallbackQuery", { callback_query_id: q.id, text: DM(d) });
}
// фото без подписи «отчёт»: если владелец недавно выбрал дату - это отчёт
export async function reportWaiting(c: Ctx, chat: number): Promise<string | null> {
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const { data } = await c.db.from("bot_day_drafts").select("id,d").eq("chat_id", chat).eq("status", "wait").gte("created_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  await c.db.from("bot_day_drafts").update({ status: "used" }).eq("id", data.id);
  return data.d;
}

export async function reportPhoto(c: Ctx, chat: number, m: any, caption: string, day?: string) {
  const send = (text: string, extra: any = {}) => c.tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", ...extra });
  const uid = await ownerUid(c, chat);
  if (!uid) return send("Отчёт дня через бота могут отправлять только владельцы.");
  const today = c.iso(c.almNow());
  await c.tg("sendChatAction", { chat_id: chat, action: "typing" });
  let x: any = null;
  try {
    const p = m.photo?.length ? m.photo[m.photo.length - 1] : m.document;
    const f = await tgFile(c, p.file_id);
    const mime = f.path.endsWith(".png") ? "image/png" : "image/jpeg";
    const { data: tt } = await c.db.from("paloma_config").select("v").eq("k", "trigger_token").maybeSingle();
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/fin-ocr", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
      body: JSON.stringify({ test: 1, token: tt?.v, image: `data:${mime};base64,${b64(f.bytes)}`, hint: caption.slice(0, 150) }), signal: AbortSignal.timeout(80000),
    });
    const j = await r.json();
    if (j?.ok) x = j.data;
  } catch { x = null; }
  if (!x || ![x.buy, x.exp, x.pay].some((a) => a?.length) && [x.kaspi, x.halyk, x.cash_sales, x.cash_left].every((v) => nn(v) == null)) {
    return send("Не смог прочитать лист. Сфотографируйте ровнее и целиком, при хорошем свете, и отправьте ещё раз с подписью «отчёт» и датой.");
  }
  const d = parseDay(caption, today) ?? day ?? parseDay(String(x.date ?? ""), today) ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) && x.date <= today && Date.parse(today) - Date.parse(x.date) <= 62 * 864e5 ? x.date : today);
  const cur = await finAs(c, uid, "day", d);
  const existing = !!cur?.day?.d && ((cur.lines || []).length > 0 || [cur.day.kaspi, cur.day.halyk, cur.day.cash_sales, cur.day.cash_left].some((v: any) => v != null));
  const buyL = (x.buy || []).map((l: any) => ({ ...l, kind: "buy" }));
  const dups = findDups(buyL, cur?.bot || []);
  x._dup = Object.keys(dups).map(Number); x._dupd = dups; x._ex = existing;
  x.ask = (x.ask || []).map((a: any) => ({ ...a, src: null }));
  const { data: dr, error } = await c.db.from("bot_day_drafts").insert({ chat_id: chat, user_id: uid, d, data: x }).select("id").single();
  if (error) return send("Не получилось сохранить черновик, попробуйте ещё раз.");
  const id = dr.id;
  return send(draftText(d, x, existing, dups), { reply_markup: draftKb(id, x) });
}

export async function reportCallback(c: Ctx, q: any) {
  const [, idS, act] = String(q.data).split(":");
  const chat = q.message?.chat?.id, ans = (text: string) => c.tg("answerCallbackQuery", { callback_query_id: q.id, text });
  const uid = await ownerUid(c, chat);
  if (!uid) { await ans("Только владелец"); return; }
  const { data: dr } = await c.db.from("bot_day_drafts").select("*").eq("id", Number(idS)).maybeSingle();
  if (!dr || dr.chat_id !== chat) { await ans("Не найдено"); return; }
  if (dr.status !== "draft") { await ans(dr.status === "ok" ? "Уже записано" : "Уже отменено"); return; }
  const base = String(q.message?.text ?? "").split("\n")[0];
  if (act === "void") {
    await c.db.from("bot_day_drafts").update({ status: "void" }).eq("id", dr.id);
    await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `${base}\n❌ Отменено, ничего не записал.` });
    await ans("Отменено"); return;
  }
  const open = (dr.data?.ask || []).filter((a: any) => !a.src);
  if (open.length) { await c.tg("answerCallbackQuery", { callback_query_id: q.id, text: `Сначала выберите, откуда деньги: ${open.map((a: any) => a.name).join(", ")}`.slice(0, 190), show_alert: true }); return; }
  const { data: lock } = await c.db.from("bot_day_drafts").update({ status: "ok" }).eq("id", dr.id).eq("status", "draft").select("id");
  if (!lock?.length) { await ans("Уже записано"); return; }
  const x = dr.data, cur = await finAs(c, uid, "day", dr.d), dd = cur?.day || {};
  const lines = [
    ...(x.buy || []).filter((_: any, i: number) => !(act === "nodup" && (x._dup || []).includes(i))).map((l: any) => ({ kind: "buy", grp: l.grp, name: l.name, unit: l.unit, qty: l.qty, price: l.price, total: l.total })),
    ...(x.ask || []).filter((a: any) => a.src === "cash").map((a: any) => ({ kind: "buy", grp: a.near || "kitchen", name: a.name, total: a.total })),
    ...(x.exp || []).map((l: any) => ({ kind: "exp", grp: l.grp, name: l.name, total: l.total })),
    ...(x.pay || []).map((l: any) => ({ kind: "pay", grp: l.grp, name: l.name, total: l.total })),
  ];
  const p = { kaspi: x.kaspi, halyk: x.halyk, glovo: x.glovo, cash_sales: x.cash_sales, cash_left: x.cash_left, owner_out: dd.owner_out ?? 0, note: dd.note || "из Telegram", src: "photo", lines, ask: (x.ask || []).filter((a: any) => a.src === "biz" || a.src === "own"), arrivals: x.arrivals || [] };
  try {
    await finAs(c, uid, "save", dr.d, p);
    if (act === "close") await finAs(c, uid, "close", dr.d);
  } catch (e) {
    await c.db.from("bot_day_drafts").update({ status: "draft" }).eq("id", dr.id);
    await ans("Ошибка"); await c.tg("sendMessage", { chat_id: chat, text: `Не получилось записать: ${String((e as Error).message).slice(0, 150)}` }); return;
  }
  await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `${base}\n✅ Записал в «Отчёт дня»${act === "close" ? " и закрыл день" : ""}${act === "nodup" ? `, без ${(x._dup || []).length} повторов с ботом` : ""}.` });
  await ans("Записано ✅");
  await c.tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: await dayReportText(c, uid, dr.d) });
}

export async function reportText(c: Ctx, chat: number, txt: string) {
  const uid = await ownerUid(c, chat);
  if (!uid) return c.tg("sendMessage", { chat_id: chat, text: "Отчёты дня доступны только владельцам." });
  const today = c.iso(c.almNow()), d = parseDay(txt, today) ?? today;
  return c.tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: await dayReportText(c, uid, d) });
}

export const REPORT_HELP = "📒 <b>Отчёт дня</b> (только владельцы)\n• Меню → /otchet «Загрузить отчёт дня»: выберите день и пришлите фото листа.\n• Или фото листа кассы с подписью <i>отчёт 5 ноября</i> (или <i>отчёт вчера</i>) - распознаю и после «Записать» внесу в «Отчёт дня» за эту дату.\n• Текст <i>отчёт вчера</i> - пришлю общий отчёт дня по разделам: выручка, закуп, расходы, зарплаты, касса.";
