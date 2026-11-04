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
}

const STATE_FORMS = { CA: '540', NY: 'IT-201' }

// The forms a taxpayer files: the federal 1040 plus their state's return.
export const formsFor = (user) => ['1040', STATE_FORMS[user?.state] ?? '540']

// Published test routing number (valid checksum) and a fake account, for the demo only.
export const SAMPLE_BANK = { routingNumber: '110000000', accountNumber: '000123456789' }
