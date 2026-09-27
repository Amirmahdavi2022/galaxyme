// GalaxyChain: the one Durable Object that owns the shared chain.
// Every write (shares, blocks, payouts, sessions, payments) goes through here, so there is exactly one chain tip.
import { DurableObject } from 'cloudflare:workers';
import { makeMiner, thrFor, below, buildHeader, wordsToHex, rewardAt, rarityBits, hexToWords, starFrom } from './core.gen.js';
import GENESIS from '../app/genesis.json';

export const RULES = {
  SESSION_S: 300,          // a mining session lasts 5 minutes
  COOLDOWN_S: 3600,        // then 1 hour of rest
  BLOCK_TARGET_S: 240,     // the network aims for one block every 4 minutes of active mining
  E_MIN: 2 ** 27,          // floor for block difficulty (~5 min for one 450 kH/s phone)
  SHARE_TARGET_S: 20,      // each phone sends a share about every 20 s
  ES_MIN: 2 ** 18,
  ES_INIT: 2 ** 22,
  FINDER_CUT: 0.1,         // 10% to whoever finds the block, 90% split by work
  GRACE_S: 15,             // shares arriving this long after a session ends still count
  REFS_PER_RESET: 3,
  PRODUCTS: { skip30: { stars: 50, seconds: 1800, title: 'Skip 30 minutes' }, skip60: { stars: 100, seconds: 3600, title: 'Skip the full hour' } },
};

const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export class GalaxyChain extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // DEV_FAST shrinks difficulty for local tests only; it is never set in wrangler.toml
    this.R = env.DEV_FAST === '1' ? { ...RULES, E_MIN: 2 ** 16, ES_MIN: 2 ** 10, ES_INIT: 2 ** 12, SESSION_S: 40, COOLDOWN_S: 600, SHARE_TARGET_S: 3 } : RULES;
    this.recent = [];                 // [time, work] of accepted shares, for the hashrate estimate
    this.active = new Map();          // uid -> last share time
    ctx.blockConcurrencyWhile(async () => this.init());
  }

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      uid INTEGER PRIMARY KEY, name TEXT, miner TEXT, balance REAL DEFAULT 0, found INTEGER DEFAULT 0,
      created INTEGER, member_until INTEGER DEFAULT 0, session_end INTEGER DEFAULT 0, next_allowed INTEGER DEFAULT 0,
      es REAL, ref_by INTEGER, activated INTEGER DEFAULT 0, refs INTEGER DEFAULT 0, resets INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blocks (height INTEGER PRIMARY KEY, data TEXT, finder INTEGER, name TEXT, reward REAL, miners INTEGER, time INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS round (uid INTEGER PRIMARY KEY, work REAL, xn0 INTEGER, last_nonce INTEGER, last_at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS payments (charge TEXT PRIMARY KEY, uid INTEGER, product TEXT, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    if (!this.one('SELECT height FROM blocks WHERE height = 0')) {
      this.sql.exec('INSERT INTO blocks (height, data, finder, name, reward, miners, time) VALUES (0, ?, 0, ?, 0, 0, ?)', JSON.stringify(GENESIS), 'Genesis', GENESIS.time);
    }
    if (!this.meta('eb')) this.setMeta('eb', String(this.R.E_MIN));
  }

  // ---------- small helpers ----------
  one(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  all(q, ...a) { return this.sql.exec(q, ...a).toArray(); }
  meta(k) { const r = this.one('SELECT v FROM meta WHERE k = ?', k); return r ? r.v : null; }
  setMeta(k, v) { this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v); }
  tip() { const r = this.one('SELECT height, data FROM blocks ORDER BY height DESC LIMIT 1'); return JSON.parse(r.data); }
  eb() { return Number(this.meta('eb')); }

  async key() {
    if (!this._key) {
      const raw = await crypto.subtle.digest('SHA-256', enc.encode('galaxyme-job:' + this.env.BOT_TOKEN));
      this._key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    }
    return this._key;
  }
  async sign(job) {
    const body = [job.h, job.p, job.m, job.t, job.thr.join(','), job.sthr.join(','), job.xn.join(','), job.es].join('|');
    return hex(await crypto.subtle.sign('HMAC', await this.key(), enc.encode(body)));
  }

  async minerFor(uid) {
    return hex(await crypto.subtle.digest('SHA-256', enc.encode('galaxyme-miner:' + uid))).slice(0, 40);
  }

  async user(uid, name) {
    let u = this.one('SELECT * FROM users WHERE uid = ?', uid);
    if (!u) {
      const miner = await this.minerFor(uid);
      this.sql.exec('INSERT INTO users (uid, name, miner, created, es) VALUES (?, ?, ?, ?, ?)', uid, name || 'Miner', miner, now(), this.R.ES_INIT);
      u = this.one('SELECT * FROM users WHERE uid = ?', uid);
    } else if (name && name !== u.name) {
      this.sql.exec('UPDATE users SET name = ? WHERE uid = ?', name, uid);
      u.name = name;
    }
    return u;
  }

  view(u) {
    return {
      name: u.name, miner: u.miner, balance: u.balance, found: u.found, now: now(),
      sessionEnd: u.session_end, nextAllowed: u.next_allowed, resets: u.resets, refs: u.refs,
      refsPerReset: this.R.REFS_PER_RESET, memberUntil: u.member_until,
      rules: { session: this.R.SESSION_S, cooldown: this.R.COOLDOWN_S, products: this.R.PRODUCTS },
    };
  }

  async newJob(u) {
    const t = this.tip();
    const xn = crypto.getRandomValues(new Uint32Array(2));
    const es = Math.max(this.R.ES_MIN, u.es || this.R.ES_INIT);
    const eb = this.eb();
    const job = { h: t.height + 1, p: t.hash, m: u.miner, t: now(), thr: thrFor(eb), sthr: thrFor(es), xn: [xn[0], xn[1]], es, eb };
    job.sig = await this.sign(job);
    return job;
  }

  hashrate() {
    const cut = now() - 180;
    this.recent = this.recent.filter(r => r[0] >= cut);
    const work = this.recent.reduce((s, r) => s + r[1], 0);
    const span = this.recent.length ? Math.max(60, now() - this.recent[0][0]) : 180;
    return work / span;
  }
  activeCount() {
    const cut = now() - 60;
    for (const [k, t] of this.active) if (t < cut) this.active.delete(k);
    return this.active.size;
  }

  // ---------- RPC: account ----------
  async me(uid, name) { return this.view(await this.user(uid, name)); }

  async setMember(uid, until) { this.sql.exec('UPDATE users SET member_until = ? WHERE uid = ?', until, uid); }

  // called when the bot sees /start ref_<inviter> from someone brand new
  async registerReferral(uid, name, inviter) {
    if (inviter === uid || this.one('SELECT uid FROM users WHERE uid = ?', uid)) return { counted: false };
    if (!this.one('SELECT uid FROM users WHERE uid = ?', inviter)) return { counted: false };
    await this.user(uid, name);
    this.sql.exec('UPDATE users SET ref_by = ? WHERE uid = ?', inviter, uid);
    return { counted: true };
  }

  async startSession(uid, name, isMember) {
    const u = await this.user(uid, name);
    const t = now();
    if (!isMember) return { error: 'join_channel', me: this.view(u) };
    // first time a referred user actually passes the gate, the invite counts for the inviter
    if (!u.activated) {
      this.sql.exec('UPDATE users SET activated = 1 WHERE uid = ?', uid);
      if (u.ref_by) {
        const inv = this.one('SELECT refs FROM users WHERE uid = ?', u.ref_by);
        if (inv) {
          const refs = inv.refs + 1;
          const bonus = refs % this.R.REFS_PER_RESET === 0 ? 1 : 0;
          this.sql.exec('UPDATE users SET refs = ?, resets = resets + ? WHERE uid = ?', refs, bonus, u.ref_by);
        }
      }
    }
    if (t < u.session_end) return { me: this.view(u), job: await this.newJob(u) };            // resume
    if (t < u.next_allowed) return { error: 'cooldown', me: this.view(u) };
    const end = t + this.R.SESSION_S;
    this.sql.exec('UPDATE users SET session_end = ?, next_allowed = ? WHERE uid = ?', end, end + this.R.COOLDOWN_S, uid);
    const fresh = this.one('SELECT * FROM users WHERE uid = ?', uid);
    return { me: this.view(fresh), job: await this.newJob(fresh) };
  }

  async useReset(uid) {
    const u = await this.user(uid);
    const t = now();
    if (u.resets < 1) return { error: 'no_resets', me: this.view(u) };
    if (t >= u.next_allowed || t < u.session_end) return { error: 'not_resting', me: this.view(u) };
    this.sql.exec('UPDATE users SET resets = resets - 1, next_allowed = ? WHERE uid = ?', t, uid);
    return { me: this.view(await this.user(uid)) };
  }

  async applyPayment(uid, product, charge) {
    const p = this.R.PRODUCTS[product];
    if (!p) return { ok: false };
    if (this.one('SELECT charge FROM payments WHERE charge = ?', charge)) return { ok: true, duplicate: true };
    const u = await this.user(uid);
    this.sql.exec('INSERT INTO payments (charge, uid, product, at) VALUES (?, ?, ?, ?)', charge, uid, product, now());
    const t = now();
    const next = Math.max(t, u.next_allowed - p.seconds);
    this.sql.exec('UPDATE users SET next_allowed = ? WHERE uid = ?', next, uid);
    return { ok: true, me: this.view(await this.user(uid)) };
  }

  // ---------- RPC: mining ----------
  async submitShare(uid, job, nonce) {
    const u = this.one('SELECT * FROM users WHERE uid = ?', uid);
    if (!u) return { error: 'unknown_user' };
    const t = now();
    const sig = await this.sign(job);
    if (sig !== job.sig || job.m !== u.miner) return { error: 'bad_job' };
    if (t > u.session_end + this.R.GRACE_S) return { error: 'session_over', me: this.view(u) };
    const tip = this.tip();
    if (job.h !== tip.height + 1 || job.p !== tip.hash) {
      return { stale: true, job: t < u.session_end ? await this.newJob(u) : null, me: this.view(u), height: tip.height };
    }
    if (!Array.isArray(nonce) || nonce[0] !== 0 || !Number.isInteger(nonce[1]) || nonce[1] < 0 || nonce[1] > 0xFFFFFFFF) return { error: 'bad_nonce' };
    const r = this.one('SELECT * FROM round WHERE uid = ?', uid);
    if (r && r.xn0 === job.xn[0] && nonce[1] <= r.last_nonce) return { error: 'duplicate' };

    const blk = { height: job.h, prev: job.p, miner: job.m, time: job.t, thr: job.thr, xn: job.xn, nonce };
    const o = makeMiner(buildHeader(blk))(0, nonce[1] | 0);
    if (!below(o, job.sthr)) return { error: 'low_work' };

    // accept the share
    const work = job.es;
    this.recent.push([t, work]);
    this.active.set(uid, t);
    const interval = r && r.last_at ? Math.max(1, t - r.last_at) : this.R.SHARE_TARGET_S;
    const es = Math.max(this.R.ES_MIN, u.es * Math.min(2, Math.max(0.5, this.R.SHARE_TARGET_S / interval)));
    this.sql.exec(`INSERT INTO round (uid, work, xn0, last_nonce, last_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET work = work + excluded.work, xn0 = excluded.xn0, last_nonce = excluded.last_nonce, last_at = excluded.last_at`,
      uid, work, job.xn[0], nonce[1], t);
    this.sql.exec('UPDATE users SET es = ? WHERE uid = ?', es, uid);
    u.es = es;

    let block = null;
    if (below(o, job.thr)) {
      blk.hash = wordsToHex(o);
      block = this.closeBlock(blk, u);
    }
    const fresh = this.one('SELECT * FROM users WHERE uid = ?', uid);
    return { ok: true, block, job: t < fresh.session_end ? await this.newJob(fresh) : null, me: this.view(fresh) };
  }

  closeBlock(blk, finder) {
    const reward = rewardAt(blk.height);
    const rows = this.all('SELECT uid, work FROM round');
    const total = rows.reduce((s, r) => s + r.work, 0) || 1;
    const pool = reward * (1 - this.R.FINDER_CUT);
    for (const r of rows) {
      const amt = pool * r.work / total + (r.uid === finder.uid ? reward * this.R.FINDER_CUT : 0);
      this.sql.exec('UPDATE users SET balance = balance + ? WHERE uid = ?', amt, r.uid);
    }
    this.sql.exec('UPDATE users SET found = found + 1 WHERE uid = ?', finder.uid);
    this.sql.exec('INSERT INTO blocks (height, data, finder, name, reward, miners, time) VALUES (?, ?, ?, ?, ?, ?, ?)',
      blk.height, JSON.stringify(blk), finder.uid, finder.name, reward, rows.length, now());
    this.sql.exec('DELETE FROM round');
    // retarget from the measured hashrate of active miners
    const h = this.hashrate();
    const eb = this.eb();
    if (h > 0) this.setMeta('eb', String(Math.max(this.R.E_MIN, Math.min(eb * 2, Math.max(eb / 2, h * this.R.BLOCK_TARGET_S)))));
    const star = starFrom(blk);
    const out = { height: blk.height, hash: blk.hash, name: star.name, cls: star.cls, className: star.className, reward, miners: rows.length };
    this.ctx.waitUntil(this.notifyFinder(finder.uid, out).catch(() => {}));
    return out;
  }

  async notifyFinder(uid, b) {
    if (!this.env.BOT_TOKEN) return;
    const url = this.meta('app_url');
    const text = `<b>You found block #${b.height}</b> ✦\n\nIt became <b>${b.name}</b>, a ${b.className.toLowerCase()}. ${b.miners > 1 ? b.miners + ' miners shared this block and' : 'You'} got paid out, with an extra 10% for finding it.`;
    const body = { chat_id: uid, text, parse_mode: 'HTML' };
    if (url) body.reply_markup = { inline_keyboard: [[{ text: 'See your star', web_app: { url } }]] };
    await fetch(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  async setAppUrl(url) { if (this.meta('app_url') !== url) this.setMeta('app_url', url); }

  // ---------- RPC: public views ----------
  network(uid) {
    const tip = this.tip();
    const eb = this.eb();
    const round = this.all('SELECT round.uid, round.work, users.name FROM round JOIN users ON users.uid = round.uid ORDER BY round.work DESC LIMIT 5');
    const total = this.one('SELECT SUM(work) AS w, COUNT(*) AS n FROM round');
    const blocks = this.all('SELECT height, data, name, reward, miners, time, finder FROM blocks ORDER BY height DESC LIMIT 25').map(b => {
      const d = JSON.parse(b.data);
      const k = b.height === 0 ? -1 : rarityBits(hexToWords(d.hash), d.thr);
      return { height: b.height, hash: d.hash, name: b.name, reward: b.reward, miners: b.miners, time: b.time, k, mine: uid ? b.finder === uid : false };
    });
    const top = this.all('SELECT uid, name, balance, found FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 15').map(r => ({ name: r.name, balance: r.balance, found: r.found, you: uid ? r.uid === uid : false }));
    let rank = null;
    if (uid) {
      const me = this.one('SELECT balance FROM users WHERE uid = ?', uid);
      if (me && me.balance > 0) rank = this.one('SELECT COUNT(*) AS n FROM users WHERE balance > ?', me.balance).n + 1;
    }
    const miners = this.one('SELECT COUNT(*) AS n FROM users WHERE activated = 1').n;
    return {
      now: now(), height: tip.height, eb, hashrate: this.hashrate(), active: this.activeCount(), miners,
      round: { miners: total.n || 0, leaders: round.map(r => ({ name: r.name, pct: total.w ? r.work / total.w : 0, you: uid ? r.uid === uid : false })) },
      reward: rewardAt(tip.height + 1), blockTarget: this.R.BLOCK_TARGET_S, blocks, top, rank,
    };
  }

  chain(from, limit) {
    return this.all('SELECT data, name FROM blocks WHERE height >= ? ORDER BY height ASC LIMIT ?', from, limit)
      .map(r => Object.assign(JSON.parse(r.data), { name: r.name }));
  }
}
