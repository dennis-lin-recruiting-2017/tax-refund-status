import { useState } from 'react'
import { Link } from 'react-router-dom'

// Refund-time prediction: a model whose main signal is the composition of the return, meaning which tax forms
// and schedules were filed and how many of each.

// Forms the explorer offers. Weights are illustrative, for explaining the idea; a trained model learns its own.
const FORMS = [
  { id: 'w2', label: 'W-2', family: 'info', max: 6, start: 1, days: (n) => Math.max(0, n - 1) * 0.3, why: 'More employers to match against wage records' },
  { id: 'f1099int', label: '1099-INT', family: 'info', max: 6, days: (n) => n * 0.2, why: 'More payer records to match' },
  { id: 'f1099nec', label: '1099-NEC', family: 'info', max: 10, days: (n) => Math.min(n * 0.5, 4), why: 'Contract income is matched against payer reports' },
  { id: 'f1099b', label: '1099-B', family: 'investment', max: 10, days: (n) => Math.min(n * 0.3, 3), why: 'Brokerage sales to reconcile' },
  { id: 'schC', label: 'Schedule C', family: 'business', max: 3, days: (n) => n * 4, why: 'Self-employment income has no W-2 to match and draws more review' },
  { id: 'schE', label: 'Schedule E', family: 'business', max: 3, days: (n) => n * 2, why: 'Rental or partnership income' },
  { id: 'schD', label: 'Schedule D', family: 'investment', max: 1, days: (n) => n * 1, why: 'Capital gains to reconcile' },
  { id: 'schEIC', label: 'Schedule EIC', family: 'credits', max: 1, days: () => 0, path: true, why: 'Earned income credit' },
  { id: 's8812', label: 'Schedule 8812', family: 'credits', max: 1, days: () => 0, path: true, why: 'Additional child tax credit' },
  { id: 'f8962', label: 'Form 8962', family: 'credits', max: 1, days: (n) => n * 5, why: 'Premium tax credit is reconciled against marketplace records' },
  { id: 'f8863', label: 'Form 8863', family: 'credits', max: 1, days: (n) => n * 6, why: 'Education credits are a frequent target of review' },
  { id: 'f1116', label: 'Form 1116', family: 'international', max: 1, days: (n) => n * 8, why: 'Foreign tax credit' },
  { id: 'f8379', label: 'Form 8379', family: 'other', max: 1, days: () => 0, injured: true, why: 'Injured spouse allocation' },
]

const WINDOWS = {
  jan: { label: 'Late January', base: 9, date: new Date(2026, 0, 28) },
  mar: { label: 'Mid-March', base: 11, date: new Date(2026, 2, 15) },
  apr: { label: 'Deadline week', base: 15, date: new Date(2026, 3, 13) },
  oct: { label: 'October (extension)', base: 14, date: new Date(2026, 9, 12) },
}

// The IRS can't issue EITC or ACTC refunds before mid-February, and expects most by early March.
const PATH_RELEASE = new Date(2026, 2, 3)
const DAY = 24 * 60 * 60 * 1000

function estimate(counts, windowId, deposit) {
  const w = WINDOWS[windowId]
  const reasons = []
  let median = w.base
  for (const f of FORMS) {
    const n = counts[f.id] ?? 0
    const add = n ? f.days(n) : 0
    if (add >= 0.5) reasons.push({ text: `${f.label}${n > 1 ? ` ×${n}` : ''}: ${f.why}`, days: add })
    median += add
  }
  if (!deposit) {
    median += 7
    reasons.push({ text: 'Paper check instead of direct deposit', days: 7 })
  }
  const notes = []
  const pathFloor = Math.round((PATH_RELEASE - w.date) / DAY)
  if (FORMS.some((f) => f.path && counts[f.id]) && pathFloor > median) {
    reasons.push({ text: 'EITC or ACTC filed before the mid-February release: held until early March', days: pathFloor - median })
    notes.push('Held by law: the estimate never falls before the release date.')
    median = pathFloor
  }
  if (counts.f8379) {
    const injured = 77
    if (injured > median) {
      reasons.push({ text: 'Injured spouse allocation: the IRS says about 11 weeks when e-filed', days: injured - median })
      median = injured
    }
  }
  const risky = FORMS.filter((f) => counts[f.id] && ['schC', 'f8962', 'f8863', 'f1116'].includes(f.id)).length
  const low = Math.max(3, Math.round(median * 0.75))
  const high = Math.round(median * 1.5 + risky * 3)
  reasons.sort((a, b) => b.days - a.days)
  return { low, median: Math.round(median), high, reasons, notes }
}

function featureVector(counts, windowId, deposit) {
  const v = []
  const fam = {}
  let distinct = 0
  for (const f of FORMS) {
    const n = counts[f.id] ?? 0
    if (!n) continue
    v.push([f.label, n])
    fam[f.family] = (fam[f.family] ?? 0) + n
    if (f.family !== 'info') distinct += 1
  }
  for (const [k, n] of Object.entries(fam)) v.push([`family:${k}`, n])
  v.push(['distinct_schedules', distinct])
  v.push(['eitc_actc', FORMS.some((f) => f.path && counts[f.id]) ? 1 : 0])
  v.push(['filing_window', WINDOWS[windowId].label])
  v.push(['direct_deposit', deposit ? 1 : 0])
  return v
}

function FormExplorer() {
  const [counts, setCounts] = useState(() => Object.fromEntries(FORMS.map((f) => [f.id, f.start ?? 0])))
  const [windowId, setWindowId] = useState('mar')
  const [deposit, setDeposit] = useState(true)
  const bump = (f, d) => setCounts((c) => ({ ...c, [f.id]: Math.min(f.max, Math.max(0, c[f.id] + d)) }))
  const est = estimate(counts, windowId, deposit)
  const vec = featureVector(counts, windowId, deposit)
  const weeks = (d) => (d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`)

  return (
    <figure className="fx">
      <div className="fx-grid">
        <div className="fx-controls">
          <p className="fx-label">Forms on the return</p>
          <ul className="fx-forms">
            {FORMS.map((f) => {
              const n = counts[f.id]
              return (
                <li key={f.id} className={n ? 'on' : ''}>
                  <span>{f.label}</span>
                  <span className="fx-stepper">
                    <button type="button" aria-label={`Fewer ${f.label}`} onClick={() => bump(f, -1)} disabled={n === 0}>−</button>
                    <output aria-live="polite">{n}</output>
                    <button type="button" aria-label={`More ${f.label}`} onClick={() => bump(f, 1)} disabled={n === f.max}>+</button>
                  </span>
                </li>
              )
            })}
          </ul>
          <label className="fx-field">
            <span className="fx-label">Filed</span>
            <select value={windowId} onChange={(e) => setWindowId(e.target.value)}>
              {Object.entries(WINDOWS).map(([id, w]) => <option key={id} value={id}>{w.label}</option>)}
            </select>
          </label>
          <label className="fx-check">
            <input type="checkbox" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} />
            Direct deposit
          </label>
        </div>

        <div className="fx-result" aria-live="polite">
          <p className="fx-label">Illustrative estimate, after the IRS accepts the return</p>
          <p className="fx-range">{weeks(est.low)} – {weeks(est.high)}</p>
          <p className="fx-median">Most likely about {weeks(est.median)}</p>
          {est.notes.map((n) => <p key={n} className="fx-note">{n}</p>)}

          <p className="fx-label">Why</p>
          {est.reasons.length ? (
            <ul className="fx-reasons">
              {est.reasons.slice(0, 4).map((r) => (
                <li key={r.text}><span>{r.text}</span><strong>+{Math.round(r.days)}d</strong></li>
              ))}
            </ul>
          ) : (
            <p className="fx-note">A simple return: nothing adds time beyond the typical wait for the filing window.</p>
          )}

          <p className="fx-label">Feature vector the model sees</p>
          <div className="fx-vector">
            {vec.map(([k, n]) => <code key={k}>{k}={n}</code>)}
          </div>
        </div>
      </div>
      <figcaption>
        The weights here are made up to show how the inputs combine. A trained model learns them from how long similar
        returns actually took.
      </figcaption>
    </figure>
  )
}

function Prediction() {
  return (
    <>
      <p className="eyebrow">Architecture</p>
      <h1>Refund Time Prediction</h1>
      <p className="lede">
        Until an agency sets a payment date, we estimate when the refund will be available. The strongest signal is the
        return itself: which tax forms were filed, and how many of each.
      </p>

      <section>
        <h2>Why forms are the right signal</h2>
        <ul className="points">
          <li>
            <strong>Complexity drives processing time.</strong> A return with one W-2 is matched and paid quickly. Add
            self-employment income, marketplace health coverage, or education credits, and there's more to reconcile and
            a better chance of review.
          </li>
          <li>
            <strong>Some forms trigger known holds.</strong> Refunds claiming the EITC or ACTC can't be issued before
            mid-February, and an injured spouse allocation adds weeks. The forms say so up front.
          </li>
          <li>
            <strong>We know the forms exactly.</strong> We prepared the return, so its composition is a fact, not a guess,
            and it's available the moment the return is filed.
          </li>
          <li>
            <strong>It explains the off season.</strong> Extension filers skew toward complex returns. A model that sees
            the forms doesn't need to treat October as a special case. See{' '}
            <Link to="/operations/peak-season/extension-deadline">Extension Deadline</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>What it predicts</h2>
        <p>
          For each return at each agency: the number of days from the agency accepting it until the refund is available,
          as a range (the 10th, 50th, and 90th percentiles). The estimate is refreshed whenever the status changes, given
          how long the return has already waited. It is replaced by the agency's own date as soon as there is one, and
          never shown once the refund has been sent.
        </p>
      </section>

      <section>
        <h2>Try it</h2>
        <FormExplorer />
      </section>

      <section>
        <h2>Features</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Group</th><th>Features</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr><td>Form composition</td><td>A count of each form and schedule in a fixed vocabulary: about 150 federal forms, plus each state's own. Anything outside it counts as "other".</td><td>The core signal. Counts, never contents.</td></tr>
            <tr><td>Form families</td><td>Totals for business, investment, credits, international, and information returns, and the number of distinct schedules</td><td>Rare forms borrow strength from common ones in the same family.</td></tr>
            <tr><td>Held credits</td><td>EITC and ACTC flags, and days until the mid-February release</td><td>Encodes a legal hold the model shouldn't have to rediscover.</td></tr>
            <tr><td>Amounts, bucketed</td><td>Refund size band, and credits as a share of the refund</td><td>Large refunds and credit-heavy refunds are processed differently. Never exact amounts.</td></tr>
            <tr><td>Timing and channel</td><td>Agency, week of the season, days since acceptance, e-file or paper, direct deposit or check</td><td>The same return takes longer in April than in January.</td></tr>
            <tr><td>Agency load</td><td>Each agency's median processing time for returns accepted in the same week</td><td>Captures backlogs as they build.</td></tr>
          </tbody>
        </table>
        <p>
          Never used: names, tax IDs, addresses or ZIP codes, employers, payers, bank details, and exact amounts. Prior-year
          history is used only if the taxpayer consented to it.
        </p>
      </section>

      <section>
        <h2>The model</h2>
        <ul className="points">
          <li>
            <strong>Gradient-boosted survival model</strong> per agency, such as XGBoost's accelerated failure time
            objective, or one quantile model per percentile. Boosted trees handle sparse form counts well and find
            interactions on their own, like the EITC combined with an early filing date.
          </li>
          <li>
            <strong>Returns still waiting count too.</strong> A survival model learns from returns that haven't been paid
            yet ("at least 30 days so far") without biasing estimates toward the fast ones that finished first.
          </li>
          <li>
            <strong>Known rules sit on top.</strong> The estimate never falls before the EITC/ACTC release date, and an
            agency-set payment date always wins.
          </li>
          <li>
            <strong>A simple baseline first.</strong> The demo version uses Kaplan-Meier curves per form-family segment.
            It's the fallback if the boosted model is unavailable, and the bar the boosted model has to beat.
          </li>
        </ul>
      </section>

      <section>
        <h2>Training and evaluation</h2>
        <ul className="checks">
          <li>Labels come from status history: the time from acceptance to "refund sent" or "refund adjusted" in <code>return_events</code>. Returns still waiting are kept as censored.</li>
          <li>Backtest by season: train on last season, test on this one, so the model is judged on data it couldn't have seen.</li>
          <li>Measure the error of the middle estimate, and how often the refund lands inside the range. About 80% should land between the 10th and 90th percentiles.</li>
          <li>Check both overall and per segment: each form family, each held credit, each filing month including October, and each refund size band, so complex or low-income returns aren't systematically wrong.</li>
          <li>Retrain weekly in season, run new versions in shadow before they serve, and keep every version in the registry for rollback.</li>
        </ul>
      </section>

      <section>
        <h2>Explaining an estimate</h2>
        <p>
          Per-feature contributions (for example SHAP values) show which forms moved an estimate. Support agents see them
          directly: "Schedule C and Form 8962 add about a week." Taxpayers see a plain phrase, like "Returns with
          self-employment income usually take longer," never a suggestion that the agency is reviewing them.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <ul className="checks">
          <li>Training uses only returns whose taxpayer consented under §7216, exported without identifiers to a separate ML environment, as shown in the <Link to="/architecture/high-level">High-Level Design</Link>.</li>
          <li>Form counts and bucketed amounts can still single someone out if the combination is rare enough. Any combination shared by fewer than 50 returns is rolled up to its form families before training.</li>
          <li>Inference payloads, logs, and traces carry the model version and a return token, never the features.</li>
        </ul>
        <p>
          If the model is slow, unavailable, or unsure, the status page falls back to the agency's published guidance, such
          as "most refunds within 21 days," and never waits on the model.
        </p>
      </section>

      <p className="note">
        <strong>Demo status:</strong> not built yet. Demo returns record only the main form and a few lines (wages,
        withholding, interest, itemized deductions, and dependents), so a demo model would start from a small form
        vocabulary derived from those.
      </p>
    </>
  )
}

export const predictionPages = {
  prediction: Prediction,
}
