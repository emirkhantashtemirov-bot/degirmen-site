// Закупы в Telegram («Дегирмен учёт»): фото чека, текст или голосовое -> ИИ разбирает позиции -> человек подтверждает кнопкой
// и выбирает, откуда деньги (касса / Kaspi / деньги ТОО / свои). Подтверждённое сразу видно в «Отчёте дня» и в отчётах.
// Новые люди просятся через /start, владелец пускает кнопкой. Каждый вечер - отчёт за день, 1-го числа - итоги месяца.

export type Ctx = { db: any; tg: (method: string, body: any) => Promise<any>; almNow: () => Date; iso: (d: Date) => string; groq: string; models: string[]; token: string };

const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number) => Math.round(+n || 0).toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ") + " ₸";
const num = (v: any) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const DM = (s: string) => `${+s.slice(8, 10)} ${["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][+s.slice(5, 7) - 1]}`;
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const VISION = ["qwen/qwen3.8-27b"];

export const SRC: Record<string, string> = { cash: "💵 Из кассы", kaspi: "📱 Kaspi", biz: "🏢 Деньги ТОО", own: "👤 Свои деньги" };
const BLOCK_KEYS = ["meat", "veg", "dairy", "grocery", "bread", "drinks", "coffee", "pack", "other"];
async function blocks(c: Ctx): Promise<Record<string, string>> {
  const { data } = await c.db.from("paloma_config").select("v").eq("k", "buy_blocks").maybeSingle();
  try { return Object.fromEntries(JSON.parse(data?.v ?? "[]")); } catch { return {}; }
}

export const BUY_HELP = "🧾 <b>Закуп</b>\nПришлите фото чека - я сам разберу позиции и сумму.\nЧека нет (рынок)? Напишите текстом или скажите голосовым, например:\n<i>картошка 50 кг 12500, лук 20 кг 4000</i>\nЗакуп не за сегодня? Добавьте дату: <i>вчера</i> или <i>5 ноября</i>.\n\nПосле разбора нажмите, откуда были деньги. Ошиблись - кнопка «Отмена» или /отмена.";

const PROMPT = `Ты бухгалтер кафе Degirmen Navoi (Алматы: донер, кухня, выпечка, кофе). Тебе дают чек поставщика (фото) или сообщение сотрудника о закупе (текст на русском или казахском).
Верни ТОЛЬКО JSON:
{"vendor":"магазин или рынок, если виден, иначе null","items":[{"name":"","unit":"кг|шт|л|уп|г","qty":число или null,"price":цена за единицу или null,"total":сумма по строке,"block":"meat|veg|dairy|grocery|bread|drinks|coffee|pack|other","grp":"doner|kitchen|bar"}],"total":итог чека или null,"unsure":["что прочиталось неуверенно"]}
Блоки: meat - мясо, курица, фарш; veg - овощи, фрукты, зелень; dairy - молоко, сливки, сметана, йогурт, сыр, масло сливочное, яйца; grocery - мука, сахар, соль, специи, масло растительное, соусы, крупы, консервы; bread - хлеб, лаваш, батон, булочки; drinks - вода, газировка, соки, айран; coffee - кофе, чай, сиропы; pack - стаканы, крышки, пакеты, салфетки, перчатки, моющие, хозтовары; other - всё остальное.
grp - где используется: мясо, лаваш, овощи и соусы для донера -> doner; напитки, кофе, молоко для кофе, выпечка -> bar; остальное -> kitchen.
Правила: числа без пробелов и знака ₸; total строки = qty*price, если сумма не указана; не выдумывай цифр, которых нет; итоговые строки, скидки и сдачу не переноси как позиции; слова о дате (вчера, 5 ноября) не являются товаром; если товара или суммы не видно - верни items:[].`;

function clean(x: any) {
  const name = String(x?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return null;
  const qty = num(x?.qty), price = num(x?.price);
  let total = num(x?.total);
  if ((total == null || total <= 0) && qty != null && price != null) total = Math.round(qty * price);
  if (total == null || total <= 0 || total > 50_000_000) return null;
  const block = BLOCK_KEYS.includes(x?.block) ? x.block : "other";
  const grp = ["doner", "kitchen", "bar"].includes(x?.grp) ? x.grp : "kitchen";
  return { name, unit: x?.unit ? String(x.unit).slice(0, 8) : null, qty: qty != null && qty > 0 ? +qty.toFixed(3) : null, price: price != null && price >= 0 ? Math.round(price) : null, total: Math.round(total), block, grp };
}
// для текста и голоса: каждая сумма должна встречаться в сообщении (защита от выдуманных цифр)
function grounded(text: string, items: any[]) {
  const nums = new Set([...(text.replace(/(\d)\s+(?=\d{3}(?!\d))/g, "$1").match(/\d+(?:[.,]\d+)?/g) || [])].map((v) => Number(v.replace(",", "."))));
  return items.filter((i) => nums.has(i.total) || (i.qty != null && i.price != null && nums.has(i.price) && nums.has(i.qty)));
}

async function ai(c: Ctx, content: any, vision: boolean) {
  if (!c.groq) return null;
  for (const model of vision ? VISION : c.models.slice(0, 3)) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${c.groq}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(55000),
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 4000, response_format: { type: "json_object" }, ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}),
          messages: [{ role: "system", content: PROMPT }, { role: "user", content }] }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const t = String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^```(json)?/, "").replace(/```$/, "").trim();
      const out = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      return { vendor: out.vendor ? String(out.vendor).slice(0, 80) : null, items: (Array.isArray(out.items) ? out.items : []).map(clean).filter(Boolean).slice(0, 60), total: num(out.total), unsure: Array.isArray(out.unsure) ? out.unsure.slice(0, 5).map(String) : [] };
    } catch { /* следующая модель */ }
  }
  return null;
}

export async function tgFile(c: Ctx, fileId: string) {
  const f = await c.tg("getFile", { file_id: fileId });
  if (!f.ok) throw new Error("getFile");
  const r = await fetch(`https://api.telegram.org/file/bot${c.token}/${f.result.file_path}`);
  if (!r.ok) throw new Error("download");
  return { bytes: new Uint8Array(await r.arrayBuffer()), path: String(f.result.file_path) };
}
export const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function transcribe(c: Ctx, bytes: Uint8Array) {
  const fd = new FormData();
  fd.set("file", new Blob([bytes], { type: "audio/ogg" }), "voice.ogg");
  fd.set("model", "whisper-large-v3-turbo");
  fd.set("language", "ru");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${c.groq}` }, body: fd, signal: AbortSignal.timeout(40000) });
  if (!r.ok) return null;
  return String((await r.json()).text ?? "").trim() || null;
}

function card(b: any, items: any[], B: Record<string, string>, note = "") {
  const by: Record<string, any[]> = {};
  for (const i of items) (by[i.block] ??= []).push(i);
  let t = `🧾 <b>Закуп${b.vendor ? `: ${esc(b.vendor)}` : ""}</b>${b.d ? ` · ${DM(b.d)}` : ""}\n`;
  for (const k of BLOCK_KEYS) if (by[k]) {
    t += `\n<b>${esc(B[k] ?? k)}</b>\n`;
    for (const i of by[k]) t += `• ${esc(i.name)}${i.qty != null ? ` - ${+i.qty} ${esc(i.unit || "")}` : ""}: ${money(i.total)}\n`;
  }
  t += `\n<b>Итого: ${money(b.total)}</b>${note}`;
  return t;
}
const kb = (id: number) => ({ inline_keyboard: [
  [{ text: SRC.cash, callback_data: `buy:${id}:cash` }, { text: SRC.kaspi, callback_data: `buy:${id}:kaspi` }],
  [{ text: SRC.biz, callback_data: `buy:${id}:biz` }, { text: SRC.own, callback_data: `buy:${id}:own` }],
  [{ text: "❌ Отмена", callback_data: `buy:${id}:void` }],
] });

// Разобрать входящее (фото / голос / текст) и показать карточку с кнопками. day - дата закупа (по умолчанию сегодня)
export async function buyIncoming(c: Ctx, chat: number, who: string, m: any, day?: string) {
  const send = (text: string, extra: any = {}) => c.tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", ...extra });
  let parsed: any = null, kind = "text", photo: string | null = null, src = "";
  try {
    if (m.photo?.length || m.document?.mime_type?.startsWith?.("image/")) {
      kind = "photo";
      await c.tg("sendChatAction", { chat_id: chat, action: "typing" });
      const p = m.photo?.length ? m.photo[m.photo.length - 1] : m.document;
      photo = p.file_id;
      const f = await tgFile(c, p.file_id);
      const mime = f.path.endsWith(".png") ? "image/png" : "image/jpeg";
      parsed = await ai(c, [{ type: "text", text: "Разбери чек." + (m.caption ? " Подпись сотрудника: " + String(m.caption).slice(0, 200) : "") }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64(f.bytes)}` } }], true);
    } else if (m.voice) {
      kind = "voice";
      await c.tg("sendChatAction", { chat_id: chat, action: "typing" });
      const f = await tgFile(c, m.voice.file_id);
      src = (await transcribe(c, f.bytes)) ?? "";
      if (!src) { await send("Не расслышал голосовое. Попробуйте ещё раз или напишите текстом."); return; }
      parsed = await ai(c, src, false);
      if (parsed) parsed.items = grounded(src, parsed.items);
    } else {
      src = String(m.text ?? "").trim();
      parsed = await ai(c, src, false);
      if (parsed) parsed.items = grounded(src, parsed.items);
    }
  } catch (e) { parsed = null; }
  if (!parsed || !parsed.items.length) {
    await send((kind === "photo" ? "Не смог разобрать чек. Сфотографируйте ближе и ровнее, или напишите текстом." : `Не понял закуп${src ? ` из «${esc(src.slice(0, 120))}»` : ""}. Нужны название и сумма.`) + "\n\n" + BUY_HELP); return;
  }
  const sum = parsed.items.reduce((a: number, i: any) => a + i.total, 0);
  // итог чека важнее суммы строк, если он прочитан и отличается не больше чем на 30%
  const total = kind === "photo" && parsed.total && Math.abs(parsed.total - sum) / Math.max(sum, 1) < 0.3 ? Math.round(parsed.total) : sum;
  const today = c.iso(c.almNow()), d = day ?? today;
  const { data: b, error } = await c.db.from("bot_buys").insert({ d, chat_id: chat, by_name: who, vendor: parsed.vendor, total, kind, photo, raw: { src: src || null, unsure: parsed.unsure, ai_total: parsed.total } }).select().single();
  if (error) { await send("Не получилось сохранить, попробуйте ещё раз."); return; }
  await c.db.from("bot_buy_items").insert(parsed.items.map((i: any) => ({ ...i, buy_id: b.id })));
  const B = await blocks(c);
  let note = "";
  if (d !== today) note += `\n📅 <b>Запишу на ${DM(d)}</b>, не на сегодня.`;
  if (kind === "voice") note += `\n\n🎙 <i>${esc(src.slice(0, 200))}</i>`;
  if (total !== sum) note += `\n<i>Сумма строк ${money(sum)}, итог по чеку ${money(total)}.</i>`;
  if (parsed.unsure.length) note += `\n⚠️ <i>Проверьте: ${esc(parsed.unsure.join("; "))}</i>`;
  note += "\n\n<b>Откуда деньги?</b>";
  await send(card(b, parsed.items, B, note), { reply_markup: kb(b.id) });
}

// Кнопка под карточкой: источник денег (подтверждение) или отмена
export async function buyCallback(c: Ctx, q: any, who: string | null) {
  const [, idS, act] = String(q.data).split(":");
  const id = Number(idS), chat = q.message?.chat?.id;
  const ans = (text: string) => c.tg("answerCallbackQuery", { callback_query_id: q.id, text });
  if (!who) { await ans("Нет доступа"); return; }
  const { data: b } = await c.db.from("bot_buys").select("*").eq("id", id).maybeSingle();
  if (!b || b.chat_id !== chat) { await ans("Не найдено"); return; }
  if (b.status !== "draft") { await ans(b.status === "ok" ? "Уже записано" : "Уже отменено"); return; }
  const { data: items } = await c.db.from("bot_buy_items").select("*").eq("buy_id", id).order("id");
  const B = await blocks(c);
  if (act === "void") {
    await c.db.from("bot_buys").update({ status: "void" }).eq("id", id).eq("status", "draft");
    await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, parse_mode: "HTML", text: card(b, items || [], B, "\n\n❌ <b>Отменено</b>, в учёт не попало. Пришлите заново.") });
    await ans("Отменено"); return;
  }
  if (!SRC[act]) { await ans("?"); return; }
  const { data: upd } = await c.db.from("bot_buys").update({ status: "ok", source: act, confirmed_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id");
  if (!upd?.length) { await ans("Уже записано"); return; }
  const where = act === "biz" ? "в «Деньги ТОО»" : act === "cash" ? "в «Отчёт дня», минус из кассы" : "в «Отчёт дня»";
  await c.tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, parse_mode: "HTML", text: card(b, items || [], B, `\n\n✅ <b>Записано</b>: ${SRC[act]}, ${where}.\nОшиблись? /отмена - уберу последний закуп.`) });
  await ans("Записано ✅");
}

// /отмена для закупа: последний закуп этого человека, внесённый за последние сутки
export async function buyUndo(c: Ctx, chat: number) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data: last } = await c.db.from("bot_buys").select("id,total,vendor,status").eq("chat_id", chat).gte("created_at", since).in("status", ["ok", "draft"]).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!last) return false;
  await c.db.from("bot_buys").update({ status: "void" }).eq("id", last.id);
  await c.tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: `↩️ Убрал закуп${last.vendor ? ` (${esc(last.vendor)})` : ""} на ${money(last.total)}.` });
  return true;
}

// Новый человек: заявка владельцам, пустить кнопкой
export async function joinRequest(c: Ctx, from: any, chat: number, owners: number[]) {
  const name = ([from.first_name, from.last_name].filter(Boolean).join(" ") || (from.username ? "@" + from.username : "Сотрудник")).slice(0, 40);
  await c.tg("sendMessage", { chat_id: chat, text: "Здравствуйте! Это бот кафе Degirmen Navoi. Отправил владельцу заявку на доступ. Как только он подтвердит, я напишу." });
  for (const o of owners) await c.tg("sendMessage", { chat_id: o, parse_mode: "HTML", text: `👋 <b>${esc(name)}</b>${from.username ? ` (@${esc(from.username)})` : ""} просит доступ к боту: закупы и списания.\nВыручку и отчёты сотрудник видеть не будет.`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Пустить", callback_data: `join:${chat}:ok` }, { text: "Нет", callback_data: `join:${chat}:no` }]] } });
}
export async function joinCallback(c: Ctx, q: any, isOwner: boolean, staffHelp: string) {
  const [, chatS, act] = String(q.data).split(":");
  const chat = Number(chatS);
  if (!isOwner) { await c.tg("answerCallbackQuery", { callback_query_id: q.id, text: "Только владелец" }); return; }
  const base = String(q.message?.text ?? "").split("\n")[0];
  if (act === "ok") {
    const ch = await c.tg("getChat", { chat_id: chat });
    const name = ch.ok ? ([ch.result.first_name, ch.result.last_name].filter(Boolean).join(" ") || ch.result.username || "Сотрудник").slice(0, 40) : "Сотрудник";
    await c.db.from("tg_staff").upsert({ chat_id: chat, name, active: true });
    await c.tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: `Готово, доступ открыт ✅\n\n${BUY_HELP}\n\n${staffHelp}` });
    await c.tg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `${base}\n✅ Пустили` });
  } else {
    await c.tg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `${base}\n✖️ Отказано` });
  }
  await c.tg("answerCallbackQuery", { callback_query_id: q.id, text: act === "ok" ? "Доступ открыт" : "Отказано" });
}

// ---------- отчёты ----------
const bar = (v: number, max: number) => "▇".repeat(Math.max(1, Math.round((v / Math.max(max, 1)) * 10)));
async function period(c: Ctx, from: string, to: string) {
  const { data: bs } = await c.db.from("bot_buys").select("id,d,source,total,by_name,vendor").eq("status", "ok").gte("d", from).lte("d", to);
  const ids = (bs || []).map((b: any) => b.id);
  const { data: it } = ids.length ? await c.db.from("bot_buy_items").select("buy_id,block,total,name").in("buy_id", ids) : { data: [] };
  const byBlock: Record<string, number> = {}, bySrc: Record<string, number> = {};
  for (const i of it || []) byBlock[i.block] = (byBlock[i.block] ?? 0) + +i.total;
  for (const b of bs || []) bySrc[b.source] = (bySrc[b.source] ?? 0) + +b.total;
  const total = (bs || []).reduce((a: number, b: any) => a + +b.total, 0);
  return { bs: bs || [], it: it || [], byBlock, bySrc, total };
}
export function blockLines(P: any, B: Record<string, string>) {
  const max = Math.max(...Object.values(P.byBlock as Record<string, number>), 1);
  return BLOCK_KEYS.filter((k) => P.byBlock[k]).sort((a, b) => P.byBlock[b] - P.byBlock[a])
    .map((k) => `${esc(B[k] ?? k)}: <b>${money(P.byBlock[k])}</b>\n<code>${bar(P.byBlock[k], max)}</code>`).join("\n");
}
const srcLine = (P: any) => Object.keys(SRC).filter((k) => P.bySrc[k]).map((k) => `${SRC[k]}: ${money(P.bySrc[k])}`).join("\n");
export async function buyPeriod(c: Ctx, from: string, to: string) { return { P: await period(c, from, to), B: await blocks(c) }; }

export async function buyDaily(c: Ctx, day?: string) {
  const d = day ?? c.iso(c.almNow());
  const P = await period(c, d, d), B = await blocks(c);
  const { data: fl } = await c.db.from("fin_buy_all").select("total").eq("src", "day").eq("d", d);
  const form = (fl || []).reduce((a: number, x: any) => a + +x.total, 0);
  if (!P.bs.length && !form) return { text: `🧾 <b>Закуп за ${DM(d)}</b>\nСегодня закупов не было.` };
  let t = `🧾 <b>Закуп за ${DM(d)}: ${money(P.total + form)}</b>\n`;
  if (P.bs.length) t += `\n${blockLines(P, B)}\n\n<b>Откуда деньги</b>\n${srcLine(P)}\n`;
  if (form) t += `\n✍️ Ещё вписано вручную в «Отчёт дня»: ${money(form)}`;
  const who = [...new Set(P.bs.map((b: any) => b.by_name).filter(Boolean))];
  if (who.length) t += `\n\nЧеки присылали: ${esc(who.join(", "))} (${P.bs.length} шт.)`;
  return { text: t };
}

export async function buyMonth(c: Ctx, ym?: string) {
  const now = c.almNow();
  const base = ym ? new Date(ym + "-01T00:00:00Z") : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const from = c.iso(base), to = c.iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  const pb = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1));
  const pfrom = c.iso(pb), pto = c.iso(new Date(Date.UTC(pb.getUTCFullYear(), pb.getUTCMonth() + 1, 0)));
  const P = await period(c, from, to), Q = await period(c, pfrom, pto), B = await blocks(c);
  const { data: fl } = await c.db.from("fin_buy_all").select("total").eq("src", "day").gte("d", from).lte("d", to);
  const form = (fl || []).reduce((a: number, x: any) => a + +x.total, 0);
  const diff = Q.total ? Math.round((P.total / Q.total - 1) * 100) : null;
  let t = `📊 <b>Закуп за ${MONTHS[base.getUTCMonth()]} ${base.getUTCFullYear()}: ${money(P.total + form)}</b>\n`;
  if (P.bs.length) {
    t += `Через бота: ${money(P.total)} (${P.bs.length} чеков)${diff != null ? `, к прошлому месяцу ${diff >= 0 ? "▲ +" : "▼ "}${diff}%` : ""}\n`;
    t += `\n${blockLines(P, B)}\n\n<b>Откуда деньги</b>\n${srcLine(P)}\n`;
  }
  if (form) t += `\n✍️ Вписано вручную в «Отчёт дня»: ${money(form)}`;
  // опоздания за месяц (время прихода с листа кассы)
  const { data: AS } = await c.db.rpc("arrivals_stats", { p_from: from, p_to: to });
  const late = (AS?.people || []).filter((p: any) => p.late > 0);
  if ((AS?.people || []).length) t += `\n\n⏰ <b>Опоздания</b> (позже начала смены больше чем на 10 мин)\n${late.length ? late.map((p: any) => `• ${esc(p.name)}: ${p.late} из ${p.days} дн.${p.late_avg ? `, в среднем на ${p.late_avg} мин` : ""}`).join("\n") : "Никто не опаздывал 👍"}`;
  const { data: OD } = await c.db.rpc("owner_debts", { p_from: from, p_to: to });
  if ((OD || []).length) t += `\n\n🧑‍💼 <b>Долг владельцев за месяц</b> (авансы, вернуть)\n${OD.map((o: any) => `• ${esc(o.name)}: ${money(o.total)}`).join("\n")}`;
  t += `\n\nПодробно с графиками: приложение → «Закупы».`;
  return { text: t };
}
