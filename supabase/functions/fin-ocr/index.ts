// Распознавание фото для «Отчёта дня»: лист кассы (рукописный) или чек поставщика -> строки формы.
// Доступ: кассир и владельцы (по токену входа). Ничего не сохраняет - только возвращает черновик, человек проверяет и сохраняет сам.
// Режим проверки для разработчика: {test:1, token:<trigger_token>, image} без входа.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const MODELS = ["qwen/qwen3.8-27b"]; // модель с поддержкой картинок
const TEXT_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]; // для отчёта текстом
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SYS = `Ты читаешь фото кассового отчёта кафе Degirmen (Алматы) или чека поставщика и переносишь цифры в JSON. Текст рукописный, на русском.
Лист кассы - таблица с колонками: Наименование | кг/шт | кол-во | цена | цена Итого. Разделы сверху вниз:
- "Закуп кухня" -> grp "kitchen"; "Закуп Бар/Раздача" -> grp "bar"; "Закуп Донер" (овощи, лаваш, соусы, другое) -> grp "doner"
- печатные строки "Закуп Базар без/нал" -> grp "bazar"; "Закуп Дегирмен без/нал" -> grp "degirmen"
- "Расходная часть": Стафф 1 Уста донер -> "usta", Стафф 2 Касса -> "kassa", Стафф 3 Кухня -> "kitchen", Стафф 4 Техперсонал -> "tech", прочие строки -> "other"
- "З/П, авансы/покупки сотрудники": строки Уста Донер -> "usta", Касса -> "kassa", Кухня -> "kitchen", Техперсонал -> "tech"
- Продажи пост терминал Каспий -> kaspi; Халык -> halyk; Глово -> glovo; Продажи наличными -> cash_sales; Общая выручка за день -> rev_total; Остаток нал в кассе -> cash_left

ГЛАВНЫЕ ПРАВИЛА ДЛЯ ЛИСТА:
1. Сумма строки закупа или расхода - число из колонки "цена Итого", а если там пусто - из колонки "цена". Числа из этих двух колонок - деньги кассы.
2. Если сумма написана прямо в колонке "Наименование" (например "Кока-кола 60874"), а в колонках "цена" и "цена Итого" этой строки пусто - это НЕ касса (скорее деньги ТОО или владельца). Такую строку НЕ клади в buy, а положи в "ask": {"name":"Кока-кола","total":60874,"near":"kitchen|bar|doner"}.
3. Запись "1000+400" в одной ячейке - это две суммы 1000 и 400 (две позиции, если названия разные, иначе одна на 1400).
4. Раздел "З/П, авансы": время вида 07:00, 07:30, 12:20 - это НЕ деньги, а время прихода сотрудника (первое время) и ухода (второе, если есть). Время клади в "arrivals": {"role":"usta|kassa|kitchen|tech","name":"имя","in":"07:30","out":"12:20 или null"}. Любое другое число в строке сотрудника, где бы оно ни стояло (кол-во, цена, цена Итого), с пометкой "ав", "ав.", "аванс" или без неё - это аванс сотрудника из кассы: положи в "pay" {"grp":роль,"name":"имя","total":число}.
5. От руки внизу листа может быть раздел "Дегирмен" с подпунктами "закуп" и "тара". Сумму "закуп" положи в buy {"grp":"degirmen","name":"Закуп Дегирмен","total":число}. "Тару" не переноси совсем - за неё не платят.
6. Если рядом с выручкой или остатком дописано "+число" и новая сумма - это ошибка, бери первое, исходное число (до прибавки), прибавку игнорируй.
7. Пометки "Донер ост.", остатки мяса и лаваша - не деньги, пропускай.
8. Итоговые строки ("Итого закуп кухня", "Итого Расходная часть", "ИТОГО ОБЩИЙ РАСХОД") не переноси как позиции, а запиши их числа в "sheet_totals" для сверки.
9. Дату в шапке (например 05.11.26) верни как "date" в виде YYYY-MM-DD.
10. Аванс владельца (рядом слово "владелец", "хозяин", "папа", или имя владельца из списка ниже в разделе авансов) - это ДОЛГ владельца: он взял еду или деньги и вернёт в конце месяца. Клади в "pay" {"grp":"owner","name":"Имя","total":число}. Это не расход. Но "<имя> стафф", еда сотрудника или владельца в разделе "Расходная часть" - это расход за счёт компании (exp). В "owner_out" клади только если прямо написано, что владелец забрал / изъял деньги из кассы.
11. Если рядом с суммой прямо написано "деньги ТОО", "ТОО", "без нал" - это не касса: положи строку в "ask" с "src":"biz"; если "свои", "личные" - "src":"own". Сумма "Тара" не считается никогда.
12. Отчёт может прийти ТЕКСТОМ вместо фото, разделы те же: "Закуп кухня: 11052" - одна строка закупа kitchen на эту сумму с названием "Закуп кухня"; "Расходная часть" - exp; "Авансы" - pay; "Время работы: Имя 09:00-22:00" - arrivals (in 09:00, out 22:00), роль по слову уста/донерщик/касса/кухня; "Продажи каспи/халык" - kaspi/halyk; "Остаток нал в кассе" - cash_left; "Закуп дегирмен: закуп X" - buy degirmen.
Если это чек поставщика (не лист), все его позиции - закуп; группу угадай по товару (мясо, лаваш, овощи, соусы для донера -> "doner"; напитки, выпечка, кофе, молоко -> "bar"; остальное -> "kitchen").
Верни ТОЛЬКО JSON без пояснений:
{"date":"YYYY-MM-DD или null","kind":"sheet|receipt","buy":[{"grp":"kitchen|bar|doner|bazar|degirmen","name":"","unit":"кг|шт|л|уп","qty":null,"price":null,"total":0}],
"exp":[{"grp":"usta|kassa|kitchen|tech|other","name":"","total":0}],"pay":[{"grp":"usta|kassa|kitchen|tech|owner","name":"","total":0}],
"ask":[{"name":"","total":0,"near":"kitchen","src":"biz|own|null"}],"owner_out":null,"arrivals":[{"role":"kassa","name":"","in":"07:30","out":null}],
"kaspi":null,"halyk":null,"glovo":null,"cash_sales":null,"rev_total":null,"cash_left":null,
"sheet_totals":{"kitchen":null,"bar":null,"doner":null,"exp":null,"all":null},"unsure":["что прочиталось неуверенно, коротко"]}
Числа - без пробелов и знака ₸; пустые строки пропускай; если цифра не читается - не выдумывай, поставь null и упомяни в unsure.`;

const num = (v: any) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[\s ₸]/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/[  ]/g, " ");
const TIME = /^\d{1,2}:\d{2}$/;

// Доводка ответа модели: наличные продажи из общей выручки, сверка итогов листа, чистка времени прихода
function post(o: any) {
  if (!o || typeof o !== "object") return o;
  for (const k of ["buy", "exp", "pay", "ask", "arrivals", "unsure"]) if (!Array.isArray(o[k])) o[k] = [];
  const tot = (l: any) => num(l?.total) ?? ((num(l?.qty) || 0) * (num(l?.price) || 0));
  // время, случайно попавшее в деньги, переносим в приход
  o.pay = o.pay.filter((l: any) => { const s = String(l?.total ?? "").trim(); if (TIME.test(s)) { o.arrivals.push({ role: l.grp, name: l.name, in: s, out: null }); return false; } return true; });
  o.arrivals = o.arrivals.map((a: any) => ({ role: ["usta", "kassa", "kitchen", "tech"].includes(a?.role) ? a.role : "other", name: String(a?.name ?? "").trim().slice(0, 40), in: TIME.test(String(a?.in ?? "").trim()) ? String(a.in).trim() : null, out: TIME.test(String(a?.out ?? "").trim()) ? String(a.out).trim() : null }))
    .filter((a: any) => a.name || a.in);
  o.ask = o.ask.map((a: any) => ({ name: String(a?.name ?? "").trim().slice(0, 80), total: Math.round(num(a?.total) || 0), near: ["kitchen", "bar", "doner"].includes(a?.near) ? a.near : "kitchen", src: ["biz", "own"].includes(a?.src) ? a.src : null })).filter((a: any) => a.name && a.total > 0);
  // тара не считается никогда
  o.buy = o.buy.filter((l: any) => !/^\s*тар/i.test(String(l?.name ?? "")));
  o.owner_out = num(o.owner_out);
  // наличные продажи не вписаны, а общая выручка есть: наличные = выручка - терминалы - Глово
  const rev = num(o.rev_total), cards = (num(o.kaspi) || 0) + (num(o.halyk) || 0) + (num(o.glovo) || 0);
  if (num(o.cash_sales) == null && rev != null && rev - cards >= 0 && cards > 0) {
    o.cash_sales = Math.round(rev - cards);
    o.unsure.push(`Наличные продажи на листе не вписаны - посчитал из общей выручки: ${fmt(rev)} - терминалы ${fmt(cards)} = ${fmt(o.cash_sales)}`);
  }
  // сверка с итогами, которые кассир написал на листе
  const T = o.sheet_totals || {}, chk = (label: string, sheet: any, mine: number) => {
    const s = num(sheet); if (s == null || !mine) return;
    if (Math.abs(s - mine) > 1) o.unsure.push(`${label}: на листе итог ${fmt(s)}, а по строкам ${fmt(mine)} (разница ${fmt(Math.abs(s - mine))})`);
  };
  const sumB = (g: string) => o.buy.filter((l: any) => l.grp === g).reduce((a: number, l: any) => a + (tot(l) || 0), 0);
  chk("Закуп кухня", T.kitchen, sumB("kitchen")); chk("Закуп бар", T.bar, sumB("bar")); chk("Закуп донер", T.doner, sumB("doner"));
  const exp = o.exp.reduce((a: number, l: any) => a + (tot(l) || 0), 0), pay = o.pay.reduce((a: number, l: any) => a + (tot(l) || 0), 0);
  chk("Расходная часть", T.exp, exp);
  chk("Итого общий расход", T.all, sumB("kitchen") + sumB("bar") + sumB("doner") + exp + pay);
  return o;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    let ok = false;
    if (body.test) {
      const { data } = await db.from("paloma_config").select("v").eq("k", "trigger_token").maybeSingle();
      ok = !!data && body.token === data.v;
    } else {
      const auth = req.headers.get("Authorization") || "";
      const { data } = await db.auth.getUser(auth.replace("Bearer ", ""));
      if (data?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        ok = !!p && ["admin", "cashier"].includes(p.role);
      }
    }
    if (!ok) return json({ error: "forbidden" }, 403);
    if (body.post_test) return json({ ok: true, data: post(body.post_test) });
    const text = String(body.text || "").trim().slice(0, 4000);
    const img = String(body.image || "");
    if (!text && (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 4_000_000)) return json({ error: "bad_image" }, 400);
    if (!GROQ) return json({ error: "no_key" }, 500);
    let lastErr = "";
    const { data: ow } = await db.from("paloma_config").select("v").eq("k", "owners").maybeSingle();
    const owners = ow?.v ? `\nИмена владельцев: ${JSON.parse(ow.v).join(", ")}.` : "";
    const userMsg = text ? "Отчёт дня прислан текстом (не фото). Перенеси данные в JSON по тем же правилам:\n" + text
      : [{ type: "text", text: "Перенеси данные с фото в JSON." + (body.hint ? " Подсказка: " + String(body.hint).slice(0, 200) : "") }, { type: "image_url", image_url: { url: img } }];
    for (const model of text ? TEXT_MODELS : MODELS) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, temperature: 0.1, max_tokens: 5000, response_format: { type: "json_object" },
            ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}), messages: [{ role: "system", content: SYS + owners }, { role: "user", content: userMsg }] }),
          signal: AbortSignal.timeout(55000),
        });
        if (!r.ok) { lastErr += ` ${model}:${r.status}:${(await r.text()).slice(0, 300)}`; continue; }
        const j = await r.json();
        const txt = String(j.choices?.[0]?.message?.content || "").trim().replace(/^```(json)?/, "").replace(/```$/, "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
        const out = post(JSON.parse(txt.slice(s, e + 1)));
        return json({ ok: true, model, data: out });
      } catch (e) { lastErr += ` ${model}:${(e as Error).message}`; }
    }
    return json({ error: "ai_failed", detail: lastErr.slice(0, 600) }, 502);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
