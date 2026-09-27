// Checks the in-browser hashing against Node's own SHA-256, and that chain verification catches tampering.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const src = ['miner.js', 'core.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8')).join('\n')
  .replace(/if\(typeof module[^\n]*/g, '');
const C = new Function(src + '\nreturn {thrFor,below,buildHeader,hashBlock,verifyChain,starFrom,wordsToHex,hexToWords,sha32,makeMiner};')();
let fail = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fail++; };

for (let t = 0; t < 300; t++) {
  const blk = { height: t * 7919, prev: crypto.randomBytes(32).toString('hex'), miner: crypto.randomBytes(20).toString('hex'),
    time: 1790553600 + t, thr: C.thrFor(2 ** 20), xn: [t, t * 3], nonce: [0, t * 31] };
  const h = Buffer.from(C.buildHeader(blk));
  const ref = crypto.createHash('sha256').update(crypto.createHash('sha256').update(h).digest()).digest('hex');
  if (C.wordsToHex(C.hashBlock(blk)) !== ref) { check('double sha256 matches node #' + t, false); break; }
}
check('double sha256 matches node on 300 random headers', fail === 0);
const w = crypto.randomBytes(32);
check('sha32 matches node', C.wordsToHex(C.sha32(C.hexToWords(w.toString('hex')))) === crypto.createHash('sha256').update(w).digest('hex'));

const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'genesis.json'), 'utf8'));
const chain = [g];
for (let hgt = 1; hgt <= 300; hgt++) {
  const p = chain[chain.length - 1];
  const b = { height: hgt, prev: p.hash, miner: 'ab'.repeat(20), time: 1790553600 + hgt, thr: C.thrFor(2 ** 10), xn: [hgt, 0], nonce: [0, 0] };
  const m = C.makeMiner(C.buildHeader(b));
  for (let i = 0; ; i++) { const o = m(0, i); if (C.below(o, b.thr)) { b.nonce = [0, i]; b.hash = C.wordsToHex(o); break; } }
  chain.push(b);
}
check('fresh chain verifies', C.verifyChain(chain).ok);
const bad = JSON.parse(JSON.stringify(chain)); bad[120].time++;
const r = C.verifyChain(bad);
check('tampered block is caught at #120', !r.ok && r.at === 120);
check('same block always gives the same star', JSON.stringify(C.starFrom(chain[5])) === JSON.stringify(C.starFrom(chain[5])));
process.exit(fail ? 1 : 0);
