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

// --- Phase 2: amounts relative to income ---
//
// Each item is a figure from a form, measured against the return's total income. bands are
// [upper ratio, days added on top of the Phase 1 estimate]; like Phase 1's, the numbers are made up to
// show the shape: a figure that's small for the income adds nothing, an outsized one adds time.
const RATIO_ITEMS = [
  {
    id: 'charity', label: 'Charitable gifts', form: 'Schedule A', start: 12000,
    bands: [[0.03, 0], [0.1, 1], [0.2, 3], [Infinity, 6]],
    why: 'Gifts that are large for the income are compared against what similar filers give.',
  },
  {
    id: 'itemized', label: 'All itemized deductions', form: 'Schedule A', start: 30000,
    bands: [[0.1, 0], [0.25, 1], [0.4, 3], [Infinity, 7]],
    why: 'Deductions that take a large share of income draw a closer look.',
  },
  {
    id: 'schCloss', label: 'Business loss', form: 'Schedule C', start: 20000,
    bands: [[0.05, 0], [0.2, 3], [0.5, 6], [Infinity, 10]],
    why: 'A loss that cancels out most of the other income is a classic review trigger.',
  },
  {
    id: 'schEloss', label: 'Rental loss', form: 'Schedule E', start: 10000,
    bands: [[0.05, 0], [0.25, 2], [Infinity, 5]],
    why: 'Large passive losses are checked against the limits on deducting them.',
  },
]

const INCOME_BANDS = [25000, 50000, 100000, 200000, 500000]
const COMPARE_INCOMES = [40000, 100000, 250000, 500000]

const pct = (r) => `${r < 0.1 ? (r * 100).toFixed(1) : Math.round(r * 100)}%`
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`

// The band a ratio falls in: its label, the feature value the model sees, and the illustrative days.
function ratioBand(item, ratio) {
  let lower = 0
  for (const [upper, days] of item.bands) {
    if (ratio < upper) {
      const label = upper === Infinity ? `over ${pct(lower)}` : lower === 0 ? `under ${pct(upper)}` : `${pct(lower)}–${pct(upper)}`
      return { label, days, feature: label.replace(/[ %–]+/g, '_').replace(/_$/, '') }
    }
    lower = upper
  }
}

function incomeBand(income) {
  const upper = INCOME_BANDS.find((b) => income < b)
  const lower = [0, ...INCOME_BANDS][INCOME_BANDS.indexOf(upper)] ?? INCOME_BANDS.at(-1)
  return upper ? `${lower / 1000}k_${upper / 1000}k` : `${lower / 1000}k_plus`
}

function RatioExplorer() {
  const [itemId, setItemId] = useState('charity')
  const item = RATIO_ITEMS.find((i) => i.id === itemId)
  const [income, setIncome] = useState(60000)
  const [amount, setAmount] = useState(item.start)
  const ratio = amount / income
  const band = ratioBand(item, ratio)

  return (
    <figure className="fx">
      <div className="fx-grid">
        <div className="fx-controls">
          <label className="fx-field">
            <span className="fx-label">Figure on the return</span>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value)
                setAmount(RATIO_ITEMS.find((i) => i.id === e.target.value).start)
              }}
            >
              {RATIO_ITEMS.map((i) => <option key={i.id} value={i.id}>{i.label} ({i.form})</option>)}
            </select>
          </label>
          <label className="fx-field">
            <span className="fx-label">Amount: {usd(amount)}</span>
            <input type="range" min="0" max="100000" step="500" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label className="fx-field">
            <span className="fx-label">Total income: {usd(income)}</span>
            <input type="range" min="20000" max="500000" step="5000" value={income} onChange={(e) => setIncome(Number(e.target.value))} />
          </label>
        </div>

        <div className="fx-result" aria-live="polite">
          <p className="fx-label">Illustrative effect, on top of the form-type estimate</p>
          <p className="fx-range">{band.days ? `+${band.days} days` : 'No added time'}</p>
          <p className="fx-median">
            {item.label} are {pct(ratio)} of income: {band.label}.
          </p>
          <p className="fx-note">{band.days ? item.why : 'Small for this income, so it draws no more attention than not having it.'}</p>

          <p className="fx-label">The same {usd(amount)} at other incomes</p>
          <ul className="fx-reasons">
            {COMPARE_INCOMES.map((inc) => {
              const b = ratioBand(item, amount / inc)
              return (
                <li key={inc}>
                  <span>{usd(inc)} income · {pct(amount / inc)}</span>
                  <strong className={b.days ? '' : 'none'}>{b.days ? `+${b.days}d` : '+0d'}</strong>
                </li>
              )
            })}
          </ul>

          <p className="fx-label">Features Phase 2 adds</p>
          <div className="fx-vector">
            <code>income_band={incomeBand(income)}</code>
            <code>{item.id}/income={band.feature}</code>
          </div>
        </div>
      </div>
      <figcaption>
        The bands and days are made up to show the idea. The model sees only the bands, never the amounts or the income,
        and learns from past returns how much each band actually adds.
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
        return itself. Phase 1 learns from which tax forms were filed, and how many of each. Phase 2 adds how big the
        figures on those forms are relative to the taxpayer's income.
      </p>

      <table className="metrics compare">
        <thead>
          <tr>
            <th></th>
            <th><Link to="/architecture/prediction/phase-1">Phase 1: form types</Link></th>
            <th><Link to="/architecture/prediction/phase-2">Phase 2: amounts relative to income</Link></th>
          </tr>
        </thead>
        <tbody>
          <tr><td>The model sees</td><td>A count of each form and schedule, plus timing, channel, and agency load</td><td>Everything in Phase 1, plus each key figure as a share of income, in bands</td></tr>
          <tr><td>It can tell</td><td>A return with Schedule C takes longer than one without</td><td>A $2,000 deduction on $300,000 of income is routine; the same deduction on $25,000 is not</td></tr>
          <tr><td>Ships</td><td>Season 2, shadowed against Season 1 outcomes first</td><td>Once it beats Phase 1 in backtests, overall and in every income band</td></tr>
        </tbody>
      </table>

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
        <h2>The model</h2>
        <p>
          Two survival algorithms, trained per agency on the same features in both phases. Both learn from returns that
          haven't been paid yet ("at least 30 days so far"), so estimates aren't biased toward the fast ones that finished
          first.
        </p>
        <table className="metrics compare">
          <thead>
            <tr><th></th><th>Gradient-boosted survival</th><th>Random survival forest</th></tr>
          </thead>
          <tbody>
            <tr><td>Role</td><td>Serves the estimates</td><td>Checks them: an independent second model on the same data</td></tr>
            <tr><td>How</td><td>XGBoost with the accelerated failure time objective: boosted trees predict the distribution of days until payment</td><td>Many survival trees on random samples of returns and features, averaged into a full survival curve for each return</td></tr>
            <tr><td>Strengths</td><td>Handles sparse form counts, finds interactions on its own (the EITC with an early filing date, a ratio with an income band), scores tens of millions of returns quickly, and explains itself with SHAP</td><td>Assumes nothing about the shape of the distribution, so it catches ranges the boosted model gets wrong when real waits don't fit its assumed shape</td></tr>
            <tr><td>Watch for</td><td>Assumes a distribution shape (normal, logistic, or extreme value), so its ranges need checking</td><td>Slower to train and score, and large; it runs in the batch sync, never on a request</td></tr>
            <tr><td>In Phase 2</td><td>Monotone constraints on the ratio bands, so a larger ratio can never shorten an estimate</td><td>No monotone constraints, which makes it a useful check on whether the constraints fit the data</td></tr>
          </tbody>
        </table>
        <ul className="points">
          <li>
            <strong>When they disagree.</strong> For each segment, if the forest's range differs from the boosted model's
            by more than a set margin, the estimate shows the wider of the two, and the segment is flagged for the next
            retraining review. Erring wide keeps the promise honest: refunds should land inside the range.
          </li>
          <li>
            <strong>Known rules sit on top.</strong> The estimate never falls before the EITC/ACTC release date, and an
            agency-set payment date always wins.
          </li>
          <li>
            <strong>A simple baseline first.</strong> Kaplan-Meier curves per form-family segment come before either
            model. They're the bar both models have to beat, the fallback if both are unavailable, and what the demo
            would build first.
          </li>
        </ul>
      </section>

      <section>
        <h2>Training and evaluation</h2>
        <ul className="checks">
          <li>Labels come from status history: the time from acceptance to "refund sent" or "refund adjusted" in <code>return_events</code>. Returns still waiting are kept as censored.</li>
          <li>Backtest by season: train on last season, test on this one, so the model is judged on data it couldn't have seen.</li>
          <li>Measure the error of the middle estimate, and how often the refund lands inside the range. About 80% should land between the 10th and 90th percentiles.</li>
          <li>Check both overall and per segment: each form family, each held credit, each filing month including October, and each refund size band, so complex or low-income returns aren't systematically wrong. Phase 2 adds each income band to the list.</li>
          <li>Phase 2 replaces Phase 1 only when it wins the same backtest on the same seasons, overall and in every segment, and then runs in shadow beside it before serving.</li>
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
        withholding, interest, itemized deductions, and dependents), so a demo Phase 1 model would start from a small form
        vocabulary derived from those. They already hold enough for one Phase 2 ratio: itemized deductions over wages and
        interest.
      </p>
    </>
  )
}

function PhaseOne() {
  return (
    <>
      <p className="eyebrow">Refund Time Prediction</p>
      <h1>Phase 1: Form Types</h1>
      <p className="lede">
        The first model knows what kind of return it is, not what's in it: which forms and schedules were filed, and how
        many of each. That alone separates a one-W-2 return from one with self-employment income, education credits, or
        a held EITC refund. It ships in Season 2, shadowed against Season 1 outcomes first.
      </p>

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
            <tr><td>Refund size</td><td>The refund in bands, such as under $1,000 or $1,000 to $5,000</td><td>Large refunds are processed differently. Never the exact amount.</td></tr>
            <tr><td>Timing and channel</td><td>Agency, week of the season, days since acceptance, e-file or paper, direct deposit or check</td><td>The same return takes longer in April than in January.</td></tr>
            <tr><td>Agency load</td><td>Each agency's median processing time for returns accepted in the same week</td><td>Captures backlogs as they build.</td></tr>
          </tbody>
        </table>
        <p>
          Never used: names, tax IDs, addresses or ZIP codes, employers, payers, bank details, and exact amounts. Prior-year
          history is used only if the taxpayer consented to it.
        </p>
      </section>

      <p>
        What Phase 1 can't see is whether a figure is unusual for the person who filed it.{' '}
        <Link to="/architecture/prediction/phase-2">Phase 2</Link> adds that.
      </p>
    </>
  )
}

function PhaseTwo() {
  return (
    <>
      <p className="eyebrow">Refund Time Prediction</p>
      <h1>Phase 2: Amounts Relative to Income</h1>
      <p className="lede">
        <Link to="/architecture/prediction/phase-1">Phase 1</Link> treats every Schedule A alike. Agencies don't: their
        screening compares each figure with what's normal for a return at that income. A deduction that's small next to a
        large income draws no more scrutiny than not having it, while the same deduction on a modest income stands out and
        is more likely to be reviewed. Phase 2 gives the model that context, so its estimate moves only when a figure is
        unusual for the person who filed it.
      </p>

      <section>
        <h2>Try it</h2>
        <RatioExplorer />
      </section>

      <section>
        <h2>Ratios</h2>
        <p>Phase 2 keeps every Phase 1 feature and adds these, each in bands:</p>
        <table className="metrics compare">
          <thead>
            <tr><th>Ratio</th><th>Measured as</th><th>Why it matters</th></tr>
          </thead>
          <tbody>
            <tr><td>Deductions to income</td><td>Total itemized deductions, and charitable gifts on their own, over total income</td><td>Large deductions for the income are compared against similar filers.</td></tr>
            <tr><td>Losses to income</td><td>Schedule C business losses and Schedule E rental losses over income from other sources</td><td>Losses that wipe out other income are a common review trigger.</td></tr>
            <tr><td>Credits to tax</td><td>Each refundable credit over the tax before credits, and the EITC over earned income</td><td>Credits that exceed the tax by a wide margin get extra verification.</td></tr>
            <tr><td>Unmatched income share</td><td>Income with no matching W-2 or 1099 (mostly self-employment) over total income</td><td>Income the agency can't match against payer records takes longer to verify.</td></tr>
            <tr><td>Withholding to tax</td><td>Tax withheld and paid over the tax owed, which sets the size of the refund relative to the return</td><td>A refund out of proportion to the income is checked before it's paid.</td></tr>
            <tr><td>Income band</td><td>Total income in bands, such as $50,000 to $100,000</td><td>Lets the model learn what's normal at each income, instead of one rule for everyone.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Guardrails</h2>
        <ul className="checks">
          <li>
            <strong>Bands, never amounts.</strong> Ratios and income are computed inside production and leave only as bands,
            like "3–10%" or "$50,000 to $100,000". The 50-return rollup in{' '}
            <Link to="/architecture/prediction">Privacy</Link> applies to the new combinations too, which matters more now
            that they're finer.
          </li>
          <li>
            <strong>No help gaming the agency.</strong> Taxpayers see the same plain wording as in Phase 1, such as "Returns
            like yours usually take a little longer." We never say which figure moved the estimate, so the estimate can't be
            used to tune deductions until they stop looking unusual. Support agents see the form families involved, not the
            ratios.
          </li>
          <li>
            <strong>Fair across incomes.</strong> Ratios run higher at low incomes by nature: the EITC is large relative to
            income by design. The model has to be checked per income band, so low-income returns aren't told to wait longer
            than they really do, and Phase 2 ships only if no band gets worse than in Phase 1.
          </li>
          <li>
            <strong>Prediction only.</strong> Like Phase 1, Phase 2 only estimates. It never changes how or when a return is
            filed, held, or checked.
          </li>
        </ul>
      </section>

      <section>
        <h2>When it replaces Phase 1</h2>
        <ul className="points">
          <li>Phase 1 has served at least one season and its ranges are calibrated, so there's a fair baseline to beat.</li>
          <li>Phase 2 wins the same season backtest, overall and in every segment, including each income band.</li>
          <li>It then runs in shadow beside Phase 1 before it serves anyone, and Phase 1 stays in the registry for rollback.</li>
        </ul>
        <p>
          Until then, Phase 1 serves alone. The demo's returns already hold enough for one Phase 2 ratio: itemized
          deductions over wages and interest.
        </p>
      </section>
    </>
  )
}

export const predictionPages = {
  prediction: Prediction,
  'prediction-phase-1': PhaseOne,
  'prediction-phase-2': PhaseTwo,
}
