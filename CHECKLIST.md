# Checklist: gaps against the problem statement

Status as of 2026-10-27. Each item names where it lands: the **docs** site, the **demo**, or both.

## 1. AI refund-time prediction (in scope; not yet started)

The problem statement puts this squarely in scope. Nothing in the docs or the demo covers it yet.

- [x] **Docs: form-composition model.** Architecture > Refund Time Prediction: features built from the count of each tax form and schedule, a gradient-boosted survival model with legal holds as rules, per-segment evaluation, explanations, privacy, and an interactive explorer with illustrative weights.
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
- [ ] Requirements (index), Functional, Refund Status Lookup.
- [ ] Identity Verification.
- [ ] Status States. Include Refund sent vs. Refund adjusted, Action needed, Accepted, and the state diagram.
- [ ] Notifications.
- [ ] Availability & Latency. SLOs: for example 99.95% in season, p99 read under 300 ms.

Architecture:
- [ ] Architecture (index).
- [x] High-Level Design: interactive diagram of the system as it runs today, with flow walkthroughs.
- [x] High-Level Design: predictor and training pipeline added to the diagram as planned components, with Predict and Train walkthroughs.
- [ ] High-Level Design: drop the "planned" styling once the prediction work in section 1 is built.
- [x] API Gateway: what the gateway does, the filing flow, and the decision record for queuing submissions per agency in Postgres (options considered, mechanisms, settings, when to revisit).
- [x] Demo: per-agency submission queues. A token bucket per agency shared by all processor replicas (`SUBMIT_RPS`), per-return backoff with full jitter, and a circuit breaker per agency (migration 008). Tested with two replicas and one agency down.
- [ ] Demo gaps from API Gateway: no alert yet on queue age or an open breaker (needs metrics); repeatedly rejected returns retry forever instead of moving to a review queue.
- [ ] Components, Status Service, Data Model.
- [ ] Caching. The read path at peak: CDN/edge for static assets, a per-user status cache, and invalidation on status change.
- [ ] Notification Service.
- [ ] API Design. Status endpoint, prediction fields, admin API, error model.

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
- [ ] Deeper sub-pages (still placeholders): Threat Actors, Encryption & Key Management, Minimization & Retention, Rate Limiting & Lockout, Bot Defense.
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
