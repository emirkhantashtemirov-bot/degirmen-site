// Superhero: напоминания (pg_cron fit-remind раз в час). Белок вечером и «пора в зал». Ключи VAPID в paloma_config.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cfg = async (k: string) => (await db.from("paloma_config").select("v").eq("k", k).maybeSingle()).data?.v ?? null;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const trig = await cfg("trigger_token");
    if (!trig || body.token !== trig) return new Response("forbidden", { status: 403 });
    const [pub, priv] = await Promise.all([cfg("vapid_public"), cfg("vapid_private")]);
    if (!pub || !priv) return Response.json({ error: "no_vapid" });
    webpush.setVapidDetails(Deno.env.get("SUPABASE_URL")!, pub, priv);
    const now = new Date(Date.now() + 5 * 3600e3), h = body.hour ?? now.getUTCHours(), day = now.toISOString().slice(0, 10);
    const { data: subs } = await db.from("fit_push_subs").select("*");
    const by: Record<string, any[]> = {};
    for (const s of subs || []) (by[s.user_id] ??= []).push(s);
    let sent = 0;
    for (const [uid, list] of Object.entries(by)) {
      const pr = list[0].prefs || {}, msgs: Record<string, string>[] = [];
      if (pr.protein != null && +pr.protein === h) {
        const [{ data: p }, { data: f }] = await Promise.all([
          db.from("fit_profiles").select("data").eq("user_id", uid).maybeSingle(),
          db.from("fit_food_log").select("p").eq("user_id", uid).eq("d", day),
        ]);
        const w = +p?.data?.weight || 75, g = p?.data?.goal || "keep", tg = Math.round(w * (g === "cut" ? 2.2 : g === "bulk" ? 1.8 : 2));
        const got = (f || []).reduce((a: number, x: any) => a + +x.p, 0);
        if (got < tg * 0.8) msgs.push({ title: `Белок: ${Math.round(got)} из ${tg} г`, body: `Не хватает ${Math.round(tg - got)} г. Творог, курица или яйца закроют норму.`, tag: "fit-protein" });
      }
      if (pr.train != null && +pr.train === h) {
        const { data: w } = await db.from("fit_workouts").select("started_at").eq("user_id", uid).order("started_at", { ascending: false }).limit(1).maybeSingle();
        const days = w ? (Date.now() - new Date(w.started_at).getTime()) / 864e5 : 99;
        if (days >= (+pr.gap || 3) && days < 60) msgs.push({ title: "Мышцы восстановились", body: `Последняя тренировка ${Math.floor(days)} дн назад. Герой ждёт - пора в зал.`, tag: "fit-train" });
      }
      for (const m of msgs) for (const s of list) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...m, url: "/fit/" }), { TTL: 3600 }); sent++; await db.from("fit_push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint); }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("fit_push_subs").delete().eq("endpoint", s.endpoint); }
      }
    }
    return Response.json({ sent, h });
  } catch (e) { return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 }); }
});
