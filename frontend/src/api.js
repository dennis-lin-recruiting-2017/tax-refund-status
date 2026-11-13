export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Request failed (${status})`)
    this.status = status
    this.fields = body?.fields ?? {}
  }
}

// Same-origin requests only. The session lives in an HttpOnly cookie the app can't read;
// X-Requested-With is required by the backend for every state-changing request (CSRF defense).
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'fetch',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const formatMoney = (n) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// A calculation line's amount: dollars, except the share-of-income line on nonresident returns.
export const formatLine = (l) => (l.label.endsWith('(%)') ? `${l.amount}%` : formatMoney(l.amount))

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married filing jointly' },
  { value: 'married_separate', label: 'Married filing separately' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
]

export const filingStatusLabel = (v) => FILING_STATUSES.find((s) => s.value === v)?.label ?? v

export const FORMS = {
  1040: {
    id: '1040',
    title: 'Form 1040',
    subtitle: 'U.S. Individual Income Tax Return',
    agency: 'Federal',
    wagesLabel: 'Wages (W-2 box 1)',
    withholdingLabel: 'Federal income tax withheld (W-2 box 2)',
    sample: { wages: 72000, withholding: 8500, interest: 120 },
  },
  540: {
    id: '540',
    title: 'CA Form 540',
    subtitle: 'California Resident Income Tax Return',
    agency: 'California',
    wagesLabel: 'CA wages (W-2 box 16)',
    withholdingLabel: 'CA income tax withheld (W-2 box 17)',
    sample: { wages: 72000, withholding: 2900, interest: 120 },
  },
  'IT-201': {
    id: 'IT-201',
    title: 'NY Form IT-201',
    subtitle: 'New York Resident Income Tax Return',
    agency: 'New York',
    wagesLabel: 'NY wages (W-2 box 16)',
    withholdingLabel: 'NY income tax withheld (W-2 box 17)',
    sample: { wages: 72000, withholding: 3900, interest: 120 },
  },
  '540NR': {
    id: '540NR',
    title: 'CA Form 540NR',
    subtitle: 'California Nonresident or Part-Year Resident Income Tax Return',
    agency: 'California',
    allocated: true,
    wagesLabel: 'Wages from all sources (W-2 box 1)',
    withholdingLabel: 'CA income tax withheld (W-2 box 17)',
    stateIncomeLabel: 'Income from California sources',
    sample: { wages: 72000, withholding: 900, interest: 120, stateIncome: 24000 },
  },
  'IT-203': {
    id: 'IT-203',
    title: 'NY Form IT-203',
    subtitle: 'New York Nonresident and Part-Year Resident Income Tax Return',
    agency: 'New York',
    allocated: true,
    wagesLabel: 'Wages from all sources (W-2 box 1)',
    withholdingLabel: 'NY income tax withheld (W-2 box 17)',
    stateIncomeLabel: 'Income from New York sources',
    sample: { wages: 72000, withholding: 1200, interest: 120, stateIncome: 24000 },
  },
}

const STATE_FORMS = {
  CA: { resident: '540', other: '540NR' },
  NY: { resident: 'IT-201', other: 'IT-203' },
}

export const RESIDENCY_LABELS = { resident: 'resident', part_year: 'part-year resident', nonresident: 'nonresident' }

const stateFormFor = (f) => STATE_FORMS[f.state]?.[f.residency === 'resident' ? 'resident' : 'other']

// The forms a taxpayer files: the federal 1040, then one return per state. Part-year and
// nonresident returns come first, because the resident return claims a credit for their tax.
export const formsFor = (user) => ['1040', ...(user?.states ?? []).map(stateFormFor).filter(Boolean)]

// For a resident state return: the other states whose returns must be filed first.
export const fileFirst = (user, formId, filedForms) =>
  FORMS[formId]?.allocated || formId === '1040'
    ? []
    : (user?.states ?? [])
        .filter((f) => f.incomeTax && f.residency !== 'resident' && !filedForms.includes(stateFormFor(f)))
        .map((f) => f.name)

// Why there's no return for a state without an income tax, for the dashboard.
export const noReturnNotes = (user) =>
  (user?.states ?? [])
    .filter((f) => !f.incomeTax)
    .sort((a, b) => (a.residency === 'nonresident') - (b.residency === 'nonresident')) // where they live first
    .map((f) => {
      const where = {
        resident: `You live in ${f.name}`,
        part_year: `You lived in ${f.name} for part of the year`,
        nonresident: `You also earned income in ${f.name}`,
      }[f.residency]
      return `${where}, which has no state income tax, so no ${f.name} return is needed.`
    })

// Published test routing number (valid checksum) and a fake account, for the demo only.
export const SAMPLE_BANK = { routingNumber: '110000000', accountNumber: '000123456789' }
