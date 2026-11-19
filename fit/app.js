let S_PUSH;
// Superhero - фитнес-РПГ. Главный модуль: данные, экраны, логика тренировок, питания и ИИ-тренера.
import { createClient } from '@supabase/supabase-js';
import { createBody, MUSCLES } from './body3d.js?v=4';

const SB_URL = 'https://nctmbakzbzzkygndaklr.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdG1iYWt6Ynp6a3lnbmRha2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTAxNDQsImV4cCI6MjEwNjY4NjE0NH0.Bg8pBWWaVWsMhdiPBqIwoU2Rx_DkaWpYllj6SpHGnig';
const DEMO = new URLSearchParams(location.search).has('demo');
const sb = DEMO ? null : createClient(SB_URL, SB_KEY);

// ---------- справочники ----------
const MN = { neck: 'Шея', chest_up: 'Верх груди', chest: 'Грудь', delt_f: 'Передняя дельта', delt_m: 'Средняя дельта', delt_r: 'Задняя дельта', biceps: 'Бицепс', triceps: 'Трицепс', forearm: 'Предплечья', abs: 'Пресс', obliques: 'Косые', serratus: 'Зубчатая', traps: 'Трапеция', midback: 'Середина спины', lats: 'Широчайшие', lowback: 'Поясница', glutes: 'Ягодицы', glute_med: 'Средняя ягодичная', quads: 'Квадрицепс', adductors: 'Приводящие', hams: 'Бицепс бедра', calves: 'Икры', tibialis: 'Голень спереди' };
const SMALL = new Set(['neck', 'delt_f', 'delt_m', 'delt_r', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'serratus', 'calves', 'tibialis', 'glute_med']);
const MINOR = new Set(['neck', 'serratus', 'tibialis', 'glute_med', 'forearm', 'obliques', 'adductors']); // не ругаем за малый объём
const RANKS = ['Новичок', 'Боец', 'Воин', 'Герой', 'Супергерой', 'Легенда'];
const STD = { bench: [0.5, 0.75, 1, 1.25, 1.5, 1.75], squat: [0.75, 1, 1.25, 1.5, 2, 2.25], deadlift: [1, 1.25, 1.5, 2, 2.5, 2.75], ohp: [0.35, 0.5, 0.65, 0.8, 1, 1.15], row: [0.4, 0.6, 0.8, 1, 1.2, 1.4], pullup: [1, 1.15, 1.3, 1.45, 1.65, 1.85] };
const CALIB = ['bench', 'squat', 'deadlift', 'ohp', 'row', 'pullup'];
const MEALS = [['br', 'Завтрак'], ['lu', 'Обед'], ['di', 'Ужин'], ['sn', 'Перекус']];
let EX = {}, EXL = [], FOODS = [];

const lvlOf = x => Math.max(1, Math.floor(Math.pow(Math.max(0, x) / 40, 1 / 1.6)));
const xpFor = n => 40 * Math.pow(n, 1.6);
const LVC = [[50, '#ff4d2e', '#ffb020'], [40, '#ffb020', '#ffd36a'], [30, '#a45bff', '#c79bff'], [20, '#3d8bff', '#8fbcff'], [10, '#3ddc84', '#9ff0c4'], [0, '#4f566b', '#7d8499']];
const lvColor = l => LVC.find(x => l >= x[0]);
const RARITY = l => l >= 50 ? 'Легендарный' : l >= 40 ? 'Золотой' : l >= 30 ? 'Эпический' : l >= 20 ? 'Редкий' : l >= 10 ? 'Прокачанный' : 'Обычный';

// ---------- утилиты ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 0) => (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString('ru-RU');
const r1 = n => Math.round(n * 10) / 10;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c == 'x' ? r : (r & 3 | 8)).toString(16); });
const dkey = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dkey(d); };
const ago = t => { const h = (Date.now() - new Date(t)) / 36e5; if (h < 1) return 'только что'; if (h < 24) return `${Math.round(h)} ч назад`; const d = Math.round(h / 24); return d == 1 ? 'вчера' : `${d} дн назад`; };
const fdate = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const LS = { get(k, d) { try { const v = localStorage.getItem('sh_' + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('sh_' + k, JSON.stringify(v)); } catch { } } };
const vib = p => { try { if (window.SHApp) SHApp.vibrate(Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p); else navigator.vibrate && navigator.vibrate(p); } catch { } };
const exName = id => EX[id]?.ru || id;
const e1rm = (w, r) => r > 0 && w > 0 ? w * (1 + Math.min(r, 15) / 30) : 0;

function toast(t, err) {
  const d = document.createElement('div'); d.className = 'toast pop' + (err ? ' e' : ''); d.textContent = t;
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = 0; d.style.transition = '.3s'; }, 2300); setTimeout(() => d.remove(), 2700);
}
const IC = {
  hero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2.5"/><path d="M5 9l7 1 7-1M12 10v5M9 22l3-7 3 7"/></svg>',
  dumb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>',
  food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2 1-3 4-3 8h3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  plate: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/></svg>',
  fire: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>',
  rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/></svg>'
};

// ---------- состояние ----------
S_PUSH = LS.get('push', null);
const S = {
  user: null, prof: null, stats: {}, recs: {}, works: [], sets: [], progs: [], food: [], body: [],
  tab: 'hero', mode: 'lvl', fdate: dkey(), pushOn: !!S_PUSH, pushPrefs: S_PUSH, w: LS.get('w', null), rest: null, chat: LS.get('chat', []), q: LS.get('q', []), body3d: null
};
const P = () => S.prof?.data || {};
const bw = () => +P().weight || 75;

// ---------- данные: сервер ----------
const DB = {
  async load() {
    if (DEMO) return demoLoad();
    const since = new Date(Date.now() - 70 * 864e5).toISOString();
    const [p, ms, rc, ws, ss, pr, fd, bd] = await Promise.all([
      sb.from('fit_profiles').select('*').maybeSingle(),
      sb.from('fit_muscle_stats').select('muscle,xp,level,base'),
      sb.from('fit_records').select('*'),
      sb.from('fit_workouts').select('id,started_at,finished_at,name,xp,summary,note,program_id,day_idx').order('started_at', { ascending: false }).limit(80),
      sb.from('fit_sets').select('workout_id,ex,idx,w,reps,rir,kind,at,e1rm,xp,eff').gte('at', since).order('at').limit(5000),
      sb.from('fit_programs').select('*').eq('archived', false).order('created_at'),
      sb.from('fit_food_log').select('*').gte('d', addDays(dkey(), -40)).order('at'),
      sb.from('fit_body').select('*').order('d')
    ]);
    const err = [p, ms, rc, ws, ss, pr, fd, bd].find(x => x.error);
    if (err) throw err.error;
    S.prof = p.data || null;
    S.stats = Object.fromEntries((ms.data || []).map(x => [x.muscle, x]));
    S.recs = Object.fromEntries((rc.data || []).map(x => [x.ex, x]));
    S.works = ws.data || []; S.sets = ss.data || []; S.progs = pr.data || []; S.food = fd.data || []; S.body = bd.data || [];
    LS.set('cache', { prof: S.prof, stats: S.stats, recs: S.recs, works: S.works, sets: S.sets, progs: S.progs, food: S.food, body: S.body, at: Date.now() });
  },
  async saveProfile(data, nick) {
    if (DEMO) { S.prof.data = data; return; }
    const { error } = await sb.from('fit_profiles').upsert({ user_id: S.user.id, data, nick: nick ?? S.prof?.nick ?? null });
    if (error) throw error;
    const r = await sb.rpc('fit_recalc_me'); if (r.error) throw r.error;
    S.prof = r.data;
    await DB.load();
  },
  async saveWorkout(w) {
    if (DEMO) return demoSave(w);
    const { data, error } = await sb.rpc('fit_save_workout', { p: w });
    if (error) throw error;
    return data;
  },
  async delWorkout(id) { if (DEMO) { S.works = S.works.filter(x => x.id != id); return; } const { error } = await sb.rpc('fit_delete_workout', { p_id: id }); if (error) throw error; await DB.load(); },
  async addFood(rows) {
    rows = rows.map(r => ({ ...r, id: r.id || uuid(), d: r.d || S.fdate, at: new Date().toISOString() }));
    if (!DEMO) { const { error } = await sb.from('fit_food_log').insert(rows.map(r => ({ id: r.id, d: r.d, meal: r.meal, name: r.name, g: r.g, kcal: r.kcal, p: r.p, f: r.f, c: r.c, s: r.s || 0, gi: r.gi || 0, src: r.src, food_id: r.food_id }))); if (error) throw error; }
    S.food.push(...rows);
  },
  async delFood(id) { if (!DEMO) { const { error } = await sb.from('fit_food_log').delete().eq('id', id); if (error) throw error; } S.food = S.food.filter(x => x.id != id); },
  async saveBody(row) {
    if (!DEMO) { const { data, error } = await sb.from('fit_body').upsert({ ...row, user_id: S.user.id }, { onConflict: 'user_id,d' }).select().single(); if (error) throw error; row = data; }
    S.body = S.body.filter(x => x.d != row.d).concat(row).sort((a, b) => a.d < b.d ? -1 : 1);
  },
  async saveProg(pr) {
    if (DEMO) { pr.id = pr.id || uuid(); S.progs = S.progs.filter(x => x.id != pr.id).concat(pr); return; }
    const row = { name: pr.name, days: pr.days, archived: !!pr.archived };
    const r = pr.id ? await sb.from('fit_programs').update(row).eq('id', pr.id).select().single() : await sb.from('fit_programs').insert(row).select().single();
    if (r.error) throw r.error;
    S.progs = S.progs.filter(x => x.id != r.data.id); if (!r.data.archived) S.progs.push(r.data);
  },
  async ai(body) {
    if (DEMO) return { ok: true, text: 'Это демо-режим. Войди в аккаунт, и я отвечу по твоим реальным данным.', items: [] };
    const { data, error } = await sb.functions.invoke('fit-ai', { body });
    if (error) { let j = null; try { j = await error.context?.json(); } catch { } if (j?.error == 'limit') throw new Error('На сегодня лимит ИИ исчерпан (20 запросов). Завтра снова в строю.'); throw new Error('ИИ сейчас недоступен, попробуй позже'); }
    return data;
  },
  async kbju(body) {
    if (DEMO) return { ok: true, food: true, title: 'Демо', items: [{ name: 'Плов', g: 350, kcal: 600, p: 20, f: 25, c: 70 }] };
    const { data, error } = await sb.functions.invoke('kbju', { body: { ...body, lang: 'ru' } });
    if (error) { let j = null; try { j = await error.context?.json(); } catch { } throw new Error(j?.error == 'limit' ? 'Лимит распознаваний на сегодня исчерпан' : 'Не получилось распознать, попробуй ещё раз'); }
    return data;
  }
};

// очередь тренировок без интернета
async function flushQ() {
  if (DEMO || !S.q.length || !navigator.onLine) return;
  const left = [];
  for (const w of S.q) { try { await DB.saveWorkout(w); } catch (e) { if (!navigator.onLine) left.push(w); else console.warn(e); } }
  S.q = left; LS.set('q', left);
  if (!left.length) { await DB.load().catch(() => { }); toast('Тренировки без интернета отправлены'); render(); }
}
addEventListener('online', flushQ);

// ---------- расчёты ----------
function recentSets(days) { const t = Date.now() - days * 864e5; return S.sets.filter(s => new Date(s.at) >= t); }
function isEff(s) { return s.kind != 'warm' && s.reps >= 1 && s.reps <= 40 && (s.rir == null || s.rir <= 4); }
// подходы за неделю по мышцам (вспомогательные считаются частично)
function weekly() {
  const o = Object.fromEntries(MUSCLES.map(m => [m, 0]));
  for (const s of recentSets(7)) if (isEff(s)) { const m = EX[s.ex]?.m || {}; for (const k in m) o[k] = (o[k] || 0) + (m[k] >= 1 ? 1 : m[k]); }
  return o;
}
// восстановление 0..100
function recovery() {
  const F = Object.fromEntries(MUSCLES.map(m => [m, 0])), now = Date.now(), last = {};
  for (const s of recentSets(8)) if (isEff(s)) {
    const m = EX[s.ex]?.m || {}, h = (now - new Date(s.at)) / 36e5;
    for (const k in m) { const hl = SMALL.has(k) ? 16 : 24; F[k] += m[k] * Math.pow(0.5, h / hl); if (m[k] >= 0.5) last[k] = Math.max(last[k] || 0, new Date(s.at).getTime()); }
  }
  const R = {}; for (const m of MUSCLES) R[m] = Math.round(Math.max(0, 1 - F[m] / 6) * 100);
  return { R, last };
}
function levels() { const o = {}; for (const m of MUSCLES) o[m] = S.stats[m]?.level || 1; return o; }
function heroLevel() { return lvlOf((S.prof?.xp || 0) / 14); }
function rankIdx() { return Math.max(0, Math.min(5, Math.floor(+S.prof?.rank || 0))); }
function stdRatio(ex, ratio) {
  const s = STD[ex]; if (!s || !ratio) return null;
  const f = P().sex == 'f' ? (['squat', 'deadlift'].includes(ex) ? 0.75 : ex == 'pullup' ? 0.85 : 0.6) : 1;
  if (ratio < s[0] * f) return 0;
  for (let i = 1; i < 6; i++) if (ratio < s[i] * f) return (i - 1) + (ratio - s[i - 1] * f) / ((s[i] - s[i - 1]) * f);
  return 5;
}
// отстающие мышцы
function lagging() {
  const wk = weekly(), lv = levels(), avg = MUSCLES.reduce((a, m) => a + lv[m], 0) / MUSCLES.length, out = [];
  const trained = S.works.length > 0;
  for (const m of MUSCLES) {
    if (MINOR.has(m)) continue;
    let sc = 0, why = '';
    if (trained && wk[m] < 6) { sc += (6 - wk[m]); why = `всего ${nf(wk[m], 1)} подх. за неделю`; }
    if (lv[m] < avg - 4) { sc += (avg - lv[m]) / 2; why = why || `уровень ${lv[m]} при среднем ${Math.round(avg)}`; }
    if (sc > 0) out.push({ m, sc, why });
  }
  // баланс жимов и тяг
  const push = wk.chest + wk.chest_up + wk.delt_f, pull = wk.lats + wk.midback + wk.delt_r;
  return { list: out.sort((a, b) => b.sc - a.sc), push, pull };
}
// история упражнения: последние тренировки
function exHistory(ex, n = 3) {
  const by = {};
  for (const s of S.sets) if (s.ex == ex && s.kind != 'warm') (by[s.workout_id] = by[s.workout_id] || []).push(s);
  return Object.values(by).sort((a, b) => new Date(b[0].at) - new Date(a[0].at)).slice(0, n);
}
const isCompound = ex => EX[ex]?.kind == 'compound';
const repRange = (ex, it) => it?.rmin ? [it.rmin, it.rmax] : isCompound(ex) ? [6, 10] : [10, 15];
// подсказка по весу (двойная прогрессия)
function suggest(ex, it) {
  const h = exHistory(ex, 2); if (!h.length) return null;
  const [lo, hi] = repRange(ex, it), last = h[0], step = EX[ex]?.step || 2.5;
  const topW = Math.max(...last.map(s => +s.w));
  const work = last.filter(s => +s.w >= topW - 0.01);
  if (work.length && work.every(s => s.reps >= hi) && step > 0) return { t: 'up', w: r1(topW + step), reps: lo, msg: `В прошлый раз все подходы по ${hi}+. Пора +${nf(step, 1)} кг: ${nf(topW + step, 1)} кг на ${lo}.` };
  if (h.length > 1) {
    const prevTop = Math.max(...h[1].map(s => +s.w));
    if (work.every(s => s.reps < lo) && h[1].filter(s => +s.w >= prevTop - 0.01).every(s => s.reps < lo) && topW > 0)
      return { t: 'dn', w: r1(Math.round(topW * 0.92 / 2.5) * 2.5), reps: lo, msg: `Две тренировки не дотягиваешь до ${lo} повторов. Сбрось вес до ${nf(Math.round(topW * 0.92 / 2.5) * 2.5, 1)} кг и проверь сон и еду.` };
  }
  return { t: 'keep', w: topW, reps: Math.max(...work.map(s => s.reps)), msg: `Прошлый раз: ${work.map(s => `${nf(s.w, 1)}×${s.reps}`).join(', ')}. Добей ${hi} повторов во всех подходах - и вес вверх.` };
}
// разгрузка: падение силы 3 тренировки подряд
function needDeload() {
  const ex = Object.keys(S.recs).sort((a, b) => S.sets.filter(s => s.ex == b).length - S.sets.filter(s => s.ex == a).length).slice(0, 4);
  let down = 0;
  for (const e of ex) {
    const h = exHistory(e, 4).map(ss => Math.max(...ss.map(s => +s.e1rm || e1rm(+s.w, s.reps)))).reverse();
    if (h.length >= 4 && h[1] < h[0] && h[2] < h[1] && h[3] < h[2]) down++;
  }
  return down >= 2;
}
// питание
function age() { return P().by ? new Date().getFullYear() - P().by : 25; }
function targets() {
  const d = P(), w = bw(), h = +d.height || 175, sex = d.sex == 'f' ? -161 : 5;
  const bmr = 10 * w + 6.25 * h - 5 * age() + sex;
  const days = +d.days || 3, act = days <= 1 ? 1.3 : days <= 3 ? 1.45 : days <= 5 ? 1.6 : 1.75;
  let tdee = bmr * act, src = 'formula';
  const ad = adaptive(); if (ad) { tdee = ad.tdee; src = 'real'; }
  const g = d.goal || 'keep';
  const kcal = g == 'cut' ? tdee - Math.min(700, tdee * 0.2) : g == 'bulk' ? tdee * 1.1 : tdee;
  const p = w * (g == 'cut' ? 2.2 : g == 'bulk' ? 1.8 : 2), f = w * 0.9, c = Math.max(50, (kcal - p * 4 - f * 9) / 4);
  return { kcal: Math.round(kcal), p: Math.round(p), f: Math.round(f), c: Math.round(c), tdee: Math.round(tdee), bmr: Math.round(bmr), src, ad };
}
// тренд веса (сглаженный)
function trend() {
  if (!S.body.filter(b => b.weight).length) return [];
  const pts = S.body.filter(b => b.weight).map(b => ({ d: b.d, w: +b.weight }));
  const out = []; let e = pts[0].w, k = pts[0].d, i = 0;
  while (k <= pts[pts.length - 1].d) {
    if (pts[i] && pts[i].d == k) { e = e + 0.15 * (pts[i].w - e); out.push({ d: k, w: pts[i].w, t: e }); i++; } else out.push({ d: k, w: null, t: e });
    k = addDays(k, 1);
  }
  out[0].t = pts[0].w; return out;
}
function adaptive() {
  const tr = trend(); if (tr.length < 15) return null;
  const end = tr[tr.length - 1], st = tr[Math.max(0, tr.length - 22)], days = tr.length - 1 - Math.max(0, tr.length - 22);
  const ks = []; for (let k = st.d; k <= end.d; k = addDays(k, 1)) { const s = S.food.filter(f => f.d == k).reduce((a, f) => a + +f.kcal, 0); if (s > 600) ks.push(s); }
  if (ks.length < days * 0.6) return null;
  const avg = ks.reduce((a, b) => a + b, 0) / ks.length;
  return { tdee: avg - (end.t - st.t) * 7700 / days, avg, rate: (end.t - st.t) / days * 7 };
}
function forecast() {
  const tr = trend(), tw = +P().tw; if (tr.length < 10 || !tw) return null;
  const end = tr[tr.length - 1], st = tr[Math.max(0, tr.length - 15)], days = tr.length - 1 - Math.max(0, tr.length - 15);
  const rate = (end.t - st.t) / days; // кг в день
  const left = tw - end.t;
  if (Math.abs(left) < 0.3) return { done: true };
  if (!rate || Math.sign(rate) != Math.sign(left)) return { wrong: true, rate: rate * 7 };
  const n = Math.round(left / rate); if (n > 730) return { slow: true, rate: rate * 7 };
  return { date: addDays(dkey(), n), rate: rate * 7 };
}
function dayFood(k = S.fdate) { const L = S.food.filter(f => f.d == k); const t = L.reduce((a, f) => ({ kcal: a.kcal + +f.kcal, p: a.p + +f.p, f: a.f + +f.f, c: a.c + +f.c }), { kcal: 0, p: 0, f: 0, c: 0 }); return { L, t }; }

// ---------- сахар и гликемический индекс ----------
// окна тренировок дня: за час до начала и 2 часа после конца - быстрые углеводы уходят в гликоген мышц
function trainWin(k) {
  const out = S.works.filter(w => dkey(w.started_at) == k).map(w => { const a = new Date(w.started_at).getTime(), b = w.finished_at ? new Date(w.finished_at).getTime() : a + 90 * 6e4; return [a - 60 * 6e4, b + 120 * 6e4]; });
  if (S.w && dkey(S.w.started_at) == k) { const a = new Date(S.w.started_at).getTime(); out.push([a - 60 * 6e4, Date.now() + 120 * 6e4]); }
  return out;
}
function sugarDest(f, win) {
  const c = +f.c || 0, gi = +f.gi || 0; if (c < 5 || !gi) return null;
  const t = new Date(f.at || Date.now()).getTime();
  if (win.some(([a, b]) => t >= a && t <= b)) return ['mu2', '💪 в мышцы'];
  if (gi >= 70) return ['bl', '⚡ в кровь'];
  if (gi >= 55) return ['md', 'средне'];
  return ['sl', 'плавно'];
}
function sugarDay(k = S.fdate) {
  const { L } = dayFood(k), win = trainWin(k), tg = targets();
  let su = 0, gl = 0, mus = 0, blood = 0;
  for (const f of L) { const fs = +f.s || 0; su += fs; gl += (+f.gi || 0) * (+f.c || 0) / 100; const d = sugarDest(f, win); if (d?.[0] == 'mu2') mus += fs; else if (d?.[0] == 'bl') blood += fs; }
  const extra = win.length ? 0.3 * bw() : 0;
  return { su, gl, mus, blood, train: win.length > 0, norm: Math.round(tg.kcal * 0.1 / 4 + extra), ideal: Math.round(tg.kcal * 0.05 / 4 + extra), extra: Math.round(extra) };
}
function findFood(name) {
  const q = String(name || '').toLowerCase().trim(); if (q.length < 3) return null;
  const w = q.split(/[\s,(]+/)[0];
  return FOODS.find(f => f.ru.toLowerCase() == q) || FOODS.find(f => f.ru.toLowerCase().startsWith(q)) || FOODS.find(f => w.length > 3 && f.ru.toLowerCase().startsWith(w)) || null;
}
// сахар и ГИ для блюда, которое распознал ИИ: берём из базы похожего продукта, иначе осторожная оценка
function guessSG(name, c, g) { const m = findFood(name); if (m && m.c > 0) return { s: r1(Math.min(c, m.s * c / m.c)), gi: m.gi || 0 }; return { s: r1(c * 0.25), gi: c >= 5 ? 55 : 0 }; }
function sugarCard() {
  const d = sugarDay(), pct = d.su / Math.max(1, d.norm) * 100;
  const glL = d.gl < 80 ? ['низкая', 'var(--grn)'] : d.gl <= 120 ? ['средняя', 'var(--gold)'] : ['высокая', 'var(--red)'];
  let tip;
  if (!d.su) tip = 'Сахара сегодня пока нет. Фрукты и молочка тоже содержат сахар - это нормально.';
  else if (d.blood > d.norm * 0.5) tip = `${nf(d.blood)} г сахара ушло «в кровь»: быстрые углеводы вне тренировки дают скачок сахара и инсулина, лишнее легче уходит в жир. Переноси сладкое ближе к тренировке.`;
  else if (d.train && d.mus > 0) tip = `${nf(d.mus)} г сахара пришлось на окно тренировки - они пошли на восполнение гликогена в мышцах. Так и надо.`;
  else if (pct > 100) tip = 'Сахар выше нормы. Замени сладкое на фрукты или съешь его после тренировки.';
  else tip = d.train ? `Сегодня тренировка: норма выше на ${d.extra} г. Лучшее время для быстрых углеводов - за час до и 2 часа после.` : 'День без тренировки: держи сахар ближе к идеальной планке, быстрые углеводы сейчас мышцам не нужны.';
  return `<div class="card"><div class="row"><h3 class="sp">Сахар</h3><button class="b s g" style="height:26px;padding:0 8px" data-a="howSugar">как считаем</button></div>
    <div class="row" style="align-items:flex-end"><div class="big" style="font-size:30px" data-cnt="${Math.round(d.su)}">${nf(d.su)}</div><div class="mu sm" style="margin-bottom:6px">из ${d.norm} г${d.train ? ' · день тренировки' : ''}</div></div>
    <div class="bar" style="margin:8px 0"><i style="width:${Math.min(100, pct)}%;background:${pct > 100 ? 'var(--red)' : pct > 70 ? 'var(--gold)' : 'var(--grn)'}"></i></div>
    <div class="grid2"><div class="stat"><b style="color:#7fe8ad">${nf(d.mus)} г</b><span>💪 в мышцы</span></div><div class="stat"><b style="color:#ff9a9a">${nf(d.blood)} г</b><span>⚡ в кровь</span></div></div>
    <div class="xs mu" style="margin-top:8px">Гликемическая нагрузка дня: <b style="color:${glL[1]}">${nf(d.gl)} - ${glL[0]}</b></div>
    <div class="hint ${d.blood > d.norm * 0.5 || pct > 100 ? 'dn' : 'up'}" style="margin-top:8px">${esc(tip)}</div></div>`;
}

// ---------- квесты недели ----------
function weekStart() { const d = new Date(); const dd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dd); return dkey(d); }
function quests() {
  const ws = weekStart(), n = S.works.filter(w => dkey(w.started_at) >= ws).length, plan = +P().days || 3;
  const lag = lagging().list[0];
  const setsLag = lag ? S.sets.filter(s => dkey(s.at) >= ws && isEff(s) && (EX[s.ex]?.m?.[lag.m] || 0) >= 0.5).length : 0;
  const tg = targets(); let pd = 0; for (let k = ws; k <= dkey(); k = addDays(k, 1)) if (dayFood(k).t.p >= tg.p * 0.9) pd++;
  const prs = S.works.filter(w => dkey(w.started_at) >= ws).reduce((a, w) => a + (w.summary?.prs?.length || 0), 0);
  return [
    { i: '🏋️', t: `Проведи ${plan} тренировки`, v: n, max: plan },
    lag ? { i: '🎯', t: `Подтяни отстающую: ${MN[lag.m]} - 8 подходов`, v: setsLag, max: 8 } : { i: '🎯', t: 'Поставь личный рекорд', v: prs, max: 1 },
    { i: '🥩', t: 'Белок в норме 4 дня', v: pd, max: 4 }
  ];
}

// ---------- шаблоны программ ----------
const TPL = [
  { name: 'Фулбади 3 дня', days: [
    { name: 'День A', items: [['squat', 3, 6, 10], ['bench', 3, 6, 10], ['row', 3, 8, 12], ['lateral_raise', 3, 12, 15], ['ez_curl', 2, 10, 12]] },
    { name: 'День B', items: [['deadlift', 3, 5, 8], ['ohp', 3, 6, 10], ['lat_pulldown', 3, 8, 12], ['leg_curl_lying', 3, 10, 15], ['pushdown_rope', 2, 10, 15]] },
    { name: 'День C', items: [['leg_press', 3, 8, 12], ['db_incline', 3, 8, 12], ['seated_row', 3, 8, 12], ['face_pull', 3, 12, 15], ['hanging_leg_raise', 3, 10, 15]] }] },
  { name: 'Верх-низ 4 дня', days: [
    { name: 'Верх 1', items: [['bench', 4, 6, 8], ['row', 4, 6, 10], ['ohp', 3, 8, 10], ['pullup', 3, 6, 10], ['lateral_raise', 3, 12, 15], ['barbell_curl', 3, 8, 12]] },
    { name: 'Низ 1', items: [['squat', 4, 5, 8], ['rdl', 3, 8, 10], ['leg_press', 3, 10, 12], ['leg_curl_seated', 3, 10, 15], ['calf_standing', 4, 10, 15]] },
    { name: 'Верх 2', items: [['db_incline', 4, 8, 12], ['lat_pulldown', 4, 8, 12], ['db_ohp', 3, 8, 12], ['chest_supported_row', 3, 10, 12], ['french_press', 3, 10, 12], ['hammer_curl', 3, 10, 12]] },
    { name: 'Низ 2', items: [['deadlift', 3, 4, 6], ['bulgarian', 3, 8, 12], ['leg_extension', 3, 12, 15], ['hip_thrust', 3, 8, 12], ['calf_seated', 4, 12, 15], ['cable_crunch', 3, 12, 15]] }] },
  { name: 'Жим-тяга-ноги', days: [
    { name: 'Жим', items: [['bench', 4, 6, 10], ['incline_bench', 3, 8, 12], ['ohp', 3, 8, 10], ['lateral_raise', 4, 12, 15], ['pushdown_rope', 3, 10, 15], ['dips', 2, 8, 12]] },
    { name: 'Тяга', items: [['deadlift', 3, 4, 6], ['pullup', 4, 6, 10], ['row', 3, 8, 12], ['face_pull', 3, 12, 15], ['barbell_curl', 3, 8, 12], ['hammer_curl', 2, 10, 12]] },
    { name: 'Ноги', items: [['squat', 4, 6, 8], ['rdl', 3, 8, 10], ['leg_press', 3, 10, 12], ['leg_curl_lying', 3, 10, 15], ['calf_standing', 4, 10, 15], ['hanging_leg_raise', 3, 10, 15]] }] }
];
const tplToProg = t => ({ name: t.name, days: t.days.map(d => ({ name: d.name, items: d.items.filter(([e]) => EX[e]).map(([ex, sets, rmin, rmax]) => ({ ex, sets, rmin, rmax })) })) });

// плавный счёт чисел (data-cnt)
function countUp(root) {
  root.querySelectorAll('[data-cnt]').forEach(el => {
    const to = +el.dataset.cnt, pre = el.dataset.pre || '', post = el.dataset.post || '', t0 = performance.now(), D = 900;
    const st = () => { const k = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + nf(to * e) + post; if (k < 1) requestAnimationFrame(st); };
    st();
  });
}
// ---------- шторка ----------
let sheetOnClose = null;
function sheet(html, onClose) {
  closeSheet(true);
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sbg';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.id = 'sh';
  sh.innerHTML = `<div class="grab"></div>${html}`;
  bg.onclick = () => closeSheet();
  document.body.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('on'); sh.classList.add('on'); });
  sheetOnClose = onClose || null;
  let y0 = null, dy = 0, t0 = 0;
  sh.addEventListener('touchstart', e => { if (sh.scrollTop > 0 || e.target.closest('input,textarea,select,canvas')) return; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { sh.classList.add('drag'); sh.style.transform = `translateY(${dy}px)`; bg.style.opacity = Math.max(0.2, 1 - dy / 400); } }, { passive: true });
  sh.addEventListener('touchend', () => { if (y0 == null) return; const v = dy / Math.max(1, Date.now() - t0); y0 = null; sh.classList.remove('drag'); sh.style.transform = ''; bg.style.opacity = ''; if (dy > 120 || v > 0.6 && dy > 30) closeSheet(); });
  setTimeout(() => countUp(sh), 120);
  return sh;
}
function closeSheet(instant) {
  const bg = $('#sbg'), sh = $('#sh'); if (!sh) return;
  const cb = sheetOnClose; sheetOnClose = null;
  if (instant) { bg.remove(); sh.remove(); } else { bg.classList.remove('on'); sh.classList.remove('on'); setTimeout(() => { bg.remove(); sh.remove(); }, 250); }
  cb && cb();
}

// ---------- навигация ----------
const TABS = [['hero', 'Герой', IC.hero], ['train', 'Тренировка', IC.dumb], ['food', 'Питание', IC.food], ['prog', 'Прогресс', IC.chart], ['coach', 'Тренер', IC.ai]];
function nav() {
  const n = $('#nav'); n.classList.remove('hide');
  if (!n.querySelector('.pill')) n.innerHTML = `<div><i class="pill"></i>${TABS.map(([k, l, i]) => `<button data-a="tab" data-k="${k}">${i}<span>${l}</span></button>`).join('')}</div>`;
  const idx = TABS.findIndex(t => t[0] == S.tab), pill = n.querySelector('.pill'), bt = n.querySelectorAll('button');
  bt.forEach((b, i) => { const k = TABS[i][0]; b.classList.toggle('on', k == S.tab); b.classList.toggle('w', k == 'train' && !!S.w && S.tab == 'train'); b.querySelector('span').textContent = k == 'train' && S.w ? 'Идёт' : TABS[i][1]; });
  const b = bt[idx]; if (b) { pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft - 6}px)`; }
  pill.classList.toggle('w', S.tab == 'train' && !!S.w);
}
addEventListener('resize', () => { if (!$('#nav').classList.contains('hide')) nav(); });
function render() {
  if (S.body3d && S.tab != 'hero') { S.body3d.dispose(); S.body3d = null; }
  const app = $('#app');
  if (!S.user && !DEMO) { $('#nav').classList.add('hide'); app.innerHTML = authHtml(); tgPrep(); return; }
  if (!P().weight) { $('#nav').classList.add('hide'); app.innerHTML = obHtml(); return; }
  nav();
  const f = { hero: heroHtml, train: trainHtml, food: foodHtml, prog: progHtml, coach: coachHtml }[S.tab];
  app.innerHTML = f() + (S.q.length ? `<div class="off">Ждут отправки: ${S.q.length}. Отправлю, когда появится интернет</div>` : '');
  app.classList.remove('enter-r', 'enter-l');
  if (S.anim) { void app.offsetWidth; app.classList.add(S.anim); countUp(app); S.anim = null; }
  S.justDone = null;
  if (S.tab == 'hero') mountBody();
  if (S.tab == 'coach') { const c = $('#chatEnd'); c && c.scrollIntoView(); }
}

// ---------- ЭКРАН: ГЕРОЙ ----------
function heroHtml() {
  const hl = heroLevel(), xp = (S.prof?.xp || 0) / 14, a = xpFor(hl), b = xpFor(hl + 1), pct = Math.max(0, Math.min(100, (xp - a) / (b - a) * 100));
  const rk = rankIdx(), { R } = recovery(), ready = MUSCLES.filter(m => !MINOR.has(m) && R[m] >= 85);
  const lag = lagging().list.slice(0, 3), tg = targets(), df = dayFood(dkey()).t, q = quests();
  const legend = S.mode == 'lvl' ? [['#4f566b', '1-9'], ['#3ddc84', '10-19'], ['#3d8bff', '20-29'], ['#a45bff', '30-39'], ['#ffb020', '40-49'], ['#ff4d2e', '50+']]
    : S.mode == 'rec' ? [['#ff4d4d', 'устала'], ['#ffc107', 'восстанавливается'], ['#3ddc84', 'готова']]
      : [['#2a2f42', '0'], ['#5a7bd6', '1-5'], ['#3d8bff', '6-9'], ['#3ddc84', '10-20'], ['#ff7a2a', '20+']];
  return `<div class="stage" id="stage"><div class="ov">
    <div class="lvb"><div class="lvc" style="--p:${pct}"><b>${hl}</b></div><div><div class="rk">${RANKS[rk]}</div><div class="hd" style="font-size:16px">${esc(S.prof?.nick || 'Герой')}</div><div class="xs mu">${nf(xp)} / ${nf(b)} опыта</div></div></div>
    <div class="side"><button class="ib" data-a="settings">${IC.gear}</button><button class="ib" data-a="view">${IC.rot}</button><button class="ib" data-a="shareCard">${IC.share}</button></div>
    <div class="leg">${legend.map(([c, t]) => `<div><i style="background:${c}"></i>${t}</div>`).join('')}</div>
    <div class="modes chips">${[['lvl', 'Уровень'], ['rec', 'Восстановление'], ['vol', 'Объём недели']].map(([k, l]) => `<button class="chip ${S.mode == k ? 'on' : ''}" data-a="mode" data-k="${k}">${l}</button>`).join('')}</div>
  </div></div>
  <div class="xs mu" style="text-align:center;margin-top:-2px">Крути героя пальцем, нажми на мышцу</div>
  ${S.w ? `<button class="b p w" style="margin-top:12px" data-a="tab" data-k="train">${IC.dumb} Вернуться к тренировке</button>` : `<button class="b p w" style="margin-top:12px" data-a="dayWorkout">${IC.fire} Тренировка дня</button>`}
  <div class="grid2" style="margin-top:10px">
    <div class="stat" data-a="tab" data-k="food"><b>${nf(df.kcal)}<span style="font:600 13px Manrope;color:var(--mu)"> / ${nf(tg.kcal)}</span></b><span>ккал сегодня</span><div class="bar gold" style="margin-top:8px"><i style="width:${Math.min(100, df.kcal / tg.kcal * 100)}%"></i></div></div>
    <div class="stat" data-a="tab" data-k="food"><b>${nf(df.p)}<span style="font:600 13px Manrope;color:var(--mu)"> / ${tg.p} г</span></b><span>белок</span><div class="bar grn" style="margin-top:8px"><i style="width:${Math.min(100, df.p / tg.p * 100)}%"></i></div></div>
  </div>
  <div class="card"><h3>Готовы к работе</h3>${ready.length ? `<div class="chips" style="flex-wrap:wrap">${ready.map(m => `<button class="chip" data-a="muscle" data-k="${m}">${MN[m]}</button>`).join('')}</div>` : '<div class="mu sm">Все крупные мышцы ещё восстанавливаются. Отдых - тоже прокачка.</div>'}</div>
  ${lag.length ? `<div class="card"><h3>Отстают</h3>${lag.map(l => `<div class="li" data-a="muscle" data-k="${l.m}"><span class="dot" style="background:var(--org)"></span><div class="sp"><b>${MN[l.m]}</b><div class="xs mu">${esc(l.why)}</div></div>${IC.fwd}</div>`).join('')}</div>` : ''}
  <div class="card"><div class="row"><h3 class="sp">Квесты недели</h3><span class="tag">до воскресенья</span></div>${q.map(x => `<div class="quest"><div class="qi">${x.i}</div><div class="sp"><div class="sm" style="font-weight:700">${esc(x.t)}</div><div class="bar ${x.v >= x.max ? 'grn' : 'gold'}" style="margin-top:6px"><i style="width:${Math.min(100, x.v / x.max * 100)}%"></i></div></div><b class="sm">${Math.min(x.v, x.max)}/${x.max}</b></div>`).join('')}</div>`;
}
function paintMap() {
  const map = {}, lv = levels();
  if (S.mode == 'lvl') for (const m of MUSCLES) { const c = lvColor(lv[m]); map[m] = { color: c[1], glowColor: c[2], glow: lv[m] >= 50 ? 1 : lv[m] >= 40 ? 0.55 : lv[m] >= 30 ? 0.25 : 0, emit: 0.14, wave: lv[m] >= 30 ? (lv[m] >= 50 ? 1 : 0.5) : 0 }; }
  else if (S.mode == 'rec') {
    const { R } = recovery();
    for (const m of MUSCLES) {
      const r = R[m] / 100, c = r < 0.5 ? mix('#ff4d4d', '#ffc107', r * 2) : mix('#ffc107', '#3ddc84', (r - 0.5) * 2);
      // красные бьются как сердце, жёлтые переливаются волной, зелёные спокойно дышат
      map[m] = r < 0.4 ? { color: c, emit: 0.22, glowColor: '#ff3b3b', pulse: { f: 1.15, a: 2.2, g: 0.9, beat: true } }
        : r < 0.8 ? { color: c, emit: 0.2, glowColor: '#ffc107', pulse: { f: 0.45, a: 1.1, g: 0.35 }, wave: 1 }
          : { color: c, emit: 0.18, glowColor: '#3ddc84', pulse: { f: 0.22, a: 0.8, g: 0.22 } };
    }
  }
  else { const wk = weekly(); for (const m of MUSCLES) { const v = wk[m]; map[m] = { color: v <= 0.01 ? '#2a2f42' : v < 6 ? '#5a7bd6' : v < 10 ? '#3d8bff' : v <= 20 ? '#3ddc84' : '#ff7a2a', emit: 0.16, glowColor: v > 20 ? '#ff7a2a' : '#3ddc84', pulse: v > 20 ? { f: 0.9, a: 1.4, g: 0.6 } : v >= 10 ? { f: 0.3, a: 0.6, g: 0.15 } : null }; } }
  return map;
}
function mix(a, b, k) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = i => Math.round(((pa >> i) & 255) * (1 - k) + ((pb >> i) & 255) * k); return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0'); }
function mountBody() {
  const el = $('#stage'); if (!el) return;
  try {
    if (S.body3d) S.body3d.dispose();
    S.body3d = createBody(el, { onPick: m => m && openMuscle(m) });
    S.body3d.paint(paintMap());
    if (S.flashAfter) { const list = S.flashAfter; S.flashAfter = null; list.forEach((m, i) => setTimeout(() => S.body3d?.flash(m), 300 + i * 250)); }
  } catch (e) { el.innerHTML = `<div class="empty">3D не запустилось на этом устройстве: ${esc(e.message)}</div>`; }
}
function openMuscle(m) {
  S.body3d?.select(m);
  const st = S.stats[m] || { xp: 0, level: 1 }, lv = st.level || 1, a = xpFor(lv), b = xpFor(lv + 1), pct = Math.max(0, Math.min(100, (st.xp - a) / (b - a) * 100));
  const { R, last } = recovery(), wk = weekly()[m], c = lvColor(lv);
  const best = EXL.filter(e => (e.m[m] || 0) >= 1).sort((x, y) => (S.recs[y.id] ? 1 : 0) - (S.recs[x.id] ? 1 : 0)).slice(0, 6);
  const myRecs = Object.values(S.recs).filter(r => (EX[r.ex]?.m?.[m] || 0) >= 1).sort((x, y) => y.e1rm - x.e1rm).slice(0, 3);
  let tip;
  if (R[m] < 60) tip = `Мышца ещё восстанавливается (${R[m]}%). Дай ей ${R[m] < 30 ? '1-2 дня' : 'день'}, качай другие.`;
  else if (!MINOR.has(m) && wk < 6) tip = `За неделю всего ${nf(wk, 1)} подх. Для роста нужно 10-20. Добавь 2-3 упражнения ниже.`;
  else if (wk > 20) tip = `${nf(wk, 1)} подходов за неделю - это много. Больше не всегда лучше: следи за восстановлением.`;
  else tip = 'Объём в норме. Повышай рабочий вес, когда добиваешь верх диапазона повторов.';
  sheet(`<div class="row"><h2 class="sp">${MN[m]}</h2><span class="tag" style="background:${c[1]}22;color:${c[2]}">${RARITY(lv)}</span></div>
    <div class="row" style="margin:12px 0 6px"><div class="big">${lv}</div><div class="sp"><div class="xs mu">уровень · ${nf(st.xp)} / ${nf(b)} опыта</div><div class="bar" style="margin-top:6px"><i style="width:${pct}%;background:${c[1]}"></i></div></div></div>
    <div class="grid2"><div class="stat"><b>${R[m]}%</b><span>восстановление</span></div><div class="stat"><b>${nf(wk, 1)}</b><span>подходов за 7 дней</span></div></div>
    <div class="hint" style="margin-top:10px">${esc(tip)}</div>
    <div class="xs mu" style="margin-top:6px">${last[m] ? 'Последний раз качал ' + ago(last[m]) : 'Ещё не качал в последние дни'}</div>
    ${myRecs.length ? `<h3 style="margin-top:14px">Твои рекорды</h3>${myRecs.map(r => `<div class="li"><div class="sp">${esc(exName(r.ex))}</div><b>${nf(r.w, 1)}×${r.reps}</b><span class="xs mu">≈${nf(r.e1rm)} кг</span></div>`).join('')}` : ''}
    <h3 style="margin-top:14px">Лучшие упражнения</h3>${best.map(e => `<div class="li"><button class="ib" style="width:34px;height:34px;flex:none" data-a="exInfo" data-k="${e.id}">ⓘ</button><div class="sp">${esc(e.ru)}</div>${S.w ? `<button class="b s" data-a="addEx" data-k="${e.id}">${IC.plus}</button>` : ''}</div>`).join('')}`,
    () => S.body3d?.select(null));
}

// ---------- ЭКРАН: ТРЕНИРОВКА ----------
function trainHtml() {
  if (S.w) return activeHtml();
  const hist = S.works.slice(0, 25);
  return `<div class="top"><h1>Тренировка</h1></div>
  ${logHtml()}${chatBar()}
  <button class="b p w" data-a="dayWorkout">${IC.fire} Тренировка дня</button>
  <div class="grid2" style="margin-top:10px"><button class="b" data-a="startEmpty">${IC.plus} Пустая</button><button class="b" data-a="textWorkout">Текстом</button></div>
  <div class="card"><div class="row"><h3 class="sp">Мои программы</h3><button class="b s" data-a="newProg">${IC.plus}</button></div>
    ${S.progs.length ? S.progs.map(p => `<div style="margin-top:10px"><div class="row"><b class="sp">${esc(p.name)}</b><button class="b s g" data-a="editProg" data-k="${p.id}">Изменить</button></div><div class="chips" style="margin-top:6px">${p.days.map((d, i) => `<button class="chip" data-a="startDay" data-k="${p.id}" data-i="${i}">▶ ${esc(d.name)}</button>`).join('')}</div></div>`).join('')
      : `<div class="mu sm" style="margin-bottom:8px">Выбери шаблон или собери свою программу с рабочими весами.</div>${TPL.map((t, i) => `<button class="opt" data-a="useTpl" data-k="${i}"><span class="e">📋</span><span class="sp"><b>${t.name}</b><div class="xs mu">${t.days.map(d => d.name).join(' · ')}</div></span>${IC.fwd}</button>`).join('')}`}
  </div>
  <div class="card"><h3>История</h3>${hist.length ? hist.map(w => `<div class="li" data-a="openWork" data-k="${w.id}"><div class="sp"><b>${esc(w.name || 'Тренировка')}</b><div class="xs mu">${fdate(w.started_at)} · ${S.sets.filter(s => s.workout_id == w.id && s.kind != 'warm').length || ''} подх.</div></div><span class="tag" style="color:var(--gold)">+${nf(w.xp)} XP</span></div>`).join('') : '<div class="empty">Пока пусто. Первая тренировка - первый уровень.</div>'}</div>`;
}
function chatBar() {
  return `<div class="wbar"><div class="row"><input class="in" id="wq" autocomplete="off" enterkeyhint="send" placeholder="${S.w ? 'Что сделал? «жим 80 на 8 три подхода»' : 'Напиши упражнение - тренировка начнётся'}" data-k13="wSend"><button class="b v" style="width:52px;padding:0;flex:none" data-a="wSend">➤</button></div></div>`;
}
function logHtml() {
  const L = (S.w?.log || []).slice(-3); if (!L.length) return `<div class="hint">💬 Пиши как в чате: «жим 80 на 8 три подхода», «присед 100 5х5», «подтягивания 10 8 7». Следующий подход того же упражнения - просто «85 на 6».</div>`;
  return `<div class="card" style="padding:10px 12px"><div class="chat">${L.map((m, i) => `<div class="msg u" style="font-size:14px">${esc(m.q)}</div><div class="msg a" style="font-size:13.5px">${esc(m.a)}${m.err && i == L.length - 1 && S.wPending?.sets?.length ? `<div class="chips" style="margin-top:8px;flex-wrap:wrap">${(m.sug || []).map(id => `<button class="chip" data-a="wSug" data-k="${id}">${esc(exName(id))}</button>`).join('')}<button class="chip" data-a="wPick">📋 Выбрать из списка</button></div>` : ''}${i == L.length - 1 && m.undo ? `<div style="margin-top:6px"><button class="b s g" style="height:28px;padding:0 8px" data-a="wUndo">↩ отменить</button></div>` : ''}</div>`).join('')}</div></div>`;
}
function activeHtml() {
  const w = S.w, min = Math.floor((Date.now() - new Date(w.started_at)) / 6e4);
  return `<div class="top"><div class="sp"><h1>${esc(w.name || 'Тренировка')}</h1><div class="xs mu" id="wtime">${min} мин · ${w.items.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0)} подходов</div></div><button class="ib" data-a="cancelW">${IC.x}</button></div>
  ${logHtml()}
  ${w.items.map((it, i) => exCard(it, i)).join('')}
  <div class="grid2"><button class="b" data-a="pickEx">${IC.plus} Упражнение</button><button class="b" data-a="textWorkout">Текстом / голосом</button></div>
  <button class="b p w" style="margin-top:12px" data-a="finishW">${IC.check} Завершить тренировку</button>${chatBar()}`;
}
function exCard(it, i) {
  const sg = it.sg, step = EX[it.ex]?.step || 2.5, isBw = (EX[it.ex]?.bw || 0) > 0;
  return `<div class="exc" id="ex${i}"><div class="hd2"><b data-a="exInfo" data-k="${it.ex}">${esc(exName(it.ex))} <span class="mu" style="font-size:13px">ⓘ</span></b>
    <button class="ib" style="width:34px;height:34px" data-a="swapEx" data-i="${i}">${IC.swap}</button>
    ${EX[it.ex]?.eq == 'barbell' ? `<button class="ib" style="width:34px;height:34px" data-a="plates" data-i="${i}">${IC.plate}</button>` : ''}
    <button class="ib" style="width:34px;height:34px" data-a="rmEx" data-i="${i}">${IC.x}</button></div>
    ${sg ? `<div class="hint ${sg.t}">${esc(sg.msg)}</div>` : ''}
    <div class="setr xs mu" style="margin:2px 0"><span></span><span style="text-align:center">${isBw ? 'доп. вес, кг' : 'вес, кг'}</span><span style="text-align:center">повторы</span><span></span></div>
    ${it.sets.map((s, j) => `<div class="setr ${s.done ? 'done' : ''}${S.justDone == i + '-' + j ? ' just' : ''}"><span class="n ${s.kind == 'warm' ? 'wu' : ''}">${s.kind == 'warm' ? 'РАЗМ' : it.sets.filter((x, k) => k <= j && x.kind != 'warm').length}</span>
      <div class="num"><button data-a="inc" data-i="${i}" data-j="${j}" data-f="w" data-d="-${step || 1}">−</button><input inputmode="decimal" value="${s.w ?? ''}" placeholder="${s.pw ?? '0'}" data-in="set" data-i="${i}" data-j="${j}" data-f="w"><button data-a="inc" data-i="${i}" data-j="${j}" data-f="w" data-d="${step || 1}">+</button></div>
      <div class="num"><button data-a="inc" data-i="${i}" data-j="${j}" data-f="reps" data-d="-1">−</button><input inputmode="numeric" value="${s.reps ?? ''}" placeholder="${s.pr ?? '0'}" data-in="set" data-i="${i}" data-j="${j}" data-f="reps"><button data-a="inc" data-i="${i}" data-j="${j}" data-f="reps" data-d="1">+</button></div>
      <button class="ok ${s.done ? 'on' : ''}" data-a="done" data-i="${i}" data-j="${j}">${IC.check}</button></div>`).join('')}
    <div class="row" style="margin-top:6px"><button class="b s" data-a="addSet" data-i="${i}">${IC.plus} Подход</button>${it.sets.some(s => s.kind == 'warm') || !isCompound(it.ex) || isBw ? '' : `<button class="b s g" data-a="warmup" data-i="${i}">Разминка</button>`}<span class="sp"></span><span class="xs mu">${repRange(it.ex, it).join('-')} повт.</span></div></div>`;
}
function newItem(ex, n = 3, rmin, rmax) {
  const it = { ex, rmin, rmax, sets: [] }, sg = suggest(ex, it), h = exHistory(ex, 1)[0];
  it.sg = sg;
  for (let k = 0; k < n; k++) {
    const prev = h?.[k] || h?.[h.length - 1];
    it.sets.push({ w: sg && sg.t != 'keep' ? sg.w : prev ? +prev.w : null, reps: null, pw: prev ? +prev.w : '', pr: sg && sg.t != 'keep' ? sg.reps : prev?.reps || (rmin || ''), kind: 'work' });
  }
  return it;
}
function startW(name, items, extra = {}) {
  S.w = { id: uuid(), started_at: new Date().toISOString(), name, items, ...extra };
  LS.set('w', S.w); S.tab = 'train'; render(); vib(20);
}
const saveW = () => LS.set('w', S.w);
function dayPlan() {
  const { R } = recovery(), lag = lagging().list.map(x => x.m), lv = levels();
  const groups = [['chest', 'chest_up'], ['lats', 'midback'], ['quads', 'glutes'], ['hams'], ['delt_m', 'delt_f'], ['delt_r'], ['biceps'], ['triceps'], ['calves'], ['abs']];
  const BIG = { chest: 4, lats: 4, quads: 4, hams: 2.5, delt_m: 1.5 };
  const score = g => { const r = Math.min(...g.map(m => R[m])); if (r < 75) return -1; return (BIG[g[0]] || 0) + (g.some(m => lag.includes(m)) ? 3 : 0) + (100 - Math.min(...g.map(m => lv[m]))) / 40 + r / 50; };
  const pick = groups.map(g => [g, score(g)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
  const fav = ex => (S.recs[ex] ? 3 : 0) + S.sets.filter(s => s.ex == ex).length / 10;
  const DEF = { chest: 'bench', chest_up: 'incline_bench', lats: 'lat_pulldown', midback: 'seated_row', quads: 'squat', glutes: 'hip_thrust', hams: 'rdl', delt_m: 'lateral_raise', delt_f: 'ohp', delt_r: 'face_pull', biceps: 'barbell_curl', triceps: 'pushdown_rope', calves: 'calf_standing', abs: 'hanging_leg_raise' };
  const items = [];
  for (const g of pick) {
    const m = g[0];
    const cands = EXL.filter(e => (e.m[m] || 0) >= 1).sort((a, b) => fav(b.id) - fav(a.id) || (a.id == DEF[m] ? -1 : b.id == DEF[m] ? 1 : 0));
    const ex = (fav(cands[0]?.id) > 0 ? cands[0].id : DEF[m]) || cands[0]?.id;
    if (ex && !items.find(x => x.ex == ex)) items.push(ex);
    if (g.length > 1 && items.length < 6) { const m2 = g[1], c2 = EXL.filter(e => (e.m[m2] || 0) >= 1 && e.id != ex).sort((a, b) => fav(b.id) - fav(a.id)); const e2 = fav(c2[0]?.id) > 0 ? c2[0].id : DEF[m2]; if (e2 && EX[e2] && !items.includes(e2)) items.push(e2); }
  }
  return { items: items.slice(0, 6).sort((a, b) => (isCompound(b) ? 1 : 0) - (isCompound(a) ? 1 : 0)), groups: pick };
}

// ---------- ЭКРАН: ПИТАНИЕ ----------
function ring(v, max, col, size = 118, sw = 11) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, k = Math.min(1, v / Math.max(1, max));
  return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#22273a" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${v > max * 1.1 ? '#ff4d4d' : col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c * k} ${c}"/></svg>`;
}
function foodHtml() {
  const tg = targets(), { L, t } = dayFood(), today = S.fdate == dkey(), win = trainWin(S.fdate);
  const left = { kcal: tg.kcal - t.kcal, p: tg.p - t.p };
  const hr = new Date().getHours();
  const dname = today ? 'Сегодня' : S.fdate == addDays(dkey(), -1) ? 'Вчера' : fdate(S.fdate);
  let eat = '';
  if (today && hr >= 14 && (left.p > 20 || left.kcal > 350)) eat = eatHint(left);
  else if (today && t.kcal > tg.kcal * 1.1) eat = `<div class="hint dn">Перебор на ${nf(t.kcal - tg.kcal)} ккал. Ничего страшного: завтра держи норму, не голодай.</div>`;
  const rm = P().ramadan;
  return `<div class="top"><button class="ib" data-a="fday" data-d="-1">${IC.back}</button><h1 style="text-align:center">${dname}</h1><button class="ib" data-a="fday" data-d="1" ${today ? 'disabled style="opacity:.3"' : ''}>${IC.fwd}</button></div>
  <div class="card"><div class="rings"><div class="ring">${ring(t.kcal, tg.kcal, '#ffb020')}<div class="c"><div><b data-cnt="${Math.max(0, Math.round(left.kcal))}">${nf(Math.max(0, left.kcal))}</b><span class="xs mu">${left.kcal >= 0 ? 'осталось ккал' : 'перебор'}</span></div></div></div>
    <div class="macro">${[['Белок', t.p, tg.p, '#3ddc84'], ['Жиры', t.f, tg.f, '#ffb020'], ['Углеводы', t.c, tg.c, '#3d8bff']].map(([n, v, m, c]) => `<div><div class="row"><span class="sp">${n}</span><span class="xs mu">${nf(v)} / ${m} г</span></div><div class="bar" style="margin-top:4px"><i style="width:${Math.min(100, v / m * 100)}%;background:${c}"></i></div></div>`).join('')}</div></div>
    <div class="xs mu" style="margin-top:10px">Норма ${nf(tg.kcal)} ккал · ${tg.src == 'real' ? 'по твоим реальным данным веса и еды' : 'по формуле, через 2-3 недели подстрою под тебя'} <button class="b s g" style="height:24px;padding:0 6px" data-a="howCalc">как считаем</button></div>
    ${rm ? `<div class="hint" style="margin-top:8px">Режим Рамадана: сухур ≈ ${nf(tg.kcal * 0.4)} ккал (белок ${Math.round(tg.p * 0.4)} г), ифтар и вечер ≈ ${nf(tg.kcal * 0.6)} ккал. Тренировку лучше за час до ифтара или через 1-2 часа после.</div>` : ''}
    ${eat}</div>
  ${sugarCard()}
  ${MEALS.map(([k, n]) => { const it = L.filter(f => f.meal == k), s = it.reduce((a, f) => a + +f.kcal, 0); return `<div class="meal"><h3>${n}</h3><span class="xs mu" style="margin-right:10px">${s ? nf(s) + ' ккал' : ''}</span><button class="b s" data-a="addFood" data-k="${k}">${IC.plus}</button></div>
    <div>${it.map(f => { const sg = sugarDest(f, win); return `<div class="fi"><div class="sp"><div>${esc(f.name)}${sg ? `<span class="sug ${sg[0]}">${sg[1]}</span>` : ''}</div><div class="xs mu"><span data-a="fTime" data-k="${f.id}" style="color:var(--blu);font-weight:700">${new Date(f.at || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span> · ${nf(f.g)} г · Б ${nf(f.p)} · Ж ${nf(f.f)} · У ${nf(f.c)}${+f.s ? ` · сахар ${nf(f.s, 1)}` : ''}${+f.gi ? ` · ГИ ${nf(f.gi)}` : ''}</div></div><span class="k">${nf(f.kcal)}</span><button class="ib" style="width:30px;height:30px;background:none;border:0" data-a="delFood" data-k="${f.id}">${IC.x}</button></div>`; }).join('')}</div>`; }).join('')}
  <div class="grid2" style="margin-top:14px"><button class="b v" data-a="addFood" data-k="${hr < 11 ? 'br' : hr < 16 ? 'lu' : hr < 21 ? 'di' : 'sn'}" data-t="photo">${IC.cam} Фото еды</button><button class="b" data-a="addFood" data-k="${hr < 11 ? 'br' : hr < 16 ? 'lu' : hr < 21 ? 'di' : 'sn'}" data-t="text">Описать словами</button></div>`;
}
function eatHint(left) {
  const pf = ['cottage_cheese_5', 'chicken_breast_boiled', 'eggs_boiled', 'whey_protein', 'kefir_1', 'beef_boiled', 'tuna_canned', 'greek_yogurt'].map(id => FOODS.find(f => f.id == id)).filter(Boolean);
  const pool = pf.length >= 3 ? pf : FOODS.filter(f => f.p >= 15 && f.cat != 'sport').slice(0, 6);
  const need = Math.min(Math.max(left.p, 15), 45);
  const opts = pool.slice(0, 3).map(f => { const g = Math.round(Math.min(f.cat == 'sport' ? 60 : 300, Math.max(30, need / f.p * 100)) / 10) * 10; return `${esc(f.ru)} ${g} г (${nf(f.p * g / 100)} г белка, ${nf(f.k * g / 100)} ккал)`; });
  return `<div class="hint up" style="margin-top:8px"><b>Что доесть:</b> не хватает ${nf(Math.max(0, left.p))} г белка и ${nf(Math.max(0, left.kcal))} ккал.<br>Добери, например:<br>${opts.join('<br>')}</div>`;
}

// ---------- ЭКРАН: ПРОГРЕСС ----------
function lineChart(pts, opt = {}) {
  if (pts.length < 2) return '<div class="empty sm">Нужно хотя бы 2 записи для графика</div>';
  const W = 340, H = 150, pad = 26, xs = pts.map((p, i) => i), ys = pts.flatMap(p => [p.y, p.t].filter(v => v != null));
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const X = i => pad + (W - pad - 6) * i / (pts.length - 1), Y = v => H - 18 - (H - 30) * (v - lo) / (hi - lo);
  const dots = pts.map((p, i) => p.y != null ? `<circle cx="${X(i)}" cy="${Y(p.y)}" r="2.6" fill="${opt.c || '#8fbcff'}"/>` : '').join('');
  const tl = pts.some(p => p.t != null) ? `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.t)}`).join('')}" fill="none" stroke="#ffb020" stroke-width="2.5" stroke-linecap="round"/>` : `<path d="${pts.filter(p => p.y != null).map((p, i) => `${i ? 'L' : 'M'}${X(pts.indexOf(p))},${Y(p.y)}`).join('')}" fill="none" stroke="${opt.c || '#8fbcff'}" stroke-width="2.2"/>`;
  return `<svg class="svgc" viewBox="0 0 ${W} ${H}"><text x="0" y="${Y(hi) + 4}" fill="#8c93ad" font-size="10">${nf(hi, 1)}</text><text x="0" y="${Y(lo) + 4}" fill="#8c93ad" font-size="10">${nf(lo, 1)}</text><line x1="${pad}" x2="${W}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="#262c42"/>${tl}${dots}<text x="${pad}" y="${H - 2}" fill="#8c93ad" font-size="10">${fdate(pts[0].d)}</text><text x="${W}" y="${H - 2}" fill="#8c93ad" font-size="10" text-anchor="end">${fdate(pts[pts.length - 1].d)}</text></svg>`;
}
function progHtml() {
  const tr = trend().slice(-60), fc = forecast(), tw = +P().tw, last = S.body.filter(b => b.weight).slice(-1)[0];
  const wk = weekly(), recs = Object.values(S.recs).sort((a, b) => b.e1rm - a.e1rm);
  const sel = S.progEx || CALIB.find(e => S.recs[e]) || recs[0]?.ex;
  const exPts = sel ? exHistory(sel, 30).reverse().map(ss => ({ d: dkey(ss[0].at), y: Math.max(...ss.map(s => +s.e1rm || e1rm(+s.w + (EX[sel]?.bw || 0) * bw(), s.reps))) })) : [];
  let fcTxt = '';
  if (fc?.done) fcTxt = 'Цель по весу достигнута. Поставь новую в настройках.';
  else if (fc?.date) fcTxt = `При текущем темпе (${fc.rate > 0 ? '+' : ''}${nf(fc.rate, 2)} кг/нед) цель ${nf(tw, 1)} кг - <b>${fdate(fc.date + 'T12:00')}</b>`;
  else if (fc?.wrong) fcTxt = `Вес идёт не в сторону цели (${fc.rate > 0 ? '+' : ''}${nf(fc.rate, 2)} кг/нед). Проверь калории.`;
  else if (fc?.slow) fcTxt = 'Темп очень медленный, до цели больше двух лет. Чуть ужесточи калории.';
  else fcTxt = 'Взвешивайся утром натощак 3-7 раз в неделю - построю прогноз.';
  const boss = CALIB.map(e => { const r = S.recs[e]; if (!r) return null; const ratio = r.e1rm / bw(), k = stdRatio(e, ratio) ?? 0, nx = Math.min(5, Math.floor(k) + 1); const f = P().sex == 'f' ? (['squat', 'deadlift'].includes(e) ? 0.75 : e == 'pullup' ? 0.85 : 0.6) : 1; const need = STD[e][nx] * f * bw(); return { e, cur: r.e1rm, need, nx, done: k >= 5 }; }).filter(Boolean);
  return `<div class="top"><h1>Прогресс</h1></div>
  <div class="card"><div class="row"><h3 class="sp">Вес</h3><button class="b s" data-a="addWeight">${IC.plus} Записать</button></div>
    <div class="row" style="margin:6px 0"><div class="big" style="font-size:30px">${last ? nf(last.weight, 1) : '-'}</div><div class="mu sm">кг ${tr.length ? `· тренд ${nf(tr[tr.length - 1].t, 1)}` : ''}${tw ? ` · цель ${nf(tw, 1)}` : ''}</div></div>
    ${lineChart(tr.map(p => ({ d: p.d, y: p.w, t: p.t })))}<div class="hint" style="margin-top:8px">${fcTxt}</div></div>
  <div class="card"><h3>Сила</h3>${recs.length ? `<div class="chips" style="margin-bottom:8px">${recs.slice(0, 12).map(r => `<button class="chip ${r.ex == sel ? 'on' : ''}" data-a="progEx" data-k="${r.ex}">${esc(exName(r.ex))}</button>`).join('')}</div>${lineChart(exPts, { c: '#9a5cff' })}<div class="xs mu">Расчётный максимум на 1 повтор по формуле Эпли</div>` : '<div class="empty sm">Появится после первых тренировок</div>'}</div>
  ${boss.length ? `<div class="card"><h3>Боссы</h3><div class="xs mu" style="margin-bottom:6px">Силовые рубежи до следующего ранга</div>${boss.map(b => `<div class="quest"><div class="qi">${b.done ? '👑' : '⚔️'}</div><div class="sp"><div class="sm" style="font-weight:700">${esc(exName(b.e))}${b.done ? ' - побеждён' : `: ${nf(b.need)} кг на 1 раз → ${RANKS[b.nx]}`}</div><div class="bar gold" style="margin-top:6px"><i style="width:${Math.min(100, b.cur / b.need * 100)}%"></i></div></div><b class="sm">${nf(b.cur)}</b></div>`).join('')}</div>` : ''}
  <div class="card"><h3>Подходы за неделю</h3><div class="xs mu" style="margin-bottom:8px">Для роста 10-20 рабочих подходов на мышцу</div>${MUSCLES.filter(m => !['neck', 'tibialis', 'serratus'].includes(m)).map(m => `<div class="row" style="margin:5px 0"><span class="sm" style="width:128px">${MN[m]}</span><div class="bar sp"><i style="width:${Math.min(100, wk[m] / 20 * 100)}%;background:${wk[m] < 6 ? '#5a7bd6' : wk[m] <= 20 ? '#3ddc84' : '#ff7a2a'}"></i></div><span class="xs mu" style="width:30px;text-align:right">${nf(wk[m], 1)}</span></div>`).join('')}</div>
  <div class="card"><h3>Рекорды</h3>${recs.length ? recs.slice(0, 15).map(r => `<div class="li"><div class="sp">${esc(exName(r.ex))}<div class="xs mu">${r.at ? fdate(r.at) : 'калибровка'}</div></div><b>${nf(r.w, 1)}×${r.reps}</b><span class="xs mu" style="width:64px;text-align:right">≈${nf(r.e1rm)} кг</span></div>`).join('') : '<div class="empty sm">Пока нет</div>'}</div>`;
}

// ---------- ЭКРАН: ТРЕНЕР ----------
function insights() {
  const out = [], lag = lagging(), tg = targets(), yday = dayFood(addDays(dkey(), -1)).t;
  if (needDeload()) out.push({ i: '🛌', c: 'dn', t: 'Сила падает третью тренировку подряд в нескольких упражнениях. Нужна разгрузочная неделя: те же упражнения, объём -40-50%, вес -10%.' });
  for (const l of lag.list.slice(0, 2)) out.push({ i: '🎯', c: '', t: `${MN[l.m]} отстаёт: ${l.why}. Добавь 2 упражнения по 3-4 подхода.` });
  if (lag.pull > 0 && lag.push > lag.pull * 1.5) out.push({ i: '⚖️', c: 'dn', t: `Жимов (${nf(lag.push, 1)}) больше, чем тяг (${nf(lag.pull, 1)}). Для здоровых плеч держи примерно 1 к 1: добавь тяги и разведения в наклоне.` });
  const ups = Object.keys(S.recs).map(e => [e, suggest(e)]).filter(([, s]) => s?.t == 'up').slice(0, 3);
  for (const [e, s] of ups) out.push({ i: '📈', c: 'up', t: `${exName(e)}: ${s.msg}` });
  if (yday.kcal > 0 && yday.p < tg.p * 0.8) out.push({ i: '🥩', c: 'dn', t: `Вчера белка ${nf(yday.p)} г из ${tg.p}. Без белка мышцы не растут, даже при идеальных тренировках.` });
  const ys = sugarDay(addDays(dkey(), -1)); if (ys.blood > ys.norm * 0.6) out.push({ i: '🍬', c: 'dn', t: `Вчера ${nf(ys.blood)} г сахара ушло «в кровь» - сладкое вне тренировки. Переноси его в окно: за час до и 2 часа после зала.` });
  const lastW = S.works[0]; if (lastW && (Date.now() - new Date(lastW.started_at)) / 864e5 > 5) out.push({ i: '⏰', c: 'dn', t: `Последняя тренировка ${ago(lastW.started_at)}. Мышцы любят регулярность - хотя бы короткая сессия сегодня.` });
  if (!out.length) out.push({ i: '✅', c: 'up', t: S.works.length ? 'Всё по плану: объём в норме, перекосов нет. Продолжай добивать повторы и поднимать веса.' : 'Проведи первую тренировку - и я начну подсказывать, где добавить вес и что отстаёт.' });
  return out;
}
function coachHtml() {
  return `<div class="top"><h1>ИИ-тренер</h1></div>
  <div class="card"><h3>Разбор на сегодня</h3>${insights().map(x => `<div class="hint ${x.c}">${x.i} ${esc(x.t)}</div>`).join('')}</div>
  <div class="card"><h3>Спроси тренера</h3><div class="chat">${S.chat.length ? S.chat.map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>`).join('') : '<div class="mu sm">Например: «почему стоит жим?», «чем заменить присед, болит колено?», «составь тренировку на спину на 45 минут»</div>'}<div id="chatEnd"></div></div>
    <div class="row" style="margin-top:10px"><input class="in" id="cq" placeholder="Вопрос тренеру" data-k13="ask"><button class="b v" data-a="ask" style="width:56px;padding:0">➤</button></div>
    ${S.chat.length ? '<button class="b s g" style="margin-top:6px" data-a="clearChat">Очистить чат</button>' : ''}<div class="xs mu" style="margin-top:6px">До 20 вопросов в день. Тренер не врач: при боли - к специалисту.</div></div>`;
}
function aiContext() {
  const d = P(), lv = levels(), wk = weekly(), tg = targets(), t = dayFood(dkey()).t;
  return [`Пол ${d.sex == 'f' ? 'ж' : 'м'}, ${age()} лет, рост ${d.height} см, вес ${bw()} кг, цель: ${{ cut: 'сушка', keep: 'поддержание', bulk: 'масса' }[d.goal || 'keep']}${d.tw ? ' до ' + d.tw + ' кг' : ''}, тренировок в неделю ${d.days || 3}, опыт ${d.exp || '-'}.`,
    `Уровень героя ${heroLevel()}, ранг ${RANKS[rankIdx()]}.`,
    'Уровни мышц: ' + MUSCLES.map(m => `${MN[m]} ${lv[m]}`).join(', '),
    'Подходов за 7 дней: ' + MUSCLES.map(m => `${MN[m]} ${nf(wk[m], 1)}`).join(', '),
    'Рекорды (≈1ПМ): ' + Object.values(S.recs).slice(0, 12).map(r => `${exName(r.ex)} ${r.w}×${r.reps} (${Math.round(r.e1rm)})`).join(', '),
    `Питание сегодня: ${Math.round(t.kcal)}/${tg.kcal} ккал, белок ${Math.round(t.p)}/${tg.p} г.`,
    'Последние тренировки: ' + S.works.slice(0, 4).map(w => `${fdate(w.started_at)} ${w.name || ''}: ` + [...new Set(S.sets.filter(s => s.workout_id == w.id).map(s => exName(s.ex)))].join(', ')).join('; ')].join('\n');
}

// ---------- ВХОД ----------
function authHtml() {
  return `<div class="auth"><div class="logo">SUPERHERO</div><div class="mu" style="margin-bottom:18px">Качай мышцы - прокачивай героя. Тренировки, питание и ИИ-тренер в одном месте.</div>
  <div id="tgw"><a class="tgb" href="#" data-a="tgGo">Войти через Telegram</a></div>
  <div class="mu sm" style="text-align:center;margin:8px 0">или по почте</div>
  <input class="in" id="em" type="email" placeholder="Почта" autocomplete="email"><input class="in" id="pw" type="password" placeholder="Пароль (от 6 символов)" style="margin-top:8px" autocomplete="current-password">
  <div class="grid2" style="margin-top:10px"><button class="b p" data-a="login">Войти</button><button class="b" data-a="signup">Регистрация</button></div>
  <a class="b g w" href="?demo" style="margin-top:6px;text-decoration:none;color:var(--mu)">Посмотреть демо без входа</a>
  <div class="xs mu" style="text-align:center;margin-top:10px">Если ты уже входил в приложение Degirmen Navoi на этом телефоне, вход общий.</div></div>`;
}
const TG = { L: null, prep: 0 };
async function tgPrep() {
  if (TG.L && Date.now() < TG.L.until - 20e3 || TG.prep) return; TG.prep = 1;
  try { const { data } = await sb.rpc('tg_login_start', { p_origin: location.origin + location.pathname }); if (data?.code) TG.L = { code: data.code, bot: data.bot, until: Date.now() + 5 * 60e3 }; } catch { }
  TG.prep = 0;
}
async function tgPoll() {
  const L = TG.L; if (!L) return;
  if (Date.now() > L.until) { TG.L = null; toast('Вход через Telegram не завершён', 1); render(); return; }
  let h = null; try { h = (await sb.rpc('tg_login_poll', { p_code: L.code })).data; } catch { }
  if (!h) { setTimeout(tgPoll, document.hidden ? 4000 : 2000); return; }
  TG.L = null; let r = await sb.auth.verifyOtp({ token_hash: h, type: 'magiclink' }); if (r.error) r = await sb.auth.verifyOtp({ token_hash: h, type: 'email' });
  if (r.error) toast('Вход не удался, попробуй ещё раз', 1);
}

// ---------- ЗНАКОМСТВО (онбординг) ----------
S.ob = LS.get('ob', { i: 0, d: { sex: 'm', goal: 'cut', days: 3, exp: 'mid', halal: true, calib: {} } });
const OB = ['nick', 'body', 'goal', 'train', 'calib', 'modes'];
function obHtml() {
  const o = S.ob, d = o.d, st = OB[o.i];
  const opt = (k, v, e, t, s) => `<button class="opt ${d[k] == v ? 'on' : ''}" data-a="obSet" data-k="${k}" data-v="${v}"><span class="e">${e}</span><span class="sp"><b>${t}</b>${s ? `<div class="xs mu">${s}</div>` : ''}</span></button>`;
  let body = '';
  if (st == 'nick') body = `<h1>Создадим героя</h1><div class="mu" style="margin:6px 0 10px">Как тебя звать в игре?</div><input class="in" data-in="ob" data-k="nick" value="${esc(d.nick || '')}" placeholder="Ник или имя">
    <label class="l">Пол</label>${opt('sex', 'm', '🧔', 'Мужской')}${opt('sex', 'f', '👩', 'Женский')}`;
  if (st == 'body') body = `<h1>Твои параметры</h1><div class="mu" style="margin:6px 0">Нужны для расчёта калорий и силы</div>
    <label class="l">Год рождения</label><input class="in" inputmode="numeric" data-in="ob" data-k="by" value="${d.by || ''}" placeholder="например, 2005">
    <div class="grid2"><div><label class="l">Рост, см</label><input class="in" inputmode="numeric" data-in="ob" data-k="height" value="${d.height || ''}"></div><div><label class="l">Вес, кг</label><input class="in" inputmode="decimal" data-in="ob" data-k="weight" value="${d.weight || ''}"></div></div>`;
  if (st == 'goal') body = `<h1>Цель</h1>${opt('goal', 'cut', '🔥', 'Сушка', 'убрать жир, сохранить мышцы')}${opt('goal', 'keep', '⚖️', 'Поддержание', 'рекомпозиция, сила')}${opt('goal', 'bulk', '💪', 'Масса', 'набор мышц')}
    <label class="l">Целевой вес, кг (необязательно)</label><input class="in" inputmode="decimal" data-in="ob" data-k="tw" value="${d.tw || ''}">`;
  if (st == 'train') body = `<h1>Тренировки</h1><label class="l">Сколько раз в неделю</label><div class="chips">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip ${d.days == n ? 'on' : ''}" data-a="obSet" data-k="days" data-v="${n}">${n}</button>`).join('')}</div>
    <label class="l">Опыт</label>${opt('exp', 'new', '🌱', 'Новичок', 'меньше года')}${opt('exp', 'mid', '⚔️', 'Средний', '1-3 года')}${opt('exp', 'pro', '🏆', 'Опытный', '3+ лет')}`;
  if (st == 'calib') body = `<h1>Калибровка силы</h1><div class="mu sm" style="margin:6px 0 10px">Впиши рабочий вес и повторы в базовых упражнениях - стартовые уровни мышц поставлю по силе. Чего не делаешь - пропусти.</div>
    ${CALIB.map(e => `<div class="row" style="margin:8px 0"><span class="sp sm" style="font-weight:700">${esc(exName(e))}${e == 'pullup' ? '<div class="xs mu">доп. вес (0 - свой вес)</div>' : ''}</span><input class="in" style="width:84px;text-align:center" inputmode="decimal" placeholder="кг" data-in="obc" data-k="${e}" data-f="w" value="${d.calib?.[e]?.w ?? ''}"><span class="mu">×</span><input class="in" style="width:64px;text-align:center" inputmode="numeric" placeholder="раз" data-in="obc" data-k="${e}" data-f="reps" value="${d.calib?.[e]?.reps ?? ''}"></div>`).join('')}`;
  if (st == 'modes') body = `<h1>Последнее</h1>
    <button class="opt ${d.halal ? 'on' : ''}" data-a="obTog" data-k="halal"><span class="e">🕌</span><span class="sp"><b>Халяль-режим</b><div class="xs mu">предупреждать о сомнительном составе</div></span></button>
    <button class="opt ${d.ramadan ? 'on' : ''}" data-a="obTog" data-k="ramadan"><span class="e">🌙</span><span class="sp"><b>Режим Рамадана</b><div class="xs mu">делить калории на сухур и ифтар</div></span></button>
    <div class="hint" style="margin-top:12px">Приложение не заменяет врача. При боли и травмах - к специалисту.</div>`;
  return `<div style="padding-top:14px"><div class="step">${OB.map((x, i) => `<i class="${i <= o.i ? 'on' : ''}"></i>`).join('')}</div>${body}
  <div class="grid2" style="margin-top:20px">${o.i ? `<button class="b" data-a="obNav" data-d="-1">Назад</button>` : '<span></span>'}<button class="b p" data-a="obNav" data-d="1">${o.i == OB.length - 1 ? 'Создать героя' : 'Дальше'}</button></div></div>`;
}

// ---------- ДЕЙСТВИЯ ----------
const A = {
  tab(el) { const a = TABS.findIndex(t => t[0] == S.tab), b = TABS.findIndex(t => t[0] == el.dataset.k); S.anim = b < a ? 'enter-l' : 'enter-r'; S.tab = el.dataset.k; closeSheet(true); scrollTo(0, 0); render(); vib(6); },
  mode(el) { S.mode = el.dataset.k; document.querySelectorAll('.modes .chip').forEach(c => c.classList.toggle('on', c.dataset.k == S.mode)); S.body3d?.paint(paintMap()); const lg = $('.leg'); if (lg) { const tmp = document.createElement('div'); tmp.innerHTML = heroHtml(); lg.innerHTML = tmp.querySelector('.leg').innerHTML; } },
  view() { S.side = S.side == 'back' ? 'front' : 'back'; S.body3d?.view(S.side); },
  muscle(el) { openMuscle(el.dataset.k); },
  // онбординг
  obSet(el) { const v = el.dataset.v; S.ob.d[el.dataset.k] = isNaN(+v) ? v : +v; LS.set('ob', S.ob); render(); },
  obTog(el) { S.ob.d[el.dataset.k] = !S.ob.d[el.dataset.k]; LS.set('ob', S.ob); render(); },
  async obNav(el) {
    const d = S.ob.d, st = OB[S.ob.i], dir = +el.dataset.d;
    if (dir > 0) {
      if (st == 'body') { if (!(+d.by > 1930 && +d.by < 2020)) return toast('Проверь год рождения', 1); if (!(+d.height > 120 && +d.height < 230)) return toast('Проверь рост', 1); if (!(+d.weight > 30 && +d.weight < 250)) return toast('Проверь вес', 1); }
      if (st == 'nick' && !(d.nick || '').trim()) return toast('Придумай ник', 1);
      if (S.ob.i == OB.length - 1) {
        const data = { ...d, by: +d.by, height: +d.height, weight: +d.weight, tw: +d.tw || null, calib: Object.fromEntries(Object.entries(d.calib || {}).filter(([, v]) => +v.reps > 0).map(([k, v]) => [k, { w: +v.w || 0, reps: +v.reps }])) };
        delete data.nick;
        el.disabled = true; el.textContent = 'Создаю...';
        try {
          if (DEMO) S.prof = { data, nick: d.nick, xp: 0, rank: 0 }; else await DB.saveProfile(data, d.nick.trim());
          LS.set('ob', null);
          if (!DEMO && d.weight) await DB.saveBody({ d: dkey(), weight: +d.weight }).catch(() => { });
          S.tab = 'hero'; render(); toast('Герой создан! Нажимай на мышцы');
        } catch (e) { toast('Не получилось сохранить: ' + e.message, 1); el.disabled = false; el.textContent = 'Создать героя'; }
        return;
      }
    }
    S.ob.i = Math.max(0, S.ob.i + dir); LS.set('ob', S.ob); render(); scrollTo(0, 0);
  },
  // вход
  tgGo(el, e) {
    e.preventDefault(); const L = TG.L;
    if (!L) { toast('Секунду, готовлю вход...'); tgPrep(); return; }
    setTimeout(tgPoll, 2500);
    const app = `tg://resolve?domain=${L.bot}&start=login_${L.code}`, web = `https://t.me/${L.bot}?start=login_${L.code}`;
    $('#tgw').innerHTML = `<a class="tgb" href="${web}" target="_blank">Подтверди вход в Telegram</a><div class="xs mu" style="text-align:center;margin-top:6px">Не открылся? Отправь боту @${esc(L.bot)} команду /start login_${L.code}</div>`;
    if (/iPhone|iPad|Android/i.test(navigator.userAgent)) location.href = app; else open(web, '_blank');
  },
  async login() { const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value }); if (error) toast('Неверная почта или пароль', 1); },
  async signup() { const em = $('#em').value.trim(), pw = $('#pw').value; if (pw.length < 6) return toast('Пароль от 6 символов', 1); const { data, error } = await sb.auth.signUp({ email: em, password: pw }); if (error) return toast(error.message, 1); if (!data.session) toast('Проверь почту и подтверди регистрацию'); },
  // тренировка
  dayWorkout() {
    if (S.w) { S.tab = 'train'; return render(); }
    const pl = dayPlan();
    if (!pl.items.length) return toast('Все мышцы ещё восстанавливаются. Сегодня отдых или кардио', 1);
    sheet(`<h2>Тренировка дня</h2><div class="mu sm" style="margin:6px 0 10px">Собрал из восстановленных и отстающих мышц: ${pl.groups.map(g => MN[g[0]]).join(', ')}</div>
      ${pl.items.map(e => `<div class="li"><span class="dot" style="background:var(--gold)"></span><div class="sp">${esc(exName(e))}</div><span class="xs mu">3 подх.</span></div>`).join('')}
      <button class="b p w" style="margin-top:14px" data-a="startPlan">${IC.fire} Начать</button>`);
    S.plan = pl;
  },
  startPlan() { closeSheet(true); startW('Тренировка дня', S.plan.items.map(e => newItem(e, 3))); },
  startEmpty() { startW('Тренировка', []); A.pickEx(); },
  startDay(el) {
    const p = S.progs.find(x => x.id == el.dataset.k), d = p.days[+el.dataset.i];
    startW(`${p.name}: ${d.name}`, d.items.map(it => { const n = newItem(it.ex, it.sets || 3, it.rmin, it.rmax); if (it.w && !n.sets[0].w) n.sets.forEach(s => s.w = +it.w); return n; }), { program_id: p.id, day_idx: +el.dataset.i });
  },
  async useTpl(el) { try { await DB.saveProg(tplToProg(TPL[+el.dataset.k])); render(); toast('Программа добавлена. Можно менять веса и упражнения'); } catch (e) { toast(e.message, 1); } },
  newProg() { editProg({ name: 'Моя программа', days: [{ name: 'День 1', items: [] }] }); },
  editProg(el) { editProg(JSON.parse(JSON.stringify(S.progs.find(x => x.id == el.dataset.k)))); },
  pickEx(el) { pickEx(ex => { S.w.items.push(newItem(ex, 3)); saveW(); render(); setTimeout(() => $('#ex' + (S.w.items.length - 1))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }); },
  addEx(el) { S.w.items.push(newItem(el.dataset.k, 3)); saveW(); closeSheet(true); S.tab = 'train'; render(); toast('Добавлено в тренировку'); },
  rmEx(el) { S.w.items.splice(+el.dataset.i, 1); saveW(); render(); },
  addSet(el) { const it = S.w.items[+el.dataset.i], l = it.sets[it.sets.length - 1]; it.sets.push({ w: l?.w ?? null, reps: null, pw: l?.w ?? l?.pw ?? '', pr: l?.reps ?? l?.pr ?? '', kind: 'work' }); saveW(); render(); },
  inc(el) { const s = S.w.items[+el.dataset.i].sets[+el.dataset.j], f = el.dataset.f, d = +el.dataset.d; const cur = s[f] ?? (f == 'w' ? +s.pw || 0 : +s.pr || 0); s[f] = Math.max(0, r1(cur + d)); saveW(); const inp = el.parentNode.querySelector('input'); inp.value = s[f]; vib(8); },
  done(el) {
    const i = +el.dataset.i, j = +el.dataset.j, it = S.w.items[i], s = it.sets[j];
    if (!s.done) {
      if (s.w == null && s.pw !== '') s.w = +s.pw || 0;
      if (s.reps == null && s.pr !== '') s.reps = +s.pr || 0;
      if (!(s.reps > 0)) return toast('Впиши повторы', 1);
      s.done = true; s.at = new Date().toISOString(); vib([15, 40, 15]); S.justDone = i + '-' + j;
      if (s.kind != 'warm') startRest(isCompound(it.ex) ? 150 : 90);
      const e1 = e1rm((+s.w || 0) + (EX[it.ex]?.bw || 0) * bw(), s.reps), pr = S.recs[it.ex];
      if (pr && e1 > pr.e1rm + 0.05 && s.kind != 'warm') toast(`🏆 Новый рекорд: ${exName(it.ex)} ≈${nf(e1)} кг`);
    } else s.done = false;
    saveW(); render();
  },
  warmup(el) {
    const it = S.w.items[+el.dataset.i], W = +(it.sets.find(s => s.kind != 'warm')?.w ?? it.sets[0]?.pw) || 0;
    if (W < 30) return toast('Сначала впиши рабочий вес', 1);
    const r = x => Math.max(20, Math.round(W * x / 2.5) * 2.5);
    it.sets.unshift({ w: r(0.5), reps: 10, kind: 'warm' }, { w: r(0.7), reps: 5, kind: 'warm' }, { w: r(0.85), reps: 2, kind: 'warm' });
    saveW(); render();
  },
  plates(el) {
    const it = S.w.items[+el.dataset.i], s = it.sets.find(x => !x.done) || it.sets[0], W = +(s?.w ?? s?.pw) || 0;
    const side = (W - 20) / 2, P = [25, 20, 15, 10, 5, 2.5, 1.25], out = []; let rem = side;
    for (const p of P) while (rem >= p - 1e-6) { out.push(p); rem -= p; }
    sheet(`<h2>Блины на штангу</h2><div class="mu sm" style="margin:6px 0 12px">${nf(W, 1)} кг на олимпийском грифе 20 кг</div>${W <= 20 ? '<div class="empty">Только гриф</div>' : `<div class="big" style="font-size:24px">${out.join(' + ')}</div><div class="mu sm" style="margin-top:6px">на каждую сторону${rem > 0.01 ? `, остаток ${nf(rem * 2, 2)} кг не набрать` : ''}</div>`}`);
  },
  swapEx(el) {
    const i = +el.dataset.i, it = S.w.items[i], m = EX[it.ex]?.m || {}, main = Object.keys(m).filter(k => m[k] >= 1);
    const sim = e => { let s = 0; for (const k in m) s += Math.min(m[k], e.m[k] || 0); return s - Object.keys(e.m).filter(k => !m[k]).length * 0.3 + (S.recs[e.id] ? 0.5 : 0); };
    const alt = EXL.filter(e => e.id != it.ex && main.some(k => (e.m[k] || 0) >= 1)).sort((a, b) => sim(b) - sim(a)).slice(0, 10);
    sheet(`<h2>Чем заменить</h2><div class="mu sm" style="margin:6px 0">${esc(exName(it.ex))} → те же мышцы: ${main.map(k => MN[k]).join(', ')}</div>${alt.map(e => `<button class="opt" data-a="doSwap" data-i="${i}" data-k="${e.id}"><span class="sp"><b>${esc(e.ru)}</b><div class="xs mu">${S.recs[e.id] ? `твой рекорд ${nf(S.recs[e.id].w, 1)}×${S.recs[e.id].reps}` : e.eq}</div></span>${IC.swap}</button>`).join('')}`);
  },
  doSwap(el) { const i = +el.dataset.i, old = S.w.items[i]; S.w.items[i] = newItem(el.dataset.k, Math.max(1, old.sets.filter(s => !s.done).length || 3), old.rmin, old.rmax); saveW(); closeSheet(true); render(); },
  cancelW() { sheet(`<h2>Отменить тренировку?</h2><div class="mu" style="margin:8px 0 14px">Отмеченные подходы не сохранятся.</div><div class="grid2"><button class="b" data-a="closeSh">Нет</button><button class="b" style="color:var(--red)" data-a="cancelYes">Отменить</button></div>`); },
  cancelYes() { S.w = null; LS.set('w', null); stopRest(); closeSheet(true); render(); },
  closeSh() { closeSheet(); },
  async finishW(el) {
    const w = S.w, sets = [];
    w.items.forEach(it => it.sets.forEach(s => { if (s.done) sets.push({ ex: it.ex, w: +s.w || 0, reps: +s.reps || 0, kind: s.kind || 'work', at: s.at }); }));
    if (!sets.length) return toast('Нет отмеченных подходов. Нажми ✓ после каждого подхода', 1);
    const payload = { id: w.id, started_at: w.started_at, finished_at: new Date().toISOString(), name: w.name, program_id: w.program_id || null, day_idx: w.day_idx ?? null, sets };
    el.disabled = true; el.textContent = 'Считаю опыт...';
    stopRest();
    // сохраняем веса в программу (последние рабочие)
    if (w.program_id) { const p = S.progs.find(x => x.id == w.program_id); if (p) { const d = p.days[w.day_idx]; d?.items.forEach(pi => { const it = w.items.find(x => x.ex == pi.ex); const top = it && Math.max(0, ...it.sets.filter(s => s.done && s.kind != 'warm').map(s => +s.w || 0)); if (top) pi.w = top; }); DB.saveProg(p).catch(() => { }); } }
    let res = null;
    try { res = await DB.saveWorkout(payload); await DB.load(); }
    catch (e) {
      if (!navigator.onLine || /fetch|network/i.test(e.message)) { S.q.push(payload); LS.set('q', S.q); S.sets.push(...sets.map(s => ({ ...s, workout_id: w.id }))); toast('Нет интернета. Тренировка сохранена в телефоне и отправится позже'); }
      else { el.disabled = false; el.textContent = 'Завершить тренировку'; return toast('Ошибка сохранения: ' + e.message, 1); }
    }
    S.w = null; LS.set('w', null);
    showResult(res, sets.length);
  },
  async wSend(el) {
    const inp = $('#wq'), txt = (inp?.value || '').trim(); if (txt.length < 2) return;
    const lastEx = S.w?.items.slice().reverse().find(it => it.sets.some(st => st.done))?.ex || S.w?.items[S.w.items.length - 1]?.ex || null;
    let items = parseLog(txt, lastEx), btn = $('[data-a=wSend]');
    const bad = items.filter(x => !x.ex || !x.sets.length);
    if (!items.length || bad.length) {
      if (btn) btn.textContent = '…';
      try {
        const r = await DB.ai({ mode: 'parse', text: txt });
        const ai = (r.items || []).map(x => ({ name: x.name, ex: findEx(x.name), sets: (x.sets || []).filter(st => +st.reps > 0).map(st => ({ w: +st.w || 0, reps: +st.reps })) }));
        if (ai.length && ai.every(x => x.ex && x.sets.length)) items = ai;
      } catch (e) { }
      if (btn) btn.textContent = '➤';
    }
    const ok = items.filter(x => x.ex && x.sets.length), miss = items.filter(x => !x.ex || !x.sets.length);
    if (!ok.length) {
      const q = miss[0]?.name || txt, sug = sugFor(q).map(id => EX[id]);
      S.wPending = { txt, sets: miss[0]?.sets?.length ? miss[0].sets : parseNums(txt.replace(/^\D+/, ''), false) };
      (S.w = S.w || { id: uuid(), started_at: new Date().toISOString(), name: 'Свободная тренировка', items: [], log: [] }).log = S.w.log || [];
      S.w.log.push({ q: txt, a: miss[0]?.ex && !miss[0].sets.length ? `Понял упражнение «${exName(miss[0].ex)}», но не вижу вес и повторы. Напиши, например: 80 на 8 три подхода` : `Не узнал упражнение «${q}». ${sug.length ? 'Это одно из этих?' : 'Попробуй написать иначе.'}`, sug: S.wPending.sets.length ? sug.map(e => e.id) : [], err: 1 });
      saveW(); S.tab = 'train'; render(); setTimeout(() => $('#wq')?.focus(), 50); return;
    }
    const r = logToWorkout(ok);
    S.w.log.push({ q: txt, a: r.text + (miss.length ? `\nНе понял: ${miss.map(m => m.name).join(', ')}` : ''), undo: r.undo });
    S.w.log = S.w.log.slice(-30); saveW(); vib([15, 40, 15]); startRest(isCompound(ok[ok.length - 1].ex) ? 150 : 90);
    S.tab = 'train'; render();
    setTimeout(() => { const c = $('#ex' + S.w.items.findIndex(it => it.ex == ok[ok.length - 1].ex)); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#wq')?.focus(); }, 60);
  },
  wSug(el) {
    const p = S.wPending; if (!p) return;
    const r = logToWorkout([{ ex: el.dataset.k, sets: p.sets }]); S.wPending = null;
    const L = S.w.log[S.w.log.length - 1]; L.a = r.text; L.undo = r.undo; L.sug = []; L.err = 0;
    saveW(); vib(15); render();
  },
  wPick() { pickEx(ex => A.wSug({ dataset: { k: ex } })); },
  wUndo() {
    const L = S.w?.log?.[S.w.log.length - 1]; if (!L?.undo) return;
    for (const u of L.undo.slice().reverse()) {
      const i = S.w.items.findIndex(it => it.ex == u.ex); if (i < 0) continue;
      if (u.created) S.w.items.splice(i, 1); else S.w.items[i].sets = u.snap.slice(0, u.before).concat(u.snap.slice(u.before).filter(st => !st.done));
    }
    S.w.log.pop(); saveW(); stopRest(); render(); toast('Отменил последнюю запись');
  },
  async textWorkout() {
    sheet(`<h2>Тренировка текстом</h2><div class="mu sm" style="margin:6px 0 10px">Напиши или надиктуй микрофоном клавиатуры: «жим 80 на 8 три подхода, разводка 14 по 12, подтягивания 10 8 7»</div><textarea class="in" id="wt" rows="4"></textarea><button class="b v w" style="margin-top:10px" data-a="parseW">Разобрать</button>`);
    setTimeout(() => $('#wt')?.focus(), 300);
  },
  async parseW(el) {
    const txt = $('#wt').value.trim(); if (txt.length < 3) return;
    el.disabled = true; el.textContent = 'Разбираю...';
    let items = localParse(txt);
    if (!items.length || items.some(i => !i.ex)) {
      try { const r = await DB.ai({ mode: 'parse', text: txt }); items = (r.items || []).map(x => ({ ex: findEx(x.name), name: x.name, sets: (x.sets || []).map(s => ({ w: +s.w || 0, reps: +s.reps || 0 })) })); }
      catch (e) { if (!items.length) { el.disabled = false; el.textContent = 'Разобрать'; return toast(e.message, 1); } }
    }
    const ok = items.filter(i => i.ex && i.sets.length), bad = items.filter(i => !i.ex);
    if (!ok.length) { el.disabled = false; el.textContent = 'Разобрать'; return toast('Не узнал упражнения. Попробуй написать иначе', 1); }
    if (!S.w) S.w = { id: uuid(), started_at: new Date(Date.now() - 60 * 6e4).toISOString(), name: 'Тренировка', items: [] };
    const now = Date.now();
    ok.forEach(i => { const it = newItem(i.ex, 0); it.sets = i.sets.map((s, k) => ({ w: s.w, reps: s.reps, done: true, kind: 'work', at: new Date(now - (ok.length * 4 - k) * 9e4).toISOString() })); S.w.items.push(it); });
    saveW(); closeSheet(true); S.tab = 'train'; render();
    toast(bad.length ? `Не узнал: ${bad.map(b => b.name).join(', ')}` : `Добавлено ${ok.length} упр. Проверь и нажми «Завершить»`, !!bad.length);
  },
  openWork(el) {
    const w = S.works.find(x => x.id == el.dataset.k), ss = S.sets.filter(s => s.workout_id == w.id), by = {};
    ss.forEach(s => (by[s.ex] = by[s.ex] || []).push(s));
    sheet(`<h2>${esc(w.name || 'Тренировка')}</h2><div class="mu sm" style="margin:4px 0 10px">${new Date(w.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · +${nf(w.xp)} XP</div>
      ${Object.keys(by).length ? Object.entries(by).map(([e, l]) => `<div class="li"><div class="sp"><b>${esc(exName(e))}</b><div class="xs mu">${l.map(s => `${s.kind == 'warm' ? 'р ' : ''}${nf(s.w, 1)}×${s.reps}`).join(' · ')}</div></div></div>`).join('') : '<div class="mu sm">Подходы старше 70 дней не загружены</div>'}
      ${w.summary?.muscles?.length ? `<h3 style="margin-top:12px">Опыт по мышцам</h3>${w.summary.muscles.slice(0, 8).map(m => `<div class="row sm" style="margin:4px 0"><span class="sp">${MN[m.m]}</span><b style="color:var(--gold)">+${nf(m.gain)}</b></div>`).join('')}` : ''}
      <button class="b w" style="margin-top:14px;color:var(--red)" data-a="delWork" data-k="${w.id}">Удалить тренировку</button>`);
  },
  async delWork(el) { if (el.dataset.sure != '1') { el.dataset.sure = '1'; el.textContent = 'Точно удалить? Опыт пересчитается'; return; } try { await DB.delWorkout(el.dataset.k); closeSheet(true); render(); toast('Удалено, опыт пересчитан'); } catch (e) { toast(e.message, 1); } },
  // питание
  fday(el) { const n = addDays(S.fdate, +el.dataset.d); if (n > dkey()) return; S.fdate = n; render(); },
  addFood(el) { addFoodSheet(el.dataset.k, el.dataset.t); },
  async delFood(el) { try { await DB.delFood(el.dataset.k); render(); } catch (e) { toast(e.message, 1); } },
  howCalc() {
    const t = targets();
    sheet(`<h2>Как считаем норму</h2><div class="sm" style="line-height:1.6;margin-top:8px">Базовый обмен (формула Миффлина-Сан Жеора): <b>${nf(t.bmr)} ккал</b>.<br>С учётом тренировок расход: <b>${nf(t.tdee)} ккал</b>${t.src == 'real' ? ' - посчитан по твоим реальным данным: сколько ел и как менялся вес' : ''}.<br>Цель «${{ cut: 'сушка', keep: 'поддержание', bulk: 'масса' }[P().goal || 'keep']}» → <b>${nf(t.kcal)} ккал</b>.<br>Белок ${t.p} г (${nf(t.p / bw(), 1)} г/кг), жиры ${t.f} г, углеводы ${t.c} г.<br><br>Через 2-3 недели взвешиваний и записи еды приложение само узнает твой настоящий расход - это точнее любой формулы.</div>`);
  },
  howSugar() {
    const d = sugarDay();
    sheet(`<h2>Как считаем сахар</h2><div class="sm" style="line-height:1.6;margin-top:8px"><b>Норма</b> - не больше 10% калорий из сахара (это ${Math.round(targets().kcal * 0.1 / 4)} г при твоей норме), идеально - до 5% (${Math.round(targets().kcal * 0.05 / 4)} г). В день тренировки добавляем 0.3 г на кг веса (+${Math.round(0.3 * bw())} г): мышцам нужно восполнить гликоген.<br><br>
      <b>💪 В мышцы</b> - быстрые углеводы, съеденные за час до тренировки и в течение 2 часов после. Мышцы после нагрузки сами забирают глюкозу.<br>
      <b>⚡ В кровь</b> - продукты с высоким гликемическим индексом (70+) вне тренировки: резкий скачок сахара и инсулина, потом голод, лишнее легче уходит в жир.<br>
      <b>Средне / плавно</b> - ГИ 55-69 и ниже 55: сахар поступает медленно.<br><br>
      <b>Гликемическая нагрузка</b> = ГИ × углеводы / 100 за день: до 80 - низкая, 80-120 - средняя, выше - высокая.<br><br>
      <span class="mu">Модель упрощённая: на скорость влияют порция, жир и белок в приёме пищи. Время приёма - когда ты его записал. Для блюд с фото сахар и ГИ оцениваются по похожим продуктам из базы.</span></div>`);
  },
  // прогресс
  addWeight() {
    const l = S.body.find(b => b.d == dkey()) || {};
    sheet(`<h2>Замеры сегодня</h2><label class="l">Вес, кг (утром натощак)</label><input class="in" id="bwv" inputmode="decimal" value="${l.weight || ''}">
      <div class="grid2"><div><label class="l">Талия, см</label><input class="in" id="bwa" inputmode="decimal" value="${l.waist || ''}"></div><div><label class="l">Сон, часов</label><input class="in" id="bsl" inputmode="decimal" value="${l.sleep || ''}"></div></div>
      <button class="b p w" style="margin-top:14px" data-a="saveWeight">Сохранить</button>`);
  },
  async saveWeight() {
    const w = +$('#bwv').value.replace(',', '.'), wa = +$('#bwa').value.replace(',', '.') || null, sl = +$('#bsl').value.replace(',', '.') || null;
    if (!(w > 30 && w < 250)) return toast('Проверь вес', 1);
    try {
      await DB.saveBody({ d: dkey(), weight: w, waist: wa, sleep: sl });
      if (Math.abs(w - bw()) >= 0.5) { const d = { ...P(), weight: w }; await DB.saveProfile(d); }
      closeSheet(true); render(); toast('Записал');
    } catch (e) { toast(e.message, 1); }
  },
  progEx(el) { S.progEx = el.dataset.k; render(); },
  // тренер
  async ask() {
    const q = $('#cq').value.trim(); if (q.length < 2) return;
    S.chat.push({ r: 'u', t: q }); S.chat.push({ r: 'a', t: '...' }); render();
    try { const r = await DB.ai({ mode: 'chat', text: q, context: aiContext(), history: S.chat.slice(-8, -2) }); S.chat[S.chat.length - 1].t = r.text; }
    catch (e) { S.chat[S.chat.length - 1].t = e.message; }
    S.chat = S.chat.slice(-30); LS.set('chat', S.chat); render();
  },
  clearChat() { S.chat = []; LS.set('chat', []); render(); },
  // настройки
  settings() {
    const d = P();
    sheet(`<h2>Настройки</h2>
      <label class="l">Ник</label><input class="in" id="stn" value="${esc(S.prof?.nick || '')}">
      <div class="grid2"><div><label class="l">Вес, кг</label><input class="in" id="stw" inputmode="decimal" value="${d.weight || ''}"></div><div><label class="l">Цель, кг</label><input class="in" id="sttw" inputmode="decimal" value="${d.tw || ''}"></div></div>
      <div class="grid2"><div><label class="l">Рост, см</label><input class="in" id="sth" inputmode="numeric" value="${d.height || ''}"></div><div><label class="l">Тренировок в неделю</label><input class="in" id="std" inputmode="numeric" value="${d.days || 3}"></div></div>
      <label class="l">Цель</label><select class="in" id="stg">${[['cut', 'Сушка'], ['keep', 'Поддержание'], ['bulk', 'Масса']].map(([k, n]) => `<option value="${k}" ${d.goal == k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label class="row" style="margin-top:12px"><input type="checkbox" id="str" ${d.ramadan ? 'checked' : ''}> Режим Рамадана</label>
      <label class="row" style="margin-top:8px"><input type="checkbox" id="sthl" ${d.halal ? 'checked' : ''}> Халяль-режим</label>
      <button class="b p w" style="margin-top:14px" data-a="saveSettings">Сохранить</button>
      <div class="card" style="margin-top:14px"><div class="row"><h3 class="sp">Уведомления</h3><span class="tag">${S.pushOn ? 'включены' : 'выключены'}</span></div>
        <div class="xs mu" style="margin-bottom:8px">Напомню добрать белок и сходить в зал. На iPhone работают, только если приложение добавлено на главный экран.</div>
        <div class="grid2"><div><label class="l">Белок, проверка в</label><select class="in" id="pnp">${[18, 19, 20, 21, 22].map(h => `<option value="${h}" ${(S.pushPrefs?.protein ?? 20) == h ? 'selected' : ''}>${h}:00</option>`).join('')}<option value="" ${S.pushPrefs && S.pushPrefs.protein == null ? 'selected' : ''}>не надо</option></select></div>
        <div><label class="l">Пора в зал, в</label><select class="in" id="pnt">${[8, 10, 12, 16, 17, 18, 19].map(h => `<option value="${h}" ${(S.pushPrefs?.train ?? 18) == h ? 'selected' : ''}>${h}:00</option>`).join('')}<option value="" ${S.pushPrefs && S.pushPrefs.train == null ? 'selected' : ''}>не надо</option></select></div></div>
        <button class="b v w" style="margin-top:10px" data-a="pushOn">${S.pushOn ? 'Сохранить время' : 'Включить уведомления'}</button></div>
      <div class="grid2" style="margin-top:10px"><button class="b" data-a="recalib">Калибровка</button><button class="b" data-a="exportData">Мои данные</button></div>
      ${DEMO ? '<a class="b w g" href="./" style="margin-top:10px;text-decoration:none">Выйти из демо</a>' : '<button class="b w g" style="margin-top:10px;color:var(--red)" data-a="logout">Выйти из аккаунта</button>'}
      <div class="xs mu" style="text-align:center;margin-top:10px">Superhero · v1 · данные видишь только ты<br><a href="privacy.html" target="_blank">Политика данных</a> · <a href="/delete-account.html" target="_blank">Удаление аккаунта</a></div>`);
  },
  async saveSettings(el) {
    const d = { ...P(), weight: +$('#stw').value.replace(',', '.') || P().weight, tw: +$('#sttw').value.replace(',', '.') || null, height: +$('#sth').value || P().height, days: +$('#std').value || 3, goal: $('#stg').value, ramadan: $('#str').checked, halal: $('#sthl').checked };
    el.disabled = true;
    try { await DB.saveProfile(d, $('#stn').value.trim() || S.prof?.nick); closeSheet(true); render(); toast('Сохранено, опыт пересчитан'); } catch (e) { toast(e.message, 1); el.disabled = false; }
  },
  recalib() { S.ob = { i: 4, d: { ...P(), nick: S.prof?.nick, calib: P().calib || {} } }; LS.set('ob', S.ob); closeSheet(true); S.prof.data = { ...P(), weight: null }; render(); },
  exportData() {
    const blob = new Blob([JSON.stringify({ profile: S.prof, workouts: S.works, sets: S.sets, food: S.food, body: S.body, programs: S.progs }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'superhero-data.json'; a.click();
  },
  async logout() { await sb.auth.signOut(); location.reload(); },
  shareCard() { shareCard(); },
  async pushOn(el) {
    if (DEMO) return toast('В демо уведомления не работают', 1);
    if (window.SHApp) return toast('В приложении для Android напоминания с сервера пока не приходят. Конец отдыха - приходит. Для напоминаний о белке открой Superhero в Chrome', 1);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast(/iPhone|iPad/.test(navigator.userAgent) ? 'Добавь приложение на главный экран: Поделиться → На экран «Домой»' : 'Этот браузер не умеет уведомления', 1);
    el.disabled = true;
    try {
      const perm = await Notification.requestPermission(); if (perm != 'granted') { el.disabled = false; return toast('Разреши уведомления в настройках браузера', 1); }
      const reg = await navigator.serviceWorker.ready, { data: key } = await sb.rpc('push_key'); if (!key) throw new Error('нет ключа');
      const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
      const v = id => $(id).value === '' ? null : +$(id).value, prefs = { protein: v('#pnp'), train: v('#pnt'), gap: 3 };
      const { error } = await sb.rpc('fit_push_save', { p_sub: sub.toJSON(), p_prefs: prefs }); if (error) throw error;
      S.pushOn = true; S.pushPrefs = prefs; LS.set('push', prefs); toast('Уведомления включены'); closeSheet(true);
    } catch (e) { toast('Не получилось: ' + e.message, 1); el.disabled = false; }
  },
  saveProg() { }, // заполняется в editProg
};

// ---------- выбор упражнения ----------
const POP = ['bench', 'squat', 'deadlift', 'ohp', 'row', 'pullup', 'lat_pulldown', 'incline_bench', 'db_bench', 'db_incline', 'leg_press', 'barbell_curl', 'db_curl', 'pushdown_rope', 'french_press', 'lateral_raise', 'dips', 'rdl', 'hip_thrust', 'seated_row', 'db_row', 'leg_extension', 'leg_curl_lying', 'calf_standing', 'hanging_leg_raise', 'crunch', 'plank', 'pushup', 'hammer_curl', 'face_pull', 'pec_deck', 'bulgarian', 'lunge_db'];
const norm = x => String(x || '').toLowerCase().replace(/ё/g, 'е');
// основа слова без окончания: «наклоне» и «наклонной» → «накло», «гантелей» → «гантел»
const stem = w => w.length <= 4 ? w : w.slice(0, Math.max(4, Math.ceil(w.length * 0.6)));
const STOP = new Set(['на', 'в', 'во', 'с', 'со', 'по', 'для', 'и', 'к', 'от', 'до', 'из', 'за', 'под']);
function exScore(e, q, qw) {
  const n = norm(e.ru), syn = e.syn.map(norm);
  if (n == q || syn.includes(q)) return 8;
  if (n.startsWith(q)) return 6;
  if (syn.some(x => x.startsWith(q))) return 5;
  if (n.includes(q)) return 4;
  if (syn.some(x => x.length > 6 && q.includes(x))) return 4.5;
  const words = (n + ' ' + syn.join(' ') + ' ' + norm(e.en)).split(/[\s\-,()/«»"]+/).filter(Boolean);
  const qs = qw.filter(w => !STOP.has(w));
  if (!qs.length) return 0;
  const hit = qs.filter(w => { const st = stem(w); return words.some(x => x.startsWith(st)); }).length;
  if (hit == qs.length) return qs.length > 1 ? 3.5 + Math.min(0.4, hit * 0.1) : 2.5;
  if (syn.some(x => x.includes(q))) return 2.4;
  if (qs.length > 1 && hit / qs.length >= 0.5) return 1 + hit / qs.length;  // частичное совпадение - для подсказок
  return 0;
}
function searchEx(q, m) {
  q = norm(q).trim().replace(/\s+/g, ' ');
  const qw = q.split(' ').filter(w => w.length > 1);
  let L = EXL;
  if (m) L = L.filter(e => (e.m[m] || 0) >= 1);
  const fav = e => S.sets.filter(s => s.ex == e.id).length + (S.w?.items.some(it => it.ex == e.id) ? 50 : 0);
  const pop = e => { const i = POP.indexOf(e.id); return i < 0 ? 99 : i; };
  if (q) L = L.map(e => [e, exScore(e, q, qw)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || fav(b[0]) - fav(a[0]) || pop(a[0]) - pop(b[0])).map(x => x[0]);
  else L = [...L].sort((a, b) => fav(b) - fav(a) || pop(a) - pop(b));
  return L.slice(0, 60);
}
function findEx(name) { const q = norm(name).trim(), qw = q.split(/\s+/).filter(w => w.length > 1), r = searchEx(q); return r[0] && exScore(r[0], q, qw) >= 2.4 ? r[0].id : null; }
function pickEx(cb) {
  S.pickCb = cb; S.pickM = null;
  const groups = ['chest', 'lats', 'midback', 'delt_m', 'delt_r', 'biceps', 'triceps', 'quads', 'hams', 'glutes', 'calves', 'abs'];
  sheet(`<h2>Упражнение</h2><input class="in" id="exq" placeholder="Поиск: жим, присед, бабочка..." data-in="exq" style="margin:10px 0">
    <div class="chips" id="exm">${groups.map(m => `<button class="chip" data-a="exM" data-k="${m}">${MN[m]}</button>`).join('')}</div><div id="exl" style="margin-top:6px"></div>`, () => { setTimeout(() => { if (!$('#exl')) S.pickCb = null; }, 400); });
  exList();
}
function exList() {
  const L = searchEx($('#exq')?.value || '', S.pickM);
  $('#exl').innerHTML = L.map(e => `<div class="li" data-a="exPick" data-k="${e.id}"><button class="ib" style="width:34px;height:34px;flex:none" data-a="exInfo" data-k="${e.id}">ⓘ</button><div class="sp"><b>${esc(e.ru)}</b><div class="xs mu">${Object.keys(e.m).filter(k => e.m[k] >= 1).map(k => MN[k]).join(', ')}${S.recs[e.id] ? ` · рекорд ${nf(S.recs[e.id].w, 1)}×${S.recs[e.id].reps}` : ''}</div></div>${IC.plus}</div>`).join('') || '<div class="empty">Не нашёл. Попробуй другое слово</div>';
}
A.exInfo = el => {
  const e = EX[el.dataset.k]; if (!e) return;
  const roles = [[1, 'основная', '#ff7a2a'], [0.5, 'помогает', '#ffc107'], [0.25, 'стабилизирует', '#3d8bff']];
  const keep = S.pickCb ? { cb: S.pickCb, m: S.pickM } : null;
  sheet(`<h2>${esc(e.ru)}</h2><div class="xs mu" style="margin:4px 0">${esc(e.en || '')}</div>
    <div id="mini" style="height:330px;margin:4px -16px;position:relative"></div>
    ${roles.map(([k, n, c]) => { const ms = Object.keys(e.m).filter(m => e.m[m] == k); return ms.length ? `<div class="row" style="margin:6px 0"><span class="dot" style="background:${c}"></span><span class="sm" style="width:110px;font-weight:700">${n}</span><span class="sm mu sp">${ms.map(m => MN[m]).join(', ')}</span></div>` : ''; }).join('')}
    ${S.recs[e.id] ? `<div class="hint up">Твой рекорд: ${nf(S.recs[e.id].w, 1)}×${S.recs[e.id].reps} (≈${nf(S.recs[e.id].e1rm)} кг)</div>` : ''}
    ${S.w && !keep ? `<button class="b p w" style="margin-top:10px" data-a="addEx" data-k="${e.id}">${IC.plus} В тренировку</button>` : ''}`, () => { S.mini?.dispose(); S.mini = null; if (keep) setTimeout(() => pickEx(keep.cb), 300); });
  setTimeout(() => {
    const box = $('#mini'); if (!box) return;
    try {
      S.mini = createBody(box, { autoRotate: true, dist: 3.1 });
      const map = {}; for (const m of MUSCLES) { const k = e.m[m] || 0; map[m] = k >= 1 ? { color: '#ff7a2a', emit: 0.35, glowColor: '#ff9a3a', pulse: { f: 0.9, a: 1.8, g: 0.8 }, wave: 1 } : k >= 0.5 ? { color: '#ffc107', emit: 0.25, glowColor: '#ffd36a', pulse: { f: 0.6, a: 1, g: 0.35 } } : k > 0 ? { color: '#3d8bff', emit: 0.2, pulse: { f: 0.4, a: 0.6, g: 0.15 } } : { color: '#262b3c', emit: 0.04 }; }
      S.mini.paint(map);
      const back = ['lats', 'midback', 'traps', 'delt_r', 'triceps', 'lowback', 'glutes', 'hams', 'calves', 'glute_med'].reduce((a, m) => a + (e.m[m] || 0), 0), front = Object.keys(e.m).reduce((a, m) => a + e.m[m], 0) - back;
      if (back > front) S.mini.view('back');
    } catch (er) { box.innerHTML = '<div class="empty">3D недоступно</div>'; }
  }, 260);
};
A.exM = el => { S.pickM = S.pickM == el.dataset.k ? null : el.dataset.k; document.querySelectorAll('#exm .chip').forEach(c => c.classList.toggle('on', c.dataset.k == S.pickM)); exList(); };
A.exPick = el => { const cb = S.pickCb; closeSheet(true); cb && cb(el.dataset.k); };

// ---------- разбор записи «как в чате» ----------
// «жим 80 на 8 три подхода», «присед 100 5х5», «подтягивания 10 8 7», «85 на 6» (продолжение прошлого упражнения)
const NUMW = { 'один': 1, 'одна': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10, 'двенадцать': 12, 'пятнадцать': 15, 'двадцать': 20 };
const rep = (n, w, r) => Array(Math.max(1, Math.min(n, 20))).fill(0).map(() => ({ w, reps: r }));
function parseNums(src, isBw) {
  let s = ' ' + src.replace(/[×*]/g, 'x').replace(/(\d)\s*[xх]\s*(\d)/g, '$1x$2') + ' ', m;
  if ((m = s.match(/(\d+(?:\.\d+)?)x(\d+)x(\d+)/))) return rep(+m[3], +m[1], +m[2]);
  let nS = 0;
  if ((m = s.match(/(\d+)\s*(подход|сет)/))) { nS = +m[1]; s = s.replace(m[0], ' '); }
  if ((m = s.match(/(\d+(?:\.\d+)?)\s+(\d+)x(\d+)/)) && +m[1] > +m[2]) return rep(+m[2], +m[1], +m[3]);
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(x|на|по)\s*(\d+)/))) {
    const a = +m[1], b = +m[3];
    if (isBw && a <= 6 && !nS) return rep(a, 0, b);                       // «подтягивания 3 по 10»
    const rest = (s.slice(s.indexOf(m[0]) + m[0].length).match(/\d+/g) || []).map(Number).filter(r => r <= 50);
    if (!nS && rest.length) return [{ w: a, reps: b }, ...rest.map(r => ({ w: a, reps: r }))]; // «80 на 8 8 7»
    return rep(nS || 1, a, b);
  }
  const ns = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!ns.length) return [];
  if (ns.length == 1) return rep(nS || 1, 0, ns[0]);
  if (ns[0] > 20 && ns.slice(1).every(r => r <= 50)) return nS && ns.length == 2 ? rep(nS, ns[0], ns[1]) : ns.slice(1).map(r => ({ w: ns[0], reps: r }));
  return ns.map(r => ({ w: 0, reps: r }));
}
function parseLog(txt, lastEx) {
  let t = norm(txt).replace(/(\d),(\d)/g, '$1.$2');
  for (const [w, n] of Object.entries(NUMW)) t = t.replace(new RegExp('(^|[\\s,])' + w + '(?=[\\s,]|$)', 'g'), '$1' + n);
  const raw = []; let carry = null;
  for (let part of t.split(/[\n;,]+|\s+(?:и|потом|затем|дальше)\s+(?=\D)/)) {
    part = part.replace(/(\d)\s*(кг|kg|килограмм[а-я]*)/g, '$1').replace(/(^|\s)(сделал[а-я]*|делал[а-я]*|еще|потом|затем|дальше|теперь|весом|вес|с|раз[а]?|повтор[а-я]*)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!part) continue;
    const i = part.search(/\d/);
    if (i < 0) { carry = { name: part, ex: findEx(part) }; raw.push({ ...carry, sets: [], only: 1 }); continue; }
    const name = part.slice(0, i).replace(/\s(на|по|x|х)\s*$/, '').trim();
    if (name.length >= 2) carry = { name, ex: findEx(name) };
    const ex = carry ? carry.ex : lastEx;
    raw.push({ name: carry ? carry.name : (lastEx ? exName(lastEx) : ''), ex, sets: parseNums(part.slice(i), (EX[ex]?.bw || 0) > 0) });
    if (ex) lastEx = ex;
  }
  const out = [];
  for (const x of raw) {
    const p = out[out.length - 1];
    if (p && p.name == x.name && p.ex == x.ex) { p.sets.push(...x.sets); continue; }
    if (x.only && x.ex) { out.push({ name: x.name, ex: x.ex, sets: [] }); continue; }
    out.push({ name: x.name, ex: x.ex, sets: x.sets });
  }
  return out.filter((x, k) => x.sets.length || !(x.ex && out[k + 1]?.ex == x.ex));
}
// подсказки, если название не узнали: по мышце из текста («задний бицепс» → бицепс бедра)
const MW = [[/бицепс бедра|задн[а-я]* бицепс|задн[а-я]* поверхн|бицепс ног/, 'hams'], [/трицепс/, 'triceps'], [/бицепс/, 'biceps'], [/груд/, 'chest'], [/широч|спин/, 'lats'], [/дельт|плеч/, 'delt_m'], [/квадр|передн[а-я]* поверхн/, 'quads'], [/ягод/, 'glutes'], [/икр|голен/, 'calves'], [/пресс/, 'abs'], [/предплеч/, 'forearm'], [/трапец/, 'traps'], [/ног/, 'quads']];
function sugFor(q) {
  q = norm(q);
  const L = searchEx(q.replace(/\d.*$/, '')).slice(0, 4).map(e => e.id);
  if (L.length) return L;
  const hit = MW.find(([re]) => re.test(q)); if (!hit) return [];
  const iso = /разгиб|сгиб|свед|развод|подъ[её]м|махи/.test(q);
  return searchEx('', hit[1]).sort((a, b) => (iso ? (a.kind == 'isolation' ? -1 : 0) - (b.kind == 'isolation' ? -1 : 0) : 0)).slice(0, 4).map(e => e.id);
}
// для старого окна «Тренировка текстом»
function localParse(txt) { const r = parseLog(txt, null); return r.every(x => x.sets.length) ? r : []; }

// записать разобранное в текущую тренировку
function logToWorkout(items) {
  if (!S.w) S.w = { id: uuid(), started_at: new Date().toISOString(), name: 'Свободная тренировка', items: [], log: [] };
  S.w.log = S.w.log || [];
  const undo = [], done = [], now = Date.now();
  items.forEach((x, k) => {
    let i = S.w.items.findIndex(it => it.ex == x.ex), created = false;
    if (i < 0) { S.w.items.push({ ex: x.ex, sets: [], sg: suggest(x.ex) }); i = S.w.items.length - 1; created = true; }
    const it = S.w.items[i], from = it.sets.length;
    // пустые незаполненные подходы из программы заполняем первыми
    let fill = it.sets.findIndex(st => !st.done);
    x.sets.forEach((st, j) => {
      const row = { w: st.w, reps: st.reps, done: true, kind: 'work', at: new Date(now - (x.sets.length - 1 - j) * 1000).toISOString() };
      if (fill >= 0 && fill < it.sets.length && !it.sets[fill].done) { it.sets[fill] = row; fill = it.sets.findIndex(s2 => !s2.done); }
      else it.sets.push(row);
    });
    undo.push({ ex: x.ex, created, before: from, snap: JSON.parse(JSON.stringify(it.sets)) });
    const pr = S.recs[x.ex], best = Math.max(...x.sets.map(st => e1rm((+st.w || 0) + (EX[x.ex]?.bw || 0) * bw(), st.reps)));
    done.push(`✓ ${exName(x.ex)}: ${x.sets.map(st => (st.w ? nf(st.w, 1) + '×' : '') + st.reps).join(', ')}${pr && best > pr.e1rm + 0.05 ? ' 🏆 рекорд!' : ''}`);
  });
  return { undo, text: done.join('\n') };
}
// ---------- добавление еды ----------
function addFoodSheet(meal, mode) {
  S.fMeal = meal;
  const recent = [...new Map(S.food.slice().reverse().map(f => [f.name, f])).values()].slice(0, 8);
  sheet(`<div class="row"><h2 class="sp">${MEALS.find(m => m[0] == meal)[1]}</h2></div>
    <div class="chips" style="margin:10px 0">${[['s', 'Поиск'], ['photo', 'Фото'], ['text', 'Словами'], ['man', 'Вручную']].map(([k, n]) => `<button class="chip ${(mode || 's') == k ? 'on' : ''}" data-a="fMode" data-k="${k}">${n}</button>`).join('')}</div>
    <div id="fbox"></div>`);
  S.fRecent = recent; fMode(mode || 's');
}
function fMode(k) {
  document.querySelectorAll('.sheet .chips .chip').forEach(c => c.classList.toggle('on', c.dataset.k == k));
  const b = $('#fbox');
  if (k == 's') { b.innerHTML = `<input class="in" id="fq" placeholder="Курица, плов, творог..." data-in="fq"><div id="fl" style="margin-top:6px"></div>`; fList(); setTimeout(() => $('#fq')?.focus(), 250); }
  if (k == 'photo') b.innerHTML = `<label class="b v w" style="height:120px;flex-direction:column">${IC.cam}<span>Сфотографировать тарелку или этикетку</span><input type="file" accept="image/*" capture="environment" class="hide" data-in="fphoto"></label><input class="in" id="fhint" placeholder="Подсказка: например «плов, большая порция»" style="margin-top:10px"><div id="fres"></div>`;
  if (k == 'text') b.innerHTML = `<textarea class="in" id="ftx" rows="3" placeholder="200 г курицы, тарелка риса и салат"></textarea><button class="b v w" style="margin-top:10px" data-a="fText">Посчитать</button><div id="fres"></div>`;
  if (k == 'man') b.innerHTML = `<input class="in" id="mn" placeholder="Название"><div class="grid2"><div><label class="l">Ккал</label><input class="in" id="mk" inputmode="decimal"></div><div><label class="l">Белок, г</label><input class="in" id="mp" inputmode="decimal"></div><div><label class="l">Жиры, г</label><input class="in" id="mf" inputmode="decimal"></div><div><label class="l">Углеводы, г</label><input class="in" id="mc" inputmode="decimal"></div><div><label class="l">из них сахар, г</label><input class="in" id="ms" inputmode="decimal"></div></div><button class="b p w" style="margin-top:12px" data-a="fMan">Добавить</button>`;
}
A.fMode = el => fMode(el.dataset.k);
A.fTime = el => {
  const f = S.food.find(x => x.id == el.dataset.k); if (!f) return;
  const t = new Date(f.at || Date.now()), hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  sheet(`<h2>Когда съел?</h2><div class="mu sm" style="margin:6px 0 10px">${esc(f.name)}. От времени зависит, пойдёт сахар в мышцы или в кровь.</div><input class="in" type="time" id="ftm" value="${hm}" style="font-size:22px;text-align:center">
    <div class="chips" style="margin-top:10px">${[['-30 мин', -30], ['-1 ч', -60], ['-2 ч', -120], ['-3 ч', -180]].map(([n, m]) => `<button class="chip" data-a="fTimeQ" data-m="${m}">${n}</button>`).join('')}</div>
    <button class="b p w" style="margin-top:12px" data-a="fTimeSave" data-k="${f.id}">Сохранить</button>`);
};
A.fTimeQ = el => { const d = new Date(Date.now() + +el.dataset.m * 6e4); $('#ftm').value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
A.fTimeSave = async el => {
  const f = S.food.find(x => x.id == el.dataset.k), [h, m] = $('#ftm').value.split(':').map(Number); if (isNaN(h)) return;
  const d = new Date(f.d + 'T00:00:00'); d.setHours(h, m, 0, 0); const at = d.toISOString();
  try { if (!DEMO) { const { error } = await sb.from('fit_food_log').update({ at }).eq('id', f.id); if (error) throw error; } f.at = at; closeSheet(true); render(); toast('Время обновлено'); } catch (e) { toast(e.message, 1); }
};
function fList() {
  const q = ($('#fq')?.value || '').trim().toLowerCase();
  let L;
  if (!q) L = S.fRecent.map(f => ({ rec: f }));
  else L = FOODS.map(f => { const n = f.ru.toLowerCase(); return [f, n.startsWith(q) ? 3 : n.includes(q) ? 2 : (f.en || '').toLowerCase().includes(q) ? 1 : 0]; }).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => ({ f: x[0] }));
  $('#fl').innerHTML = (!q && L.length ? '<div class="xs mu" style="margin:6px 0">Недавние</div>' : '') + (L.map(x => x.f ? `<div class="li" data-a="fPick" data-k="${x.f.id}"><div class="sp"><b>${esc(x.f.ru)}</b><div class="xs mu">на 100 г: ${x.f.k} ккал · Б ${x.f.p} · Ж ${x.f.f} · У ${x.f.c}${x.f.gi ? ` · ГИ ${x.f.gi}` : ''}</div></div>${IC.plus}</div>`
    : `<div class="li" data-a="fRe" data-k="${esc(x.rec.id)}"><div class="sp"><b>${esc(x.rec.name)}</b><div class="xs mu">${nf(x.rec.g)} г · ${nf(x.rec.kcal)} ккал</div></div>${IC.plus}</div>`).join('') || (q ? '<div class="empty sm">Нет в базе. Попробуй «Словами» или «Вручную»</div>' : '<div class="mu sm">Начни вводить название</div>'));
}
A.fPick = el => {
  const f = FOODS.find(x => x.id == el.dataset.k);
  $('#fbox').innerHTML = `<h3>${esc(f.ru)}</h3><div class="xs mu" style="margin:4px 0 10px">${f.k} ккал · Б ${f.p} · Ж ${f.f} · У ${f.c} на 100 г</div>
    <label class="l">Сколько грамм</label><div class="row"><input class="in" id="fg" inputmode="decimal" value="${f.pg || 100}" data-in="fg" data-k="${f.id}"><button class="b s" data-a="fPortion" data-v="${f.pg}">${esc(f.pn || 'порция')} (${f.pg} г)</button></div>
    <div class="hint" id="fcalc" style="margin-top:10px"></div><button class="b p w" style="margin-top:10px" data-a="fAdd" data-k="${f.id}">Добавить</button>`;
  fCalc(f.id);
};
A.fPortion = el => { $('#fg').value = el.dataset.v; fCalc($('#fg').dataset.k); };
function fCalc(id) { const f = FOODS.find(x => x.id == id), g = +$('#fg').value.replace(',', '.') || 0; $('#fcalc').textContent = `${nf(f.k * g / 100)} ккал · Б ${nf(f.p * g / 100, 1)} · Ж ${nf(f.f * g / 100, 1)} · У ${nf(f.c * g / 100, 1)} · сахар ${nf((f.s || 0) * g / 100, 1)} г${f.gi ? ` · ГИ ${f.gi} (${f.gi >= 70 ? 'высокий' : f.gi >= 55 ? 'средний' : 'низкий'})` : ''}`; }
A.fAdd = async el => { const f = FOODS.find(x => x.id == el.dataset.k), g = +$('#fg').value.replace(',', '.') || 0; if (!g) return; await addRows([{ name: f.ru, g, kcal: r1(f.k * g / 100), p: r1(f.p * g / 100), f: r1(f.f * g / 100), c: r1(f.c * g / 100), s: r1((f.s || 0) * g / 100), gi: f.gi || 0, src: 'base', food_id: f.id }]); };
A.fRe = async el => { const f = S.food.find(x => x.id == el.dataset.k); await addRows([{ name: f.name, g: f.g, kcal: f.kcal, p: f.p, f: f.f, c: f.c, s: f.s || 0, gi: f.gi || 0, src: 'repeat', food_id: f.food_id }]); };
A.fMan = async () => { const n = $('#mn').value.trim(), k = +$('#mk').value.replace(',', '.'); if (!n || !k) return toast('Название и калории', 1); await addRows([{ name: n, g: 0, kcal: k, p: +$('#mp').value.replace(',', '.') || 0, f: +$('#mf').value.replace(',', '.') || 0, c: +$('#mc').value.replace(',', '.') || 0, s: +$('#ms').value.replace(',', '.') || 0, gi: 0, src: 'manual' }]); };
A.fText = async el => { const t = $('#ftx').value.trim(); if (t.length < 3) return; el.disabled = true; el.textContent = 'Считаю...'; try { aiFoodResult(await DB.kbju({ text: t })); } catch (e) { toast(e.message, 1); } el.disabled = false; el.textContent = 'Посчитать'; };
const HARAM = /свинин|бекон|ветчин|сало\b|вин[оа]\b|пиво|коньяк|водк|ликёр|ликер|ром\b|желатин|кармин|e120|e441|e542/i;
function aiFoodResult(r) {
  if (!r?.food) { $('#fres').innerHTML = '<div class="empty">Не вижу тут еды. Попробуй ещё раз</div>'; return; }
  S.fAi = r.items;
  const warn = P().halal && r.items.some(i => HARAM.test(i.name));
  $('#fres').innerHTML = `<h3 style="margin-top:12px">${esc(r.title || 'Что нашёл')}</h3>${r.descr ? `<div class="xs mu">${esc(r.descr)}</div>` : ''}
    ${warn ? '<div class="hint dn">🕌 В составе может быть не халяль - проверь.</div>' : ''}
    ${r.items.map((i, k) => `<div class="fi"><input type="checkbox" checked id="fa${k}"><div class="sp">${esc(i.name)}<div class="xs mu">${nf(i.kcal)} ккал · Б ${nf(i.p, 1)}</div></div><input class="in" style="width:80px;height:38px;text-align:center" inputmode="numeric" id="fag${k}" value="${i.g}"><span class="xs mu">г</span></div>`).join('')}
    ${r.note ? `<div class="xs mu" style="margin-top:6px">${esc(r.note)}</div>` : ''}<button class="b p w" style="margin-top:12px" data-a="fAiAdd">Добавить отмеченное</button>`;
}
A.fAiAdd = async () => { const rows = []; S.fAi.forEach((i, k) => { if (!$('#fa' + k).checked) return; const g = +$('#fag' + k).value || i.g, m = i.g ? g / i.g : 1; const sg = guessSG(i.name, i.c * m, g); rows.push({ name: i.name, g, kcal: r1(i.kcal * m), p: r1(i.p * m), f: r1(i.f * m), c: r1(i.c * m), s: sg.s, gi: sg.gi, src: 'ai' }); }); if (rows.length) await addRows(rows); };
async function addRows(rows) { try { await DB.addFood(rows.map(r => ({ ...r, meal: S.fMeal }))); closeSheet(true); render(); toast('Добавлено'); vib(15); } catch (e) { toast(e.message, 1); } }
async function photoToData(file) {
  const img = await createImageBitmap(file); const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// ---------- редактор программы ----------
function editProg(p) {
  S.ep = p;
  const draw = () => {
    const sh = $('#sh'); if (!sh) return;
    sh.innerHTML = `<div class="grab"></div><h2>Программа</h2><input class="in" style="margin:10px 0" value="${esc(p.name)}" data-in="epName">
    ${p.days.map((d, i) => `<div class="card" style="padding:12px"><div class="row"><input class="in" style="height:40px" value="${esc(d.name)}" data-in="epDay" data-i="${i}"><button class="ib" data-a="epDelDay" data-i="${i}">${IC.x}</button></div>
      ${d.items.map((it, j) => `<div class="row" style="margin-top:8px"><div class="sp sm"><b>${esc(exName(it.ex))}</b></div><input class="in" style="width:46px;height:38px;text-align:center;padding:0" inputmode="numeric" value="${it.sets}" data-in="epIt" data-i="${i}" data-j="${j}" data-f="sets" title="подходы"><span class="xs mu">×</span><input class="in" style="width:62px;height:38px;text-align:center;padding:0" value="${it.rmin}-${it.rmax}" data-in="epIt" data-i="${i}" data-j="${j}" data-f="rr"><input class="in" style="width:58px;height:38px;text-align:center;padding:0" inputmode="decimal" placeholder="кг" value="${it.w || ''}" data-in="epIt" data-i="${i}" data-j="${j}" data-f="w"><button class="ib" style="width:30px;height:30px" data-a="epDelIt" data-i="${i}" data-j="${j}">${IC.x}</button></div>`).join('')}
      <button class="b s" style="margin-top:8px" data-a="epAddIt" data-i="${i}">${IC.plus} Упражнение</button></div>`).join('')}
    <button class="b w" data-a="epAddDay">${IC.plus} День</button>
    <div class="xs mu" style="margin:8px 0">Подходы × диапазон повторов × рабочий вес. Вес обновится сам после каждой тренировки.</div>
    <div class="grid2"><button class="b" style="color:var(--red)" data-a="epDel">${p.id ? 'Удалить' : 'Отмена'}</button><button class="b p" data-a="epSave">Сохранить</button></div>`;
  };
  S.epDraw = draw;
  sheet(''); draw();
}
A.epAddDay = () => { S.ep.days.push({ name: 'День ' + (S.ep.days.length + 1), items: [] }); S.epDraw(); };
A.epDelDay = el => { S.ep.days.splice(+el.dataset.i, 1); S.epDraw(); };
A.epDelIt = el => { S.ep.days[+el.dataset.i].items.splice(+el.dataset.j, 1); S.epDraw(); };
A.epAddIt = el => { const i = +el.dataset.i, p = S.ep; pickEx(ex => { const [a, b] = repRange(ex); p.days[i].items.push({ ex, sets: 3, rmin: a, rmax: b }); editProg(p); }); };
A.epSave = async el => { el.disabled = true; try { await DB.saveProg(S.ep); closeSheet(true); render(); toast('Программа сохранена'); } catch (e) { toast(e.message, 1); el.disabled = false; } };
A.epDel = async () => { if (S.ep.id) { S.ep.archived = true; await DB.saveProg(S.ep).catch(e => toast(e.message, 1)); } closeSheet(true); render(); };

// ---------- отдых между подходами ----------
let restTick = 0, actx = null;
function startRest(sec) {
  if (window.Notification && Notification.permission == 'default' && !LS.get('askedN', 0)) { LS.set('askedN', 1); Notification.requestPermission().catch(() => { }); }
  S.rest = { end: Date.now() + sec * 1000, total: sec };
  let el = $('#rest'); if (!el) { el = document.createElement('div'); el.id = 'rest'; el.className = 'rest'; document.body.appendChild(el); }
  el.innerHTML = `<b id="rt"></b><div class="sp"><div class="xs mu">Отдых</div><div class="bar gold" style="margin-top:4px"><i id="rb"></i></div></div><button class="b s" data-a="restAdd">+30</button><button class="b s" data-a="restStop">Хватит</button>`;
  clearInterval(restTick); restTick = setInterval(restUpd, 250); restUpd();
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch { }
}
function restUpd() {
  if (!S.rest) return;
  const left = Math.max(0, S.rest.end - Date.now());
  const rt = $('#rt'), rb = $('#rb'); if (rt) rt.textContent = `${Math.floor(left / 6e4)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if (rb) rb.style.width = (100 - left / (S.rest.total * 1000) * 100) + '%';
  if (left <= 0) { beep(); vib([200, 100, 200]); stopRest(); toast('Отдых закончен - следующий подход!'); if (document.hidden && window.SHApp) { try { SHApp.notify('Отдых закончен', 'Следующий подход!'); } catch { } } else if (document.hidden && window.Notification?.permission == 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('Отдых закончен', { body: 'Следующий подход!', tag: 'fit-rest', icon: 'icon-192.png', vibrate: [200, 100, 200] })).catch(() => { }); }
}
function beep() { try { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.6); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.6); } catch { } }
function stopRest() { S.rest = null; clearInterval(restTick); $('#rest')?.remove(); }
A.restAdd = () => { if (S.rest) { S.rest.end += 30000; S.rest.total += 30; } };
A.restStop = () => stopRest();

// ---------- итог тренировки ----------
function showResult(res, nsets) {
  if (!res) { S.tab = 'train'; render(); return; }
  const ups = (res.muscles || []).filter(m => m.lv > m.lv0), heroUp = res.hero > res.hero0;
  S.flashAfter = (res.muscles || []).slice(0, 8).map(m => m.m);
  S.tab = 'hero'; render();
  sheet(`<div style="text-align:center"><div class="xs mu">Тренировка завершена · ${nsets} подходов</div><div class="big pop" style="font-size:52px;margin:6px 0" data-cnt="${res.xp}" data-pre="+" data-post=" XP">+0 XP</div>
    ${heroUp ? `<div class="lvup pop" style="font-size:16px">⚡ ГЕРОЙ ДОСТИГ ${res.hero} УРОВНЯ</div>` : ''}</div>
    ${ups.length ? `<div class="card" style="border-color:#ffb02066"><h3>Новый уровень</h3>${ups.map(m => `<div class="res-m"><span class="dot" style="background:${lvColor(m.lv)[1]}"></span><span class="sp">${MN[m.m]}</span><span class="lvup">${m.lv0} → ${m.lv}</span></div>`).join('')}</div>` : ''}
    ${(res.prs || []).length ? `<div class="card"><h3>🏆 Личные рекорды</h3>${res.prs.map(p => `<div class="res-m"><span class="sp">${esc(exName(p.ex))}</span><b>${nf(p.w, 1)}×${p.reps}</b><span class="xs mu">≈${nf(p.e1rm)} кг</span></div>`).join('')}</div>` : ''}
    <div class="card"><h3>Опыт по мышцам</h3>${(res.muscles || []).slice(0, 10).map(m => `<div class="res-m"><span class="sp sm">${MN[m.m]}</span><div class="bar gold" style="width:40%"><i style="width:${Math.min(100, m.gain / Math.max(...res.muscles.map(x => x.gain)) * 100)}%"></i></div><b class="sm" style="width:46px;text-align:right">+${nf(m.gain)}</b></div>`).join('')}</div>
    <div class="grid2"><button class="b" data-a="shareCard">${IC.share} Поделиться</button><button class="b p" data-a="closeSh">Круто!</button></div>`);
  vib([30, 60, 30, 60, 80]);
}

// ---------- карточка героя для сторис ----------
async function shareCard() {
  if (!S.body3d) { S.tab = 'hero'; render(); await new Promise(r => setTimeout(r, 800)); }
  const shot = S.body3d?.shot(); if (!shot) return;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d');
  const g = x.createRadialGradient(540, 700, 50, 540, 900, 1100); g.addColorStop(0, '#232a52'); g.addColorStop(1, '#07080d'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  const img = new Image(); img.src = shot; await img.decode();
  const k = Math.min(1000 / img.width, 1250 / img.height), iw = img.width * k, ih = img.height * k; x.drawImage(img, (1080 - iw) / 2, 250, iw, ih);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 64px Unbounded, sans-serif'; x.fillText('SUPERHERO', 540, 150);
  x.fillStyle = '#ffb020'; x.font = '800 44px Unbounded, sans-serif'; x.fillText(`${RANKS[rankIdx()].toUpperCase()} · УРОВЕНЬ ${heroLevel()}`, 540, 1580);
  x.fillStyle = '#eef1ff'; x.font = '700 52px Manrope, sans-serif'; x.fillText(S.prof?.nick || 'Герой', 540, 1660);
  const top = MUSCLES.map(m => [m, S.stats[m]?.level || 1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  x.fillStyle = '#8c93ad'; x.font = '600 36px Manrope, sans-serif'; x.fillText(top.map(([m, l]) => `${MN[m]} ${l}`).join('  ·  '), 540, 1740);
  x.fillStyle = '#5a6080'; x.font = '600 30px Manrope, sans-serif'; x.fillText('degirmen-navoi.kz/fit', 540, 1850);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'superhero.png', { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Мой герой в Superhero' }); return; } } catch (e) { if (e.name == 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'superhero.png'; a.click();
}

// ---------- события ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const f = A[el.dataset.a]; if (f) f(el, e);
});
document.addEventListener('input', e => {
  const el = e.target, k = el.dataset.in; if (!k) return;
  if (k == 'set') { const s = S.w.items[+el.dataset.i].sets[+el.dataset.j]; const v = el.value.replace(',', '.'); s[el.dataset.f] = v === '' ? null : +v; saveW(); }
  if (k == 'ob') { S.ob.d[el.dataset.k] = el.value; LS.set('ob', S.ob); }
  if (k == 'obc') { S.ob.d.calib = S.ob.d.calib || {}; const c = S.ob.d.calib[el.dataset.k] = S.ob.d.calib[el.dataset.k] || {}; c[el.dataset.f] = el.value.replace(',', '.'); LS.set('ob', S.ob); }
  if (k == 'exq') exList();
  if (k == 'fq') fList();
  if (k == 'fg') fCalc(el.dataset.k);
  if (k == 'epName') S.ep.name = el.value;
  if (k == 'epDay') S.ep.days[+el.dataset.i].name = el.value;
  if (k == 'epIt') { const it = S.ep.days[+el.dataset.i].items[+el.dataset.j], v = el.value; if (el.dataset.f == 'sets') it.sets = +v || 3; if (el.dataset.f == 'w') it.w = +v.replace(',', '.') || null; if (el.dataset.f == 'rr') { const m = v.match(/(\d+)\D+(\d+)/); if (m) { it.rmin = +m[1]; it.rmax = +m[2]; } } }
});
document.addEventListener('change', async e => {
  const el = e.target; if (el.dataset.in != 'fphoto' || !el.files[0]) return;
  $('#fres').innerHTML = '<div class="loader" style="min-height:120px"><div class="spin"></div><div class="xs">ИИ смотрит на еду...</div></div>';
  try { const img = await photoToData(el.files[0]); aiFoodResult(await DB.kbju({ image: img, hint: $('#fhint')?.value || '' })); } catch (er) { $('#fres').innerHTML = ''; toast(er.message, 1); }
});
document.addEventListener('keydown', e => { if (e.key == 'Enter' && e.target.dataset.k13) { e.preventDefault(); A[e.target.dataset.k13](e.target); } });
setInterval(() => { const t = $('#wtime'); if (t && S.w) t.textContent = `${Math.floor((Date.now() - new Date(S.w.started_at)) / 6e4)} мин · ${S.w.items.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0)} подходов`; }, 30000);

// ---------- демо-режим ----------
function demoLoad() {
  if (S.prof) return;
  S.user = { id: 'demo' };
  S.prof = { nick: 'Демо-герой', data: { sex: 'm', by: 2007, height: 178, weight: 77, tw: 72, goal: 'cut', days: 3, exp: 'mid', halal: true }, xp: 0, rank: 0 };
  const now = Date.now(), day = 864e5, plan = [['bench', 80, 8], ['incline_bench', 60, 10], ['lateral_raise', 12, 14], ['pushdown_rope', 30, 12], ['row', 70, 10], ['lat_pulldown', 65, 10], ['barbell_curl', 35, 10], ['squat', 100, 6], ['rdl', 90, 8], ['calf_standing', 80, 12]];
  const days = [[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]];
  let k = 0;
  for (let d = 18.6; d >= 0.1; d -= 2.3) {
    const id = uuid(), at = now - d * day, items = days[k % 3]; k++;
    S.works.unshift({ id, started_at: new Date(at).toISOString(), name: ['Верх: жим', 'Спина', 'Ноги'][(k - 1) % 3], xp: 0 });
    items.forEach((i, ii) => { const [ex, w, r] = plan[i], prog = Math.floor((20 - d) / 5) * (EX[ex]?.step || 2.5); for (let s = 0; s < 3; s++) S.sets.push({ workout_id: id, ex, w: w + prog, reps: r - (s == 2 ? 1 : 0), kind: 'work', at: new Date(at + (ii * 3 + s) * 1.6e5).toISOString() }); });
  }
  for (let d = 18; d >= 0; d--) { S.body.push({ d: addDays(dkey(), -d), weight: r1(78.4 - (18 - d) * 0.07 + Math.sin(d) * 0.3) }); }
  ['br', 'lu', 'di'].forEach((m, i) => { const f = FOODS[[60, 120, 200][i] % FOODS.length]; S.food.push({ id: uuid(), d: dkey(), meal: m, name: f.ru, g: f.pg, kcal: r1(f.k * f.pg / 100), p: r1(f.p * f.pg / 100), f: r1(f.f * f.pg / 100), c: r1(f.c * f.pg / 100), s: r1((f.s || 0) * f.pg / 100), gi: f.gi || 0, at: new Date(Date.now() - (3 - i) * 3 * 36e5).toISOString() }); });
  demoCalc();
}
function demoCalc() {
  const acc = {}, best = {}; let bonus = 0;
  const ws = [...S.works].sort((a, b) => a.started_at < b.started_at ? -1 : 1);
  for (const w of ws) {
    const cnt = {}; let wxp = 0, ne = 0;
    for (const s of S.sets.filter(x => x.workout_id == w.id)) {
      const ex = EX[s.ex]; if (!ex) continue;
      const ew = +s.w + ex.bw * bw(), e1 = e1rm(ew, s.reps); s.e1rm = e1;
      if (isEff(s)) { ne++; const pb = best[s.ex] || 0, f = !pb ? 1 : ew / pb >= 0.75 ? 1.2 : ew / pb >= 0.6 ? 1 : 0.8; for (const k in ex.m) { if ((cnt[k] || 0) < 10) { acc[k] = (acc[k] || 0) + 10 * ex.m[k] * f; cnt[k] = (cnt[k] || 0) + 1; wxp += 10 * ex.m[k] * f; } } }
      if (e1 > (best[s.ex] || 0)) { if (best[s.ex]) { bonus += 50; wxp += 50; } best[s.ex] = e1; S.recs[s.ex] = { ex: s.ex, e1rm: r1(e1), w: s.w, reps: s.reps, at: s.at }; }
    }
    if (ne >= 3) { bonus += 30; wxp += 30; }
    w.xp = Math.round(wxp);
  }
  // в демо даём герою стартовые уровни, чтобы цвета было видно
  const base = { chest: 3200, chest_up: 2100, delt_f: 2400, delt_m: 1300, triceps: 1900, biceps: 1700, lats: 2600, midback: 1900, quads: 3600, glutes: 3400, hams: 1500, abs: 900, calves: 600, traps: 1500, lowback: 1600, forearm: 700, delt_r: 500 };
  let tot = bonus;
  for (const m of MUSCLES) { const x = (acc[m] || 0) + (base[m] || 150); tot += x; S.stats[m] = { muscle: m, xp: r1(x), level: lvlOf(x) }; }
  S.prof.xp = tot;
  let rk = 0, n = 0; for (const e of CALIB) if (best[e]) { const r = stdRatio(e, best[e] / bw()); if (r != null) { rk += r; n++; } } S.prof.rank = n ? rk / n : 0;
}
function demoSave(w) {
  const before = Object.fromEntries(MUSCLES.map(m => [m, { ...S.stats[m] }])), h0 = heroLevel(), r0 = { ...S.recs };
  S.works.unshift({ id: w.id, started_at: w.started_at, name: w.name, xp: 0 });
  S.sets.push(...w.sets.map(s => ({ ...s, workout_id: w.id })));
  demoCalc();
  const muscles = MUSCLES.map(m => ({ m, gain: r1(S.stats[m].xp - before[m].xp), lv0: before[m].level, lv: S.stats[m].level, xp: S.stats[m].xp })).filter(x => x.gain > 0).sort((a, b) => b.gain - a.gain);
  const prs = Object.values(S.recs).filter(r => r0[r.ex] && r.e1rm > r0[r.ex].e1rm);
  const res = { xp: S.works[0].xp, muscles, prs, hero0: h0, hero: heroLevel() };
  S.works[0].summary = res; return res;
}

// ---------- запуск ----------
async function boot() {
  try {
    const [ex, fd] = await Promise.all([fetch('data/exercises.json').then(r => r.json()), fetch('data/foods.json').then(r => r.json())]);
    EXL = ex; EX = Object.fromEntries(ex.map(e => [e.id, e])); FOODS = fd;
  } catch (e) { $('#app').innerHTML = '<div class="empty">Нет интернета для первого запуска. Подключись и обнови страницу.</div>'; return; }
  if (DEMO) { await DB.load(); S.anim = 'enter-r'; render(); return; }
  const c = LS.get('cache', null);
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null;
  if (S.user && c) { Object.assign(S, { prof: c.prof, stats: c.stats, recs: c.recs, works: c.works, sets: c.sets, progs: c.progs, food: c.food, body: c.body }); render(); }
  if (S.user) { try { await DB.load(); } catch (e) { if (!c) toast('Нет связи с сервером', 1); } }
  S.anim = 'enter-r'; render(); flushQ();
  sb.auth.onAuthStateChange(async (ev, ses) => {
    const was = S.user?.id; S.user = ses?.user || null;
    if (S.user && S.user.id != was) { try { await DB.load(); } catch { } render(); flushQ(); }
    if (!S.user && was) render();
  });
}
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => { });
boot();
