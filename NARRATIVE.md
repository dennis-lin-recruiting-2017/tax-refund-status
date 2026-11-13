# Refund Status Service: the one-page story

## The problem

Forty million customers file through our product each season. Then the refund disappears into agency systems they can't see, and they call support, file duplicate returns, or worry. The service has to answer two questions, **"Where is my refund?"** and **"When will I get it?"**. It has to answer them accurately and securely, and stay up through the busiest weeks of the year.

**What success looks like:** fewer "where's my refund" support calls. Supporting measures:

- status reads available 99.95% of the time in season, with p99 under 300 ms
- the status we show matching the agency's record
- refunds landing inside the estimated range

## The riskiest assumption, said first

**The design assumes the IRS and states will give e-file partners a bulk refund-status feed. No agency offers one today.** Partners only learn whether a return was accepted or rejected, through MeF acknowledgments. Refund status after that is only available to taxpayers themselves, through "Where's My Refund?" and each state's equivalent.

So the architecture puts every agency behind an adapter with two calls: transmit a return, and get statuses in bulk. If the feed never comes, the adapter falls back. The status ladder becomes acknowledgment → accepted → model estimate, plus taxpayer-authorized lookups where an agency allows them. The product gets less precise, but the system stays the same shape. **Phase 0 is the conversation with the IRS and the largest states. It starts before any code.**

## The shape of the system

- **Customers never wait on an agency.** Every status read comes from our own database: one indexed lookup, a few milliseconds, about 1,000 reads a second at peak.
- **Agency work happens in the background:**
  - A processor transmits returns through a queue per agency.
  - Batch runs poll agencies in bulk on our schedule: about 500K agency requests on a peak day, instead of the ~10M we'd need if every page view asked the agency.
- **Predictions fill the gap until an agency sets a payment date.** A survival model works from the forms and schedules filed, and legal holds are applied as rules, such as the PATH Act hold on EITC refunds. A simpler Kaplan-Meier baseline is the fallback, and published agency guidance ("most within 21 days") is the floor. The page never waits on the model.
- **Trust comes first.** The main threat is account takeover:
  - strong sign-in and step-up checks
  - responses that don't reveal whether an account exists
  - minimal data: last 4 digits only, plus a keyed fingerprint of the bank account
  - nothing in this service can change money

  Training the model uses only returns whose owners opted in under §7216, exported without identifiers.

## Three decisions, and what would change them

| Decision | Instead of | Why | Revisit when |
| --- | --- | --- | --- |
| Batch polling with smart scheduling | Asking the agency on every page view | Agency rate limits, and peaks that line up with ours. Freshness of hours is acceptable; contradictory status is not. | An agency offers push updates. Polling then becomes reconciliation. |
| A queue per agency in Postgres, with a shared rate limit, per-return backoff, and a circuit breaker | A message broker (SQS, Kafka) | The return and its place in the queue commit in one transaction: no outbox, and no new system to run. | Queue load becomes a real share of the database, or other consumers need the events. |
| A survival model with rules for legal holds | A regression on the refund amount, or a single date | Returns still waiting are data too. A range is honest about uncertainty, and only the agency can promise a date. | Too few taxpayers opt in for training, or agency feeds make estimates unnecessary. |

## Phased plan

1. **Phase 0, before the season:**
   - status-feed agreements with the IRS and the states with the most filers
   - a privacy and §7216 review
   - capacity targets from last season's traffic
2. **Season 1, the minimum we can trust:**
   - federal plus the top states
   - batch status, with a "last updated" time on every answer
   - published-guidance estimates
   - "what to do" guidance for Action needed and for adjusted refunds
   - load tests at twice the forecast peak, game days, and a change freeze from early January to April 15
3. **Season 2:**
   - the survival model, shadowed against Season 1 outcomes before it's shown to anyone
   - notifications that say only that the status changed, so they can't be used as a phishing template
   - support agents seeing the same view as the taxpayer
   - more states
4. **Later:**
   - prior-year returns
   - preparers seeing their clients' returns
   - push feeds where agencies offer them

**What I deliberately didn't design deeply:** caching (reads are already cheap), multi-region (one region across several availability zones is enough for Season 1), and the tax math (the filing product owns it; the demo's version is illustrative).

## Risks I'm carrying

| Risk | Mitigation |
| --- | --- |
| No agency status feed | The adapter plus the fallback ladder; partnerships are Phase 0 |
| An agency slows down or goes offline on deadline day | Queues and circuit breakers per agency, last-known status shown with its age, support briefed |
| Account takeover surges in season | Edge bot defense, breached-password checks, step-up checks, new-device alerts |
| Estimates that customers learn not to trust | Ranges, not dates; calibration tracked by segment; fall back rather than guess |
| Peak traffic beyond the forecast | Scale out, never relax a control; shed non-essential work first (notifications, estimate refreshes) |
| An insider browsing records | Case-bound access for staff, every view audited, two people to release a held return |

## How this was built

The design docs and a working demo were built with coding agents. My role was the framing, the decisions, and verification:

- checking docs claims against the code
- running every change end to end
- catching where the tool was confidently wrong

**The demo, in five minutes:** take an agency offline, watch its circuit breaker open while the other agencies keep sending, bring it back, watch the queue drain, then follow it all in one Jaeger trace.
