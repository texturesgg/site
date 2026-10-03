# Algorithms

## Trending / Hot Sort

Based on the [Hacker News ranking algorithm](https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d), adapted for a texture mod platform where both votes and downloads are meaningful engagement signals.

### Formula

```
score = (upvotes + downloads * 0.5) / (age_hours + 2) ^ gravity
```

| Parameter   | Value                               | Rationale                                                                                                      |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `upvotes`   | count of the pack's `votes` rows    | Primary quality signal — explicit user endorsement                                                             |
| `downloads` | `packs.downloadCount`, weighted 0.5 | Secondary signal — shows utility but is passive (users download without voting)                                |
| `age_hours` | hours since `packs.publishedAt`     | Time decay — newer content surfaces naturally                                                                  |
| `+2`        | offset constant                     | Prevents division by zero and dampens the advantage of brand-new posts                                         |
| `gravity`   | **1.5**                             | Controls decay speed. HN uses 1.8; we use 1.5 because texture mods are longer-lived content than news articles |

### Why HN-style?

- **Simple**: One formula, no background jobs, can be computed in a SQL query
- **Predictable**: Content rises with engagement, then naturally falls off — no cliff edges
- **Tunable**: Adjusting `gravity` changes how fast old content decays; adjusting the download weight changes how much passive engagement matters
- **Battle-tested**: Used by HN, Lobste.rs, and countless other link aggregators

### Alternatives considered

| Algorithm                             | Why not                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Reddit Hot                            | Time component is absolute (not relative), so it doesn't decay — less useful for a smaller community where we want fresh content to cycle |
| Wilson Score                          | Great for "best of all time" ranking but doesn't factor in recency at all                                                                 |
| Exponential decay (`votes * e^(-λt)`) | Functionally similar to HN but harder to reason about and tune                                                                            |

### SQL implementation

The pack list route (`GET /api/packs` in `packages/api/src/routes/packs.ts`)
computes the score in its D1 query. `hot` is the default `sortBy`, and
`published_at` (stored in milliseconds) breaks ties. The query is equivalent to:

```sql
SELECT packs.*,
  ((SELECT COUNT(*) FROM votes WHERE votes.pack_id = packs.id) + packs.download_count * 0.5)
    / pow((CAST((strftime('%s', 'now') * 1000 - packs.published_at) AS REAL) / 3600000.0) + 2, 1.5)
  AS hot_score
FROM packs
WHERE status = 'approved' AND deleted_at IS NULL
ORDER BY hot_score DESC, published_at DESC
```

The other sorts are `newest` (`published_at`), `top` (vote count), and
`downloads` (`download_count`). `top` and `downloads` accept a `period` of
`week`, `month`, `year`, or `all`, which filters on `published_at`.

### Tuning notes

- If the front page feels stale, **increase gravity** (e.g. 1.5 → 1.8) to decay older posts faster
- If popular packs disappear too quickly, **decrease gravity** (e.g. 1.5 → 1.2)
- If downloads are dominating votes in the ranking, **decrease the download weight** (e.g. 0.5 → 0.3)
- The admin analytics page (`/analytics`) shows downloads per day, the most-downloaded packs for the chosen period, and vote totals
