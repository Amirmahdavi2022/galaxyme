// Tries every Cloudflare token in CF_TOKENS (one per line) and keeps the first one that can manage Workers.
// Writes CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to $GITHUB_ENV. Token values are masked in the log.
import { appendFileSync } from 'node:fs';

const tokens = (process.env.CF_TOKENS || '').split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
if (!tokens.length) { console.error('CF_TOKENS secret is empty'); process.exit(1); }
for (const t of tokens) console.log(`::add-mask::${t}`);

const api = async (token, path) => {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, { headers: { authorization: `Bearer ${token}` } });
  return r.json().catch(() => ({ success: false }));
};

for (let i = 0; i < tokens.length; i++) {
  const t = tokens[i];
  const acc = await api(t, '/accounts?per_page=50');
  if (!acc.success || !acc.result?.length) { console.log(`token ${i + 1}: can't list accounts (${acc.errors?.[0]?.message || 'no access'})`); continue; }
  for (const a of acc.result) {
    const s = await api(t, `/accounts/${a.id}/workers/scripts`);
    if (s.success) {
      console.log(`token ${i + 1}: works on account "${a.name}"`);
      appendFileSync(process.env.GITHUB_ENV, `CLOUDFLARE_API_TOKEN=${t}\nCLOUDFLARE_ACCOUNT_ID=${a.id}\n`);
      process.exit(0);
    }
    console.log(`token ${i + 1}: account "${a.name}" refused Workers access (${s.errors?.[0]?.message || 'no access'})`);
  }
}
console.error('None of the tokens can manage Workers. Make one with the "Edit Cloudflare Workers" template.');
process.exit(1);
