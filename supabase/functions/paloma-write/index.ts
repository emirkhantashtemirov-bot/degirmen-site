// Создание позиций и разделов в Paloma через официальный AI Connector (MCP) с правом «Создание и редактирование».
// Вызывать может только админ приложения (проверка по его JWT). Токен Paloma хранится в секретах Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("PALOMA_MCP_URL") ?? "";
const TOKEN = Deno.env.get("PALOMA_MCP_TOKEN") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

let sid: string | null = null, rid = 0;
async function rpc(method: string, params: any = {}, notify = false) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${TOKEN}`, ...(sid ? { "Mcp-Session-Id": sid } : {}) },
    body: JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++rid, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  sid = r.headers.get("mcp-session-id") ?? sid;
  if (notify) return null;
  const txt = await r.text();
  if (!r.ok) throw new Error(`Paloma ${r.status}: ${txt.slice(0, 300)}`);
  // ответ может прийти обычным JSON или потоком SSE
  const lines = txt.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  const msg = JSON.parse(lines.length ? lines[lines.length - 1] : txt);
  if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
  return msg.result;
}
async function connect() {
  sid = null;
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "degirmen-app", version: "1.0" } });
  await rpc("notifications/initialized", {}, true);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: adm } = await uc.rpc("is_admin");
    let ok = adm === true;
    if (!ok && body.token) {
      // служебный вызов из базы (для проверки подключения) по закрытому trigger_token
      const sc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: c } = await sc.from("paloma_config").select("v").eq("k", "trigger_token").maybeSingle();
      ok = !!c?.v && body.token === c.v && !["create"].includes(body.op);
    }
    if (!ok) return json({ error: "forbidden" }, 403);
    if (!URL_ || !TOKEN) return json({ error: "not_configured" });
    await connect();
    const tools = (await rpc("tools/list")).tools as any[];
    if (body.op === "tools") return json({ tools: tools.map((t) => ({ name: t.name, description: String(t.description || "").slice(0, 300), props: t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : [] })) });
    if (body.op === "schema") { const t = tools.find((x) => x.name === body.name); return json({ tool: t ?? null }); }
    // результат инструмента: структурированный или JSON в тексте
    const out = (r: any) => { if (r?.structuredContent) return r.structuredContent; const t = r?.content?.find((c: any) => c.type === "text")?.text ?? ""; try { return JSON.parse(t); } catch { return { text: t }; } };
    const call = async (name: string, args: any) => { const r = await rpc("tools/call", { name, arguments: args }); if (r?.isError) throw new Error(`${name}: ${JSON.stringify(r.content).slice(0, 300)}`); return out(r); };
    const deep = (o: any, k: string): any => { if (!o || typeof o !== "object") return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const x = deep(v, k); if (x !== undefined) return x; } return undefined; };
    const pull = async () => { try { const sc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); const { data: tt } = await sc.from("paloma_config").select("v").eq("k", "trigger_token").maybeSingle(); await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/paloma-pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tt?.v, jobs: [{ kind: "items" }] }) }); } catch { /* не критично */ } };
    if (body.op === "item") return json(await call("get_item", { id: Number(body.id) }));
    // смена цены: только если сейчас стоит ожидаемая старая цена (expect)
    if (body.op === "price") {
      const id = Number(body.id), price = Math.round(Number(body.price)), expect = Number(body.expect);
      if (!(id > 0) || !(price >= 0 && price < 10_000_000) || !Number.isFinite(expect)) return json({ error: "bad_input" }, 400);
      const priceNow = async () => { const c = await call("get_item", { id }); return Number(deep(c, "item")?.price ?? deep(c, "price")); };
      const before = await priceNow();
      if (before !== expect) return json({ error: "price_mismatch", before, expect }, 409);
      // Paloma иногда отвечает «Deadlock», если пишут несколько цен одновременно: повторяем до 4 раз с паузой
      let done: any = null, after = before;
      for (let i = 0; i < 4; i++) {
        const prep = await call("propose_update", { id, fields: { price } });
        done = await call("execute_update", { action_token: deep(prep, "action_token") });
        after = await priceNow();
        if (after === price) break;
        if (!/deadlock|lock wait/i.test(JSON.stringify(done))) break;
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1700));
      }
      await pull();
      return json({ ok: after === price, id, before, after, done });
    }
    // чтение справочников и документов (без записи)
    if (body.op === "read" && ["list_documents", "get_document", "list_reference", "describe_document_type", "list_vendors", "search_items", "list_items"].includes(body.name)) return json(await call(body.name, body.args ?? {}));
    if (body.op === "units") return json(await call("list_units", body.q ? { name_contains: body.q } : {}));
    if (body.op === "create") {
      const name = String(body.name ?? "").trim().slice(0, 200), price = Math.round(Number(body.price));
      if (!name || !(price >= 0 && price < 10_000_000)) return json({ error: "bad_input" }, 400);
      const sc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      // не создаём дубль с тем же названием
      const same = await call("search_items", { query: name });
      const hit = JSON.stringify(same).toLowerCase().includes(`"${name.toLowerCase()}"`);
      if (hit && !body.force) return json({ error: "exists" });
      // раздел: существующий (по uid из нашей копии справочника) или новый
      let parentid = 0;
      if (body.newGroup) {
        const gname = String(body.group ?? "").trim().slice(0, 200);
        if (!gname) return json({ error: "bad_input" }, 400);
        const prep = await call("create_group", { name: gname, parentid: 0 });
        const done = await call("execute_create", { action_token: deep(prep, "action_token") });
        parentid = Number(deep(done, "created")?.id ?? deep(done, "id"));
      } else {
        const { data: g } = await sc.from("paloma_items").select("id,is_group").eq("uid", String(body.groupUid ?? "")).maybeSingle();
        if (!g?.is_group) return json({ error: "no_group" }, 400);
        parentid = Number(g.id);
      }
      // единица измерения «шт» (или порция)
      let units = await call("list_units", { name_contains: "шт" });
      let list: any[] = Array.isArray(units) ? units : (deep(units, "items") ?? deep(units, "units") ?? deep(units, "results") ?? []);
      if (!list.length) { units = await call("list_units", {}); list = Array.isArray(units) ? units : (deep(units, "items") ?? deep(units, "units") ?? deep(units, "results") ?? []); }
      const unit = list.find((u: any) => /^шт/i.test(String(u.name ?? u.title ?? ""))) ?? list[0];
      if (!unit) return json({ error: "no_unit", units });
      const prep = await call("create_item", { name, measurement: Number(unit.id), parentid, price, isservice: false });
      const done = await call("execute_create", { action_token: deep(prep, "action_token") });
      const id = deep(done, "created")?.id ?? deep(done, "id");
      // обновим нашу копию справочника, чтобы позиция сразу появилась в приложении
      await pull();
      return json({ ok: true, id, parentid, unit: unit.name ?? unit.id, preview: deep(prep, "preview") ?? null });
    }
    return json({ error: "unknown_op" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
