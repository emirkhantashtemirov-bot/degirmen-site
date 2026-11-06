// Оплата заказов через Halyk ePay (платёжная страница банка).
// Доступы лежат в закрытой таблице paloma_config (epay_*), в код и репозиторий не попадают.
// Операции:
//   start  - гость начинает оплату своего заказа -> данные для страницы ePay
//   check  - перепроверить оплату заказа (гость, касса)
//   post   - уведомление от банка (postLink); оплату всегда перепроверяем запросом статуса
//   refund - возврат, только владельцы (can_refund)
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const pdb = db;
const SELF = SB_URL + "/functions/v1/epay";
const SITE = "https://degirmen-navoi.kz/";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const HOSTS = {
  prod: { oauth: "https://epay-oauth.homebank.kz/oauth2/token", api: "https://epay-api.homebank.kz", js: "https://epay.homebank.kz/payform/payment-api.js" },
  test: { oauth: "https://test-epay-oauth.epayment.kz/oauth2/token", api: "https://test-epay-api.epayment.kz", js: "https://test-epay.epayment.kz/payform/payment-api.js" },
};

async function cfg() {
  const { data } = await db.from("paloma_config").select("k,v").in("k", ["epay_terminal_id", "epay_client_id", "epay_client_secret", "epay_env"]);
  const m: Record<string, string> = {};
  (data ?? []).forEach((r: any) => (m[r.k] = r.v));
  if (!m.epay_terminal_id || !m.epay_client_id || !m.epay_client_secret) throw new Error("epay_not_configured");
  const env = m.epay_env === "test" ? "test" : "prod";
  return { terminal: m.epay_terminal_id, id: m.epay_client_id, secret: m.epay_client_secret, h: HOSTS[env], env };
}

async function token(c: Awaited<ReturnType<typeof cfg>>, extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("grant_type", "client_credentials");
  f.set("scope", "webapi usermanagement email_send verification statement statistics payment");
  f.set("client_id", c.id);
  f.set("client_secret", c.secret);
  f.set("terminal", c.terminal);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  const r = await fetch(c.h.oauth, { method: "POST", body: f, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok || !j?.access_token) throw new Error(`token ${r.status}: ${t.slice(0, 200)}`);
  return j;
}

async function status(c: Awaited<ReturnType<typeof cfg>>, invoice: string) {
  const tk = await token(c);
  const r = await fetch(`${c.h.api}/check-status/payment/transaction/${invoice}`, { headers: { Authorization: `Bearer ${tk.access_token}` }, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { resultCode: "x", raw: t.slice(0, 300) }; }
}

async function op(c: Awaited<ReturnType<typeof cfg>>, txId: string, action: "charge" | "refund", amount?: number) {
  const tk = await token(c);
  const q = action === "refund" ? `?externalID=r${txId}` + (amount ? `&amount=${amount}` : "") : "";
  const r = await fetch(`${c.h.api}/operation/${txId}/${action}${q}`, { method: "POST", headers: { Authorization: `Bearer ${tk.access_token}` }, signal: AbortSignal.timeout(30000) });
  return { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 300) };
}

// Halyk QR (киоск): токен с суммой и номером счёта -> строка QR; статус - тем же токеном (живёт 20 минут)
async function qrGenerate(c: Awaited<ReturnType<typeof cfg>>, invoice: string, amount: number, oid: number) {
  const tk = await token(c, { invoiceID: invoice, amount: String(amount), currency: "KZT" });
  const post = `${SELF}?op=post`;
  const r = await fetch(`${c.h.api}/payment/qr/generate`, {
    method: "POST", headers: { Authorization: `Bearer ${tk.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: `order-${oid}`, postLink: post, failurePostLink: post, description: `Degirmen Navoi, заказ ${oid}`, language: "ru" }),
    signal: AbortSignal.timeout(20000),
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok || !j?.qrcode) throw new Error(`qr ${r.status}: ${t.slice(0, 200)}`);
  return { qr: j, qrToken: tk.access_token as string };
}
async function qrStatus(c: Awaited<ReturnType<typeof cfg>>, qrToken: string) {
  const r = await fetch(`${c.h.api}/qr`, { headers: { Authorization: `Bearer ${qrToken}` }, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { status: `http${r.status}` }; }
}

// Сверить заказ с банком и записать результат. Возвращает итоговый pay_status.
async function verify(invoice: string) {
  const { data: tx } = await pdb.from("epay_tx").select("*").eq("invoice", invoice).maybeSingle();
  if (!tx) return { pay: "unknown" };
  const { data: o } = await db.from("orders").select("id,total,pay_status,status").eq("id", tx.order_id).single();
  if (o.pay_status === "paid" || o.pay_status === "refunded") return { pay: o.pay_status, order: o.id };
  const c = await cfg();
  let s = await status(c, invoice);
  let tr = s?.transaction ?? null;
  // двухстадийная схема: сумма заблокирована, списываем
  if (s?.resultCode === "100" && tr?.statusName === "AUTH" && tr?.id) {
    await op(c, String(tr.id), "charge");
    s = await status(c, invoice);
    tr = s?.transaction ?? null;
  }
  const amount = Math.round(Number(tr?.amount ?? 0));
  const okPaid = s?.resultCode === "100" && tr?.statusName === "CHARGE" && amount === tx.amount && amount === o.total;
  const failed = s?.resultCode === "101" || ["FAILED", "REJECT", "3D", "CANCEL", "CANCEL_OLD"].includes(tr?.statusName);
  await pdb.from("epay_tx").update({ status: tr?.statusName ?? `rc${s?.resultCode}`, tx_id: tr?.id ? String(tr.id) : tx.tx_id, card: tr?.cardMask ?? tx.card, raw: { ...s, ...(tx.raw?.kind === "qr" ? { kind: "qr", qr_token: tx.raw.qr_token, qr_at: tx.raw.qr_at } : {}) }, updated_at: new Date().toISOString() }).eq("invoice", invoice);
  if (okPaid) {
    await db.from("orders").update({ paid: true, pay_status: "paid", paid_at: new Date().toISOString() }).eq("id", o.id).neq("pay_status", "paid");
    return { pay: "paid", order: o.id };
  }
  if (failed && o.pay_status === "pending") await db.from("orders").update({ pay_status: "failed" }).eq("id", o.id).eq("pay_status", "pending");
  return { pay: failed ? "failed" : "pending", order: o.id, bank: tr?.statusName ?? s?.resultCode };
}

// Возврат у банка асинхронный («in progress»): довести заказ до «возвращено», когда банк закончит
async function refundSettle(invoice: string, by?: string) {
  const { data: tx } = await pdb.from("epay_tx").select("*").eq("invoice", invoice).maybeSingle();
  if (!tx || !["REFUND_PENDING", "REFUND"].includes(tx.status)) return false;
  const c = await cfg();
  const s = await status(c, invoice);
  if (s?.transaction?.statusName !== "REFUND") return false;
  await pdb.from("epay_tx").update({ status: "REFUND", raw: { ...(tx.raw ?? {}), status: s }, updated_at: new Date().toISOString() }).eq("invoice", invoice);
  const { data: o } = await db.from("orders").select("pay_status").eq("id", tx.order_id).single();
  if (o?.pay_status !== "refunded") {
    await db.from("orders").update({ pay_status: "refunded", refunded_at: new Date().toISOString(), status: "cancelled" }).eq("id", tx.order_id);
    await pdb.from("epay_refunds").insert({ order_id: tx.order_id, invoice, amount: tx.amount, by_user: by ?? tx.raw?.refund_by ?? "00000000-0000-0000-0000-000000000000" });
  }
  return true;
}

async function caller(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const uc = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await uc.auth.getUser();
  return data?.user ? { id: data.user.id, uc } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = new URL(req.url);
  try {
    // уведомление от банка: всегда отвечаем 200, оплату подтверждаем только через запрос статуса
    if (u.searchParams.get("op") === "post") {
      const b: any = await req.json().catch(() => ({}));
      const inv = String(b?.invoiceId ?? "").replace(/\D/g, "");
      if (inv) {
        const { data: tx } = await pdb.from("epay_tx").select("secret_hash,raw").eq("invoice", inv).maybeSingle();
        if (tx && (b.secret_hash === tx.secret_hash || tx.raw?.kind === "qr")) await verify(inv);
      }
      return json({ ok: true });
    }

    const body: any = await req.json().catch(() => ({}));
    // служебная проверка связи с банком (только с закрытым trigger_token)
    if (body.op === "ping") {
      const { data: tt } = await db.from("paloma_config").select("v").eq("k", "trigger_token").maybeSingle();
      if (!tt?.v || body.token !== tt.v) return json({ error: "forbidden" }, 403);
      const c = await cfg();
      if (body.qrprobe) { const { data: n } = await pdb.rpc("epay_next_invoice"); try { const g = await qrGenerate(c, String(n), 10, 0); return json({ qr: true, status: g.qr.status, hasHome: !!g.qr.homebankLink }); } catch (e) { return json({ qr: false, err: String((e as Error).message).slice(0, 200) }); } }
      if (body.invoice) { const inv = String(body.invoice).replace(/\D/g, ""); await refundSettle(inv); const s = await status(c, inv); return json({ bank: s?.transaction?.statusName ?? s?.resultCode, amount: s?.transaction?.amount ?? null }); }
      const tk = await token(c);
      const s = await status(c, "100000");
      return json({ env: c.env, token: !!tk.access_token, expires: tk.expires_in, scope: tk.scope, status_probe: s?.resultCode ?? s });
    }
    const me = await caller(req);
    if (!me) return json({ error: "auth" }, 401);
    const oid = Number(body.order_id);
    if (!(oid > 0)) return json({ error: "bad_input" }, 400);
    const { data: o } = await db.from("orders").select("id,user_id,total,status,pay_method,pay_status,items").eq("id", oid).maybeSingle();
    if (!o) return json({ error: "not_found" }, 404);
    const { data: isStaff } = await me.uc.rpc("is_staff");
    const own = o.user_id === me.id;

    if (body.op === "start") {
      if (!own) return json({ error: "forbidden" }, 403);
      if (o.pay_method !== "online" || !["pending", "failed"].includes(o.pay_status) || o.status !== "new" || !(o.total > 0)) return json({ error: "not_payable", pay: o.pay_status });
      // если по прошлой попытке банк уже списал деньги - не создаём новую оплату
      const { data: last } = await pdb.from("epay_tx").select("invoice").eq("order_id", oid).order("created_at", { ascending: false }).limit(1);
      if (last?.length) { const v = await verify(last[0].invoice); if (v.pay === "paid") return json({ error: "already_paid", pay: "paid" }); }
      const c = await cfg();
      const { data: n, error: ne } = await pdb.rpc("epay_next_invoice");
      if (ne || !(Number(n) > 0)) throw new Error("invoice: " + (ne?.message ?? "empty"));
      const invoice = String(n);
      const secret = crypto.randomUUID().replace(/-/g, "");
      // без записи в журнале в банк не отправляем: иначе оплату нельзя будет подтвердить
      const ins = await pdb.from("epay_tx").insert({ invoice, order_id: oid, amount: o.total, secret_hash: secret });
      if (ins.error) throw new Error("tx: " + ins.error.message);
      if (o.pay_status === "failed") await db.from("orders").update({ pay_status: "pending" }).eq("id", oid);
      const post = `${SELF}?op=post`;
      const auth = await token(c, { invoiceID: invoice, secret_hash: secret, amount: String(o.total), currency: "KZT", postLink: post, failurePostLink: post });
      const lang = ({ ru: "rus", kk: "kaz", en: "eng" } as any)[body.lang] ?? "rus";
      return json({
        js: c.h.js,
        pay: {
          invoiceId: invoice, backLink: `${SITE}?pay=ok&o=${oid}`, failureBackLink: `${SITE}?pay=fail&o=${oid}`, postLink: post, failurePostLink: post,
          language: lang, description: `Degirmen Navoi, заказ ${oid}`, accountId: me.id.slice(0, 30), terminal: c.terminal, amount: o.total, currency: "KZT", auth,
        },
      });
    }

    if (body.op === "qr") {
      if (!own) return json({ error: "forbidden" }, 403);
      if (o.pay_method !== "online" || !["pending", "failed"].includes(o.pay_status) || o.status !== "new" || !(o.total > 0)) return json({ error: "not_payable", pay: o.pay_status });
      const { data: last } = await pdb.from("epay_tx").select("invoice").eq("order_id", oid).order("created_at", { ascending: false }).limit(1);
      if (last?.length) { const v = await verify(last[0].invoice); if (v.pay === "paid") return json({ error: "already_paid", pay: "paid" }); }
      const c = await cfg();
      const { data: n, error: ne } = await pdb.rpc("epay_next_invoice");
      if (ne || !(Number(n) > 0)) throw new Error("invoice: " + (ne?.message ?? "empty"));
      const invoice = String(n);
      const ins = await pdb.from("epay_tx").insert({ invoice, order_id: oid, amount: o.total, secret_hash: crypto.randomUUID().replace(/-/g, ""), raw: { kind: "qr" } });
      if (ins.error) throw new Error("tx: " + ins.error.message);
      if (o.pay_status === "failed") await db.from("orders").update({ pay_status: "pending" }).eq("id", oid);
      const g = await qrGenerate(c, invoice, o.total, oid);
      await pdb.from("epay_tx").update({ raw: { kind: "qr", qr_token: g.qrToken, qr_at: new Date().toISOString(), qr_status: g.qr.status } }).eq("invoice", invoice);
      return json({ qrcode: g.qr.qrcode, homebankLink: g.qr.homebankLink ?? null, invoice, amount: o.total, ttl: 1200 });
    }

    if (body.op === "qrstatus") {
      if (!own && !isStaff) return json({ error: "forbidden" }, 403);
      if (o.pay_status === "paid") return json({ pay: "paid" });
      const { data: tx } = await pdb.from("epay_tx").select("*").eq("order_id", oid).order("created_at", { ascending: false }).limit(1);
      const t = tx?.[0];
      if (!t?.raw?.qr_token) return json({ pay: o.pay_status, qr: "none" });
      const c = await cfg();
      const q = await qrStatus(c, t.raw.qr_token);
      const st = String(q?.status ?? "");
      let pay = o.pay_status;
      if (st === "PAID") pay = (await verify(t.invoice)).pay;
      const old = (Date.now() - Date.parse(t.raw.qr_at ?? t.created_at)) > 1200e3;
      return json({ pay, qr: st || "unknown", expired: old || ["CLOSED", "RETURN", "REJECTED"].includes(st) });
    }

    if (body.op === "check") {
      if (!own && !isStaff) return json({ error: "forbidden" }, 403);
      const { data: tx } = await pdb.from("epay_tx").select("invoice").eq("order_id", oid).order("created_at", { ascending: false }).limit(3);
      let res: any = { pay: o.pay_status };
      for (const t of tx ?? []) { if (await refundSettle(t.invoice)) return json({ pay: "refunded" }); res = await verify(t.invoice); if (res.pay === "paid") break; }
      return json(res);
    }

    if (body.op === "refund") {
      const { data: may } = await me.uc.rpc("can_refund");
      if (may !== true) return json({ error: "forbidden" }, 403);
      if (o.pay_status !== "paid") return json({ error: "not_paid" });
      const { data: tx } = await pdb.from("epay_tx").select("*").eq("order_id", oid).in("status", ["CHARGE", "REFUND_PENDING"]).order("created_at", { ascending: false }).limit(1);
      const t = tx?.[0];
      if (!t?.tx_id) return json({ error: "no_tx" });
      if (t.amount < 10) return json({ error: "min_10" });
      // возврат уже отправлен - второй раз не шлём, только проверяем
      if (t.status === "REFUND_PENDING") return json(await refundSettle(t.invoice, me.id) ? { ok: true } : { ok: false, pending: true });
      const c = await cfg();
      const r = await op(c, t.tx_id, "refund");
      const accepted = r.ok || /in progress/i.test(r.body);
      if (!accepted) return json({ ok: false, http: r.status, err: r.body });
      await pdb.from("epay_tx").update({ status: "REFUND_PENDING", raw: { ...(t.raw ?? {}), refund: r, refund_by: me.id }, updated_at: new Date().toISOString() }).eq("invoice", t.invoice);
      for (let i = 0; i < 6; i++) { await new Promise((z) => setTimeout(z, 2500)); if (await refundSettle(t.invoice, me.id)) return json({ ok: true }); }
      return json({ ok: false, pending: true });
    }
    return json({ error: "unknown_op" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
});
