# Legal pages: open questions

The terms, privacy and copyright pages (`packages/web/src/routes/legal/`) are
drafts written from what the site does. They sit behind the `code-mods` flag,
are marked noindex, and say "Draft" until the owner approves them. These are the
questions a lawyer should answer before they take effect.

## Terms of service

1. Is the hosting license (worldwide, non-exclusive, royalty-free, to host,
   store, copy, build, show and distribute) broad enough for compiling mods
   from source, building them for every system, and serving them through the
   app and `tgg`? Does it need to survive removal for copies already
   downloaded, or for builds in sets other people rely on?
2. Mods are released under licenses their makers choose (GPL and others).
   How do the terms sit beside those licenses, and do we need anything for
   official mods SaavyLab LLC publishes?
3. Melee is Nintendo's. Texture packs and stage mods are derived from its
   assets, and mods hook a decompilation of its code. What do the terms need
   to say about that, and is "you need your own copy, we don't host the game"
   enough?
4. Native mods are compiled code we build and distribute after a review.
   What can we say about review without taking on liability for a malicious
   mod that passes it?
5. Is the "no warranty" and liability section enforceable as written, and do
   we need an arbitration or governing law clause (which state)?
6. Minimum age: the audience includes minors. Do we need a minimum age
   (13 under COPPA) or parental consent language?
7. The mod competition (December 2026) has its own rules page. Do the terms
   need to reference it, and does a $500 prize pool paid by SaavyLab LLC need
   anything beyond those rules (eligibility, taxes, void where prohibited)?
8. How much notice do we owe before changing the terms, and how?

## Privacy policy

1. Which laws apply (GDPR for EU players, CCPA/CPRA, others), and what each
   one requires us to add: a legal basis per use, a data controller
   statement, rights to access, correct, delete and port data, and how to
   complain.
2. Retention: sessions last 7 days, but accounts, comments, reports, bans,
   download records and Cloudflare's request logs have no written retention.
   What should each be?
3. Account deletion happens by email today, with no self-serve option. Is
   that acceptable, and in what time frame do we have to act?
4. Matchmaking shares each player's network addresses (including the local
   network and public IP) with their opponent, and uses a rough location to
   pair players. Is a notice enough, or does this need consent in the app
   first?
5. Cloudflare processes everything (hosting, storage, email, Turnstile,
   matchmaking, the TURN relay). Do we need to name it as a processor, link
   its DPA, or mention transfers outside the EU?
6. Children's data: if under-13s use the site, what changes?
7. Moderators see reports and the email addresses of accounts. Does that
   need its own mention?

## Copyright and takedowns

1. Register a DMCA designated agent with the US Copyright Office (SaavyLab
   LLC, contact@textures.gg, a mailing address) so the safe harbor applies.
   Which address do we publish?
2. Are the notice and counter-notice requirements on the page complete and
   accurate?
3. Is "ban accounts that keep posting other people's work" a sufficient
   repeat infringer policy, or does it need a number of strikes?
4. Credit disputes between modders (who made a pack) aren't copyright claims.
   Should the page say how we decide them?
5. Does Nintendo's ownership of the underlying assets change how we handle
   a takedown for a texture pack or mod (for example, a notice from Nintendo
   itself)?
