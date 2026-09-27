# Galaxyme

One shared proof-of-work chain that everyone mines from inside Telegram. Every block turns into a star, and the whole chain slowly grows into one spiral galaxy that all miners share.

The mining is real. Your phone runs double SHA-256 over a 128 byte block header, same idea as Bitcoin, just in a Web Worker. The star you get isn't picked by a server or a random roll. It's read straight out of the block hash, so nobody (me included) can hand out rare stars.

## How mining works

- You mine in 5 minute sessions, then rest for an hour. You can skip the rest with Telegram Stars (50 for 30 minutes, 100 for the full hour), or invite 3 friends for a free reset.
- Your phone sends shares, which are hashes below your personal share target. That target adjusts so a phone sends one about every 20 seconds, fast or slow.
- When someone's hash also lands below the block target, the block closes. Its Stardust gets split by work between everyone who sent shares for it, and the finder gets 10% on top plus the star.
- The network aims for a block every 4 minutes of active mining and retargets from the measured hashrate.
- Mining needs membership in the project's Telegram channel.

Stardust has no cash value. It's a score on the chain.

## How a star is made

Two things come out of the block hash.

**Rarity.** `k = floor(log2(target / hash))`. Since a valid hash is spread evenly under the target, the chance of getting `k` or more is exactly `2^-k`.

| class | k | odds |
| --- | --- | --- |
| Main sequence | 0 to 2 | about 7 in 8 |
| Giant | 3 to 4 | about 1 in 11 |
| Binary system | 5 to 6 | about 1 in 43 |
| Pulsar | 7 to 9 | about 1 in 146 |
| Black hole | 10+ | about 1 in 1,024 |

**Looks.** `seed = sha256(blockHash)` feeds a small PRNG that picks temperature (which sets the color), radius, planets, rings, moons, a made up name and where the star sits on its spiral arm. Same block, same star, every time.

## Block header

128 bytes, big endian:

| field | bytes |
| --- | --- |
| version | 4 |
| height | 8 |
| prevHash | 32 |
| sharesRoot | 32 |
| miner address | 20 |
| timestamp | 8 |
| target | 8 |
| nonce | 16 |

The miner address sits inside the header, so a nonce someone else found is useless for your address. The first 64 bytes never change while mining, so the miner hashes them once and reuses that midstate for every nonce.

## Checking it yourself

The full chain is public at `/api/chain`. The Network tab has a "Verify the whole chain" button that downloads it and re-hashes every block on your phone. For the code, `node tools/test-core.js` compares the browser hashing against Node's own SHA-256 on 300 random headers and makes sure an edited block gets caught.

## Layout

```
app/         source for the Mini App (miner, chain + star code, UI)
app/build.py builds public/index.html from app/
public/      what gets served
src/         the Worker (app, /api, bot webhook on /tg) and the Durable Object that owns the chain
tools/       tests, Cloudflare token picker, bot setup
```

## Deploying your own

Push to `main` and the workflow does the rest. It needs two repo secrets:

- `CF_TOKENS`: one or more Cloudflare API tokens, one per line (the "Edit Cloudflare Workers" template is enough). The first one that can manage Workers gets used.
- `TG_BOT_TOKEN`: your bot token from @BotFather.

After deploy it sets the bot webhook, the menu button and the bot's profile text on its own. Set `CHANNEL` in `wrangler.toml` to the channel people have to join, and make the bot an admin there so it can check membership.

## License

MIT
