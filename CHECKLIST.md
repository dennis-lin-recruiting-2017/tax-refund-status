# Checklist: gaps against the problem statement

Status as of 2026-10-27. Each item names where it lands: the **docs** site, the **demo**, or both.

## 1. AI refund-time prediction (in scope; not yet started)

The problem statement puts this squarely in scope. Nothing in the docs or the demo covers it yet.

- [x] **Docs: form-composition model.** Architecture > Refund Time Prediction: features built from the count of each tax form and schedule, a gradient-boosted survival model with legal holds as rules, per-segment evaluation, explanations, privacy, and an interactive explorer with illustrative weights.
- [x] **Docs: two algorithms.** The model section names gradient-boosted survival (XGBoost AFT, serves the estimates) and a random survival forest (an independent check; where they disagree by more than a margin, the wider range is shown and the segment is flagged), with Kaplan-Meier as the baseline and fallback. High-Level Design matches.
- [x] **Docs: phased model.** Refund Time Prediction keeps the shared design (signal, output, model, training, explanations, privacy) and links two sub-pages: Phase 1 (form types: counts, families, held credits, timing, agency load) and Phase 2 (each key figure relative to income, in bands), with a second explorer showing the same deduction at different incomes, guardrails (bands only, no help gaming the agency, fairness per income band, prediction only), and the bar for Phase 2 to replace Phase 1. Roadmap: Phase 1 in Season 2, Phase 2 under Later.
- [ ] **Docs: model overview.** What is predicted: days until the refund is available, with a confidence range. When it's shown: only while the refund isn't available yet. How it relates to the agency's own payment date, once there is one.
- [ ] **Docs: training data.**
  - Features: jurisdiction, form, filing date and week of season, refund size, credits (EITC/ACTC hold until mid-February), e-file vs. paper, direct deposit vs. check, prior-year history, current agency backlog.
  - Label: the observed time from filing to `sent`, taken from `return_events`.
  - Where the training data lives, and how it's kept free of PII (tokenized IDs, no SSNs, names or bank details).
- [ ] **Docs: training pipeline.** Batch extraction from the status store to a feature store. Scheduled retraining, more often in season. Offline evaluation (MAE, calibration of the ranges). Model registry and versioning.
- [ ] **Docs: inference.**
  - Online call vs. precompute: predict on each status change in the batch sync, store it, and serve it from the status read path. Precompute keeps the model off the hot path at peak.
  - Latency budget and timeout.
- [ ] **Docs: fallback when the model is down or unsure.** Fall back to published agency guidance ("most refunds within 21 days"), and never block the status page on the model.
- [ ] **Docs: monitoring.** Prediction vs. actual, feature drift, season-over-season shift, shadow deployment and A/B tests for new models.
- [ ] **Docs: responsible use.** It's an estimate, not a promise, and the UI wording must say so. Check fairness across income and credit groups, where EITC holds could skew estimates.
- [ ] **Docs: security of the model path.** Service auth to the model, no PII in inference payloads or logs, access controls on training data.
- [ ] **Demo: a prediction service.** A stub model served over HTTP, such as a heuristic or a small regression trained on synthetic history. It needs a `taxrefund predict` subcommand or a separate deployment.
- [ ] **Demo: store and show predictions.**
  - Add `predicted_available_at` plus a low/high range to `tax_returns`.
  - Update them during the batch sync.
  - Show them on the ReturnCard: "Estimated by Mar 3–7 (based on similar returns)". Hide them once the refund is sent.
- [ ] **Demo: synthetic training data.** A generator, and a training command the docs can walk through.
- [ ] **Demo: tracing.** Prediction spans in Jaeger.

## 2. Client usability and "what to do if there's an issue"

- [ ] **Docs: client app design page.** Screens, states and copy for each status, mobile-first, accessibility (WCAG 2.2 AA), and plain-language status messages.
- [ ] **Docs: issue guidance per status.**
  - Action needed: what the letter means and how to respond.
  - Refund adjusted: why it happens and how to dispute it.
  - Late payment: when to contact the agency (for example, 21 days or more after e-file).
  - Wrong bank account or a returned deposit.
  - Lost or stolen paper check.
  - Possible identity theft.
- [ ] **Demo: a "Need help?" panel on each ReturnCard.** Next steps and agency contact links for the current status.
- [ ] **Demo: explain the adjustment on Refund adjusted.** Say what to do if the taxpayer disagrees.
- [ ] **Demo: a stale-data indicator.** "Last updated from the IRS 3 hours ago". It's partly there as "Last checked".

## 3. Placeholder pages in the docs (empty today)

Requirements:
- [ ] Requirements (index).
- [x] Functional, Refund Status Lookup, Identity Verification, and Notifications: testable requirements with Demo/Planned status.
- [x] Status States: interactive state diagram, meanings and next steps, transition rules, and agency status mapping.
- [ ] Status States gaps: e-file rejected, returned deposit, paper check, and refund offset aren't modeled in the demo.
- [x] Availability & Latency: availability over latency for a read-heavy service. Objectives and what counts as available, error-budget policy (latency never freezes releases), an interactive read-path diagram with failure walkthroughs, dependencies kept off the read path, write-free sessions, read-your-own-writes, timeout budget, three-zone topology, and degraded modes. Monitoring's latency alert now pages only over 1 s.
- [x] Demo: taxpayer-granted support access, one return at a time. Each filed return has **Give support access** (5 minutes, end early or restart, with a countdown); `support01@test.com` sees only the returns being shared, plus an Access log column of each taxpayer's recent grants with live timers. Enforced in SQL on every request (migrations 012–013, `support_grants`); grants, revocations, and per-grant views are audited.
- [x] Demo: support opens a shared return in full. **View return** on a shared return opens a modal with the taxpayer's own return card (refund, timeline, agency message, history, calculation) and the grant's countdown; `GET /api/support/returns/{id}` answers only while the grant is active, and every opening is audited (`support_view_return_details`). When the grant ends, the dialog clears the return. The taxpayer's consent text now says support sees the figures, never the full tax ID or bank account.
- [x] Demo: support can end access early. **End access** on an active access-log entry or in the return dialog revokes the grant (`DELETE /api/support/returns/{id}/access`, audited as `support_access_ended`). The access log says who ended each grant (migration 016, `revoked_by`), and the taxpayer's card re-checks every 10 seconds while shared, so its countdown stops when support ends it.
- [x] Demo: five color schemes (Evergreen, Ocean, Sunset, Plum, Graphite). Each tints the whole page, in light and dark, with every text and accent pair at 5:1 contrast or better. Signed-out pages are always Evergreen, with no picker. Signed in, a user who hasn't picked gets their role's default (taxpayers Sunset, support Ocean, admins Graphite; migrations 014–015, NULL = default); a pick is saved to the profile (`PUT /api/me/color-scheme`) and cached on the device so it applies before first paint.
- [ ] Support access gaps: a grant covers the whole support team, not one named agent or a case; no notification to the taxpayer when an agent actually looks.
- [x] Demo: write-free session checks. `auth.Require` only reads; a session is extended at most every 5 minutes in a background write that can fail without failing the request, and a session the database can't confirm gets a 503, never trust.
- [ ] Demo gaps still open from Availability & Latency: single Postgres pod with no replicas; no status cache; the portal doesn't retry a failed read or keep the last status on screen, and treats a 503 from `/auth/me` as signed out.

Architecture:
- [ ] Architecture (index).
- [x] High-Level Design: interactive diagram of the system as it runs today, with flow walkthroughs.
- [x] High-Level Design: predictor and training pipeline added to the diagram as planned components, with Predict and Train walkthroughs.
- [ ] High-Level Design: drop the "planned" styling once the prediction work in section 1 is built.
- [x] API Gateway: what the gateway does, the filing flow, and the decision record for queuing submissions per agency in Postgres (options considered, mechanisms, settings, when to revisit).
- [x] Demo: per-agency submission queues. A token bucket per agency shared by all processor replicas (`SUBMIT_RPS`), per-return backoff with full jitter, and a circuit breaker per agency (migration 008). Tested with two replicas and one agency down.
- [ ] Demo gaps from API Gateway: no alert yet on queue age or an open breaker (needs metrics); repeatedly rejected returns retry forever instead of moving to a review queue.
- [x] Demo: multi-state returns. A taxpayer files in several states (`user_states`, at most one full resident), on the form their residency calls for: CA 540/540NR, NY IT-201/IT-203. Part-year and nonresident returns tax that state's share of income; the resident return claims a limited credit for tax paid to the other states and is filed after them (migration 009). tester08, tester09, and tester18 file in both states.
- [x] Demo: states with no income tax. A `states` reference table (migration 010) records Florida, Texas, and Washington with no income tax: they get no form, the dashboard and admin console say why, and `"states": []` in the seed file means federal only. tester20 (lives in TX, NY nonresident), tester21 (CA resident, worked in WA), tester22 (FL resident, worked in TX, 1040 only).
- [ ] Multi-state gaps: joint filers living in different states, city income taxes (NYC, Yonkers), and reciprocity agreements aren't modeled; the credit limit isn't applied income type by income type.
- [ ] Components, Status Service, Data Model.
- [ ] Caching. The read path at peak: CDN/edge for static assets, a per-user status cache, and invalidation on status change.
- [ ] Notification Service.

Security:
- [x] Security overview rewritten for the account-based model: assets, trust boundaries, principles, top threats, with Demo/Planned badges.
- [x] Section pages: Threat Model, Identity & Access, Data Protection, Abuse Prevention, Audit & Incident Response, Privacy & Compliance (§7216 consent incl. model training, Safeguards Rule/GLBA, IRS pubs, state laws, SOC 2).
- [x] Taxpayer Identity: proofing to IAL2, authenticators, step-up, takeover detection, recovery, with an interactive proofing flow.
- [x] Support Agents: interactive identity flow (HR-vouched, hardware keys, case-based access) and guardrails.
- [x] Preparers: interactive identity flow (proofing, PTIN/EFIN credentials, client grants) and guardrails.
- [x] Identity & Access: side-by-side comparison of taxpayer, agent, and preparer identity.
- [x] Service-to-Service Auth: moved up to a top-level Security page.
- [ ] Service-to-Service Auth: zero-trust draft written around an interactive diagram (each connection and component today vs. proposed, plus an "if compromised" reach view) and a rollout order. Review and drop the Draft note.
- [ ] Demo gaps the draft calls out: egress unrestricted (ingress-only policies), Postgres connection unencrypted, agency mocks share the app's DB login, one agency key for all three agencies.
- [x] Security Monitoring: pipeline, what we collect and never log, alert table, on-call, protecting the logs. Detection moved here from Audit & Incident Response.
- [ ] Demo gap from Security Monitoring: failed sign-ins are audited with the IP but not the account tried; lockouts and rate-limit hits aren't recorded separately.
- [x] Attack Surfaces: overview of every surface with real entry points, plus Enumeration & Credential Stuffing, Bots & Automated Abuse, and Insider Access.
- [x] Demo fixes from Attack Surfaces: admin searches and shown returns are audited (`admin_view_returns`, de-duplicated for 15 minutes); the client address comes from `X-Forwarded-For` read right to left through `TRUSTED_PROXIES`, and nginx appends instead of overwriting.
- [ ] Demo gaps still open from Attack Surfaces: the login rate limiter is per pod and in memory; one admin can release a held return alone.
- [x] Encryption & Key Management: every layer with Demo/Planned status, envelope encryption of return figures under a key per taxpayer per tax year (status left readable so reads survive a KMS outage), the key table with holders and rotation, key access, and what to do when a key is exposed.
- [x] Minimization & Retention: principles, a data inventory (why, minimized form, period, deletion) for every kind of data, deletion by tax-year partition and crypto-shredding (which reaches backups), legal holds, and the taxpayer deletion flow. Data Protection's retention table now matches.
- [x] Rate Limiting & Lockout: limits per layer (edge, per IP, per account, password spraying, per session, filing, support grants, staff views), token buckets in a shared store with a per-pod fallback, shared-address handling, escalating device-aware lockout with an owner notice, monitoring, and the demo's gaps. Also fixed the request body size: 32 KB at the portal, 16 KB at the API.
- [ ] Demo gaps from Minimization & Retention: no retention jobs (returns, status history, duplicate-screening vectors, and the audit log are kept until a return is reset); no field-level encryption.
- [x] Threat Actors: a priority table for ten actors (skill, likelihood in season, impact) and a profile of each (wants, how they'd attack this service, what stops them, how we notice), including someone close to the taxpayer, dishonest preparers, supply-chain and nation-state attackers; seasonal timing; and why holding less makes this a worse target. Threat Model links to it.
- [x] Bot Defense: principles, the pipeline (edge, risk score, response, app limits, business checks), signals with their privacy cost, the response ladder (allow, watch, slow, challenge, block), accessible challenges (WCAG 2.2 accessible authentication, passkeys, proof-of-work), defenses by flow, tripwires and canary accounts, under-attack mode and vendor outages, and measuring friction. Every security sub-page is now written.
- [ ] Demo hardening the docs call out as gaps: per-workload secrets (admin key is in the shared secret), per-service DB roles, shared rate-limit store.

Operations:
- [x] Monitoring & Alerting: SLOs with error budgets, what's measured, paging alerts, on-call, dashboards.
- [x] Interactive diagrams: Distributed Tracing (API request, filing, and batch-run walkthroughs with a span waterfall and a production-pipeline toggle) and Monitoring & Alerting (what's monitored per component, and six alert workflows from signal to fix).
- [x] Peak Season Readiness: the peaks, readiness calendar, load testing, scaling plan, graceful degradation, change freeze, game days, go/no-go.
- [x] Extension Deadline (under Peak Season Readiness): IRS filing-season stats for 2024–2026 (about 14% of returns arrive after mid-April), sources in tables, and the off-season plan.
- [ ] Demo gap from Monitoring & Alerting: no metrics are exported yet (OpenTelemetry metrics to Prometheus, Grafana dashboards).

## 4. High availability and accuracy (designed in part; the demo is single-instance in places)

- [ ] **Docs: multi-AZ/multi-region topology.** Database replication and failover (Postgres primary plus replicas, or a managed service). RPO/RTO targets.
- [ ] **Docs: degraded mode.** When an agency or the database is unavailable, serve last-known status with a "last updated" timestamp rather than an error.
- [ ] **Docs: autoscaling policy.** HPA on the API, KEDA or similar for batch workers, and the seasonal scale-down.
- [ ] **Docs: accuracy guarantees.** Reconciliation jobs, where the agency is the source of truth, and how fast a status change becomes visible end to end. The Batch Sync pages cover some of this.
- [ ] **Demo: autoscaling and disruption.** HPA and PodDisruptionBudgets in `kubernetes/`.
- [ ] **Demo: optional read cache.** Redis, or an in-process cache, for status reads.

## 5. Consistency fixes in what's already written

- [x] **Overview: add the AI prediction.** It's now in the problem statement, goals, journey, challenges and success measures.
- [x] **Overview: fix the identity goal.** It now describes signed-in accounts and account-takeover defense, not account-less lookup.
- [x] **Overview: fix the balances-owed non-goal.** Returns with no refund show the agency's balance; paying it is out of scope.
- [x] **Demo page: align the in-browser mock with the account-based design.** Sample accounts sign in and see federal and state returns, covering every status (including Refund adjusted and a balance due), each with "What you can do" guidance. The AI estimate is still to come with section 1.
- [x] **Security pages: remove account-less lookup wording.** The overview and section pages now describe signed-in accounts. Keep it that way when the sub-pages are written.

## 6. Interview delivery

- [ ] **One-page summary.** Requirements, then capacity, then architecture diagram, then data model, then API, then prediction, then security, then trade-offs.
- [ ] **Demo script (about 5 minutes).** File, watch the status, admin sets Refund adjusted, the taxpayer sees it, then Jaeger.
- [ ] **Trade-offs to be ready to defend.**
  - Batch polling vs. push from the agencies.
  - Precomputed vs. online prediction.
  - pgvector duplicate screening vs. a dedicated fraud service.
  - Postgres vs. a key-value store for status reads at 40M users.
- [ ] **Commit the work.** About 48 files are staged and not yet committed.
