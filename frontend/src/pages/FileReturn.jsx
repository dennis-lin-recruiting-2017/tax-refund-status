import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, FILING_STATUSES, FORMS, formatLine, formatMoney, formsFor, SAMPLE_BANK } from '../api.js'
import { useAuth } from '../auth.jsx'

const EMPTY = {
  filingStatus: '',
  wages: '',
  withholding: '',
  interest: '',
  itemizedDeductions: '',
  dependents: '',
  stateIncome: '',
  routingNumber: '',
  accountNumber: '',
}

const digits = (v, max) => v.replace(/\D/g, '').slice(0, max)

function toPayload(values, form) {
  const n = (v) => (v === '' ? 0 : Number(v))
  return {
    ...(form.allocated && { stateIncome: n(values.stateIncome) }),
    filingStatus: values.filingStatus,
    wages: n(values.wages),
    withholding: n(values.withholding),
    interest: n(values.interest),
    itemizedDeductions: n(values.itemizedDeductions),
    dependents: n(values.dependents),
    routingNumber: values.routingNumber,
    accountNumber: values.accountNumber,
  }
}

function Field({ label, name, values, errors, onChange, hint, prefix, maxDigits = 9, ...rest }) {
  return (
    <label className={`field${errors[name] ? ' invalid' : ''}`}>
      <span>{label}</span>
      <div className={prefix ? 'input-prefix' : undefined}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          inputMode="numeric"
          autoComplete="off"
          value={values[name]}
          onChange={(e) => onChange(name, digits(e.target.value, maxDigits))}
          aria-invalid={Boolean(errors[name])}
          {...rest}
        />
      </div>
      {errors[name] ? <small className="field-error">{errors[name]}</small> : hint && <small>{hint}</small>}
    </label>
  )
}

export default function FileReturn() {
  const { form: formId } = useParams()
  const form = FORMS[formId]
  const { user } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState(null) // pre-filled W-2 data for demo accounts

  const allowed = form && formsFor(user).includes(form.id)

  const applyDraft = (d) => {
    // Leave optional fields blank rather than showing a 0 the tester didn't enter.
    const toField = (k, v) => (v === undefined || (k === 'itemizedDeductions' && v === 0) ? '' : String(v))
    setValues(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, toField(k, d[k])])))
    setErrors({})
    setEstimate(null)
  }

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    api(`/drafts/${form.id}`)
      .then((d) => {
        if (cancelled) return
        setDraft(d)
        applyDraft(d)
      })
      .catch(() => {}) // no pre-filled form for this account: start empty
    return () => {
      cancelled = true
    }
  }, [allowed, form?.id])

  if (!allowed) return <Navigate to="/" replace />

  const onChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
    setEstimate(null)
  }

  const fillSample = () => {
    setValues((v) => ({
      ...v,
      filingStatus: v.filingStatus || 'single',
      wages: String(form.sample.wages),
      withholding: String(form.sample.withholding),
      interest: String(form.sample.interest),
      stateIncome: form.sample.stateIncome ? String(form.sample.stateIncome) : '',
      ...SAMPLE_BANK,
    }))
    setErrors({})
    setEstimate(null)
  }

  async function run(action) {
    setPending(true)
    setError('')
    try {
      if (action === 'review') {
        setEstimate(await api(`/returns/${form.id}/estimate`, { method: 'POST', body: toPayload(values, form) }))
        return
      }
      await api(`/returns/${form.id}`, { method: 'POST', body: toPayload(values, form) })
      navigate('/', { state: { flash: `Your ${form.title} was submitted. You can track it below.` } })
    } catch (err) {
      setErrors(err.fields)
      setError(err.message)
      setEstimate(null)
    } finally {
      setPending(false)
    }
  }

  const props = { values, errors, onChange }

  return (
    <div className="page">
      <p className="breadcrumbs">
        <Link to="/">Your returns</Link> / {form.title}
      </p>
      <p className="eyebrow">{form.agency} · Tax year 2025</p>
      <h1>{form.title}</h1>
      <p className="muted">
        {form.subtitle}. Filing as {user.fullName}, tax ID •••-••-{user.taxIdLast4}.
      </p>

      {draft ? (
        <div className="banner">
          <strong>Ready to submit.</strong> We pre-filled this from the W-2 and bank account on file for this demo account.
          Review it, then click Review and Submit.
          <button type="button" className="btn small secondary" onClick={() => applyDraft(draft)}>
            Reset to W-2
          </button>
        </div>
      ) : (
        <div className="banner">
          <strong>Sample data only.</strong> Calculations are simplified for the demo. Use the sample W-2 or made-up
          numbers.
          <button type="button" className="btn small secondary" onClick={fillSample}>
            Use sample W-2
          </button>
        </div>
      )}

      <form
        className="panel form wide"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          run(estimate ? 'submit' : 'review')
        }}
      >
        <fieldset>
          <legend>Filing status</legend>
          <label className={`field${errors.filingStatus ? ' invalid' : ''}`}>
            <span>Filing status</span>
            <select value={values.filingStatus} onChange={(e) => onChange('filingStatus', e.target.value)}>
              <option value="">Select…</option>
              {FILING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {errors.filingStatus && <small className="field-error">{errors.filingStatus}</small>}
          </label>
          <Field label="Qualifying children under 17" name="dependents" maxDigits={2} placeholder="0" {...props} />
        </fieldset>

        <fieldset>
          <legend>Income and withholding</legend>
          <div className="grid">
            <Field label={form.wagesLabel} name="wages" prefix="$" placeholder="0" {...props} />
            <Field label={form.withholdingLabel} name="withholding" prefix="$" placeholder="0" {...props} />
            <Field label="Taxable interest" name="interest" prefix="$" placeholder="0" {...props} />
            {form.allocated && (
              <Field
                label={form.stateIncomeLabel}
                name="stateIncome"
                prefix="$"
                placeholder="0"
                hint="Wages and interest earned while living or working in the state. The state taxes this share."
                {...props}
              />
            )}
            <Field
              label="Itemized deductions (optional)"
              name="itemizedDeductions"
              prefix="$"
              placeholder="0"
              hint="The larger of this or the standard deduction is used."
              {...props}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Direct deposit</legend>
          <div className="grid">
            <Field label="Routing number" name="routingNumber" placeholder="9 digits" {...props} />
            <Field label="Account number" name="accountNumber" maxDigits={17} placeholder="4–17 digits" hint="Only the last 4 digits are stored." {...props} />
          </div>
        </fieldset>

        {error && <div className="alert error" role="alert">{error}</div>}

        {estimate && (
          <div className="review">
            <h2>Review</h2>
            <table className="calc">
              <tbody>
                {estimate.lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{formatLine(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="review-total">
              {estimate.owed > 0 ? `You owe ${formatMoney(estimate.owed)}` : `Your refund: ${formatMoney(estimate.refund)}`}
            </p>
          </div>
        )}

        <div className="actions">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Working…' : estimate ? 'Submit return' : 'Review'}
          </button>
          <Link to="/" className="btn secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
