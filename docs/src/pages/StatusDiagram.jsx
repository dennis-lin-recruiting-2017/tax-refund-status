import StepDiagram from '../components/StepDiagram.jsx'

// The refund status state machine, as the demo implements it. Transitions come from the processor
// (transmit or hold), the batch sync's MapStatus (anything the agency reports), and the admin release.

const NODES = {
  received: {
    x: 30, y: 140, w: 130, h: 56, title: 'Received', sub: 'with us',
    points: [
      ['demo', 'The return is stored and waiting in its agency\'s queue. The processor screens it, then transmits it.'],
      [null, 'Taxpayer sees: "We\'ll send your return to the agency shortly."'],
    ],
  },
  processing: {
    x: 220, y: 140, w: 130, h: 56, title: 'Processing', sub: 'at the agency',
    points: [
      ['demo', 'The agency has the return. Both its "received" and "processing" statuses show as Processing.'],
      ['demo', 'The batch sync keeps checking until the status changes.'],
      [null, 'Taxpayer sees when we last checked, and when we\'ll check next.'],
    ],
  },
  approved: {
    x: 410, y: 60, w: 130, h: 56, title: 'Approved', sub: 'date set',
    points: [
      ['demo', 'The agency approved the refund and set a payment date, which replaces any estimate.'],
      ['demo', 'The next check waits for the payment date, the next point at which anything can change.'],
      [null, 'Taxpayer sees the approved amount, the date, and the last 4 digits of the bank account.'],
    ],
  },
  sent: {
    kind: 'store', x: 600, y: 20, w: 130, h: 56, title: 'Refund sent', sub: 'final · as filed',
    points: [
      ['demo', 'The agency paid the refund as filed. Final: the return is never checked again.'],
      [null, 'Taxpayer sees: "Allow up to 5 days for your bank to post it."'],
    ],
  },
  adjusted: {
    kind: 'store', x: 600, y: 100, w: 130, h: 56, title: 'Refund adjusted', sub: 'final · changed',
    points: [
      ['demo', 'The agency paid a different amount from the one claimed. Final.'],
      [null, 'Taxpayer sees the adjusted amount, what they claimed, and the agency\'s reason.'],
    ],
  },
  accepted: {
    kind: 'store', x: 410, y: 220, w: 130, h: 56, title: 'Accepted', sub: 'final · no refund',
    points: [
      ['demo', 'The return had no refund, and the agency accepted it. Final.'],
      [null, 'If there\'s a balance, taxpayer sees the amount the agency reports, and to pay it by the filing deadline.'],
    ],
  },
  action: {
    kind: 'alert', x: 220, y: 300, w: 130, h: 56, title: 'Action needed', sub: 'held',
    points: [
      ['demo', 'Held by us: duplicate screening stopped the return before transmission. An admin releases it after identity verification.'],
      ['demo', 'Held by the agency: it needs something from the taxpayer. The batch sync keeps checking, because the agency resolves it.'],
      [null, 'Taxpayer sees what\'s needed, and a reminder that we never ask for personal details by email or text.'],
    ],
  },
}

const EDGES = [
  { id: 're-pr', from: 'received', to: 'processing', d: 'M160 168 H220', label: 'transmitted', lx: 190, ly: 160 },
  { id: 'pr-ap', from: 'processing', to: 'approved', d: 'M350 156 C380 156 380 88 410 88', label: 'approved', lx: 372, ly: 104, anchor: 'end' },
  { id: 'pr-ac', from: 'processing', to: 'accepted', d: 'M350 180 C380 180 380 248 410 248', label: 'no refund', lx: 372, ly: 232, anchor: 'end' },
  { id: 'ap-se', from: 'approved', to: 'sent', d: 'M540 78 C570 78 570 48 600 48', label: 'paid as filed', lx: 570, ly: 44 },
  { id: 'ap-ad', from: 'approved', to: 'adjusted', d: 'M540 98 C570 98 570 128 600 128', label: 'paid differently', lx: 570, ly: 146 },
  { id: 're-ac', from: 'received', to: 'action', d: 'M80 196 V336 H220', label: 'screening flags it', lx: 150, ly: 352 },
  { id: 'ac-re', from: 'action', to: 'received', d: 'M220 316 H118 V196', label: 'admin releases', lx: 170, ly: 308 },
  { id: 'pr-na', from: 'processing', to: 'action', d: 'M265 196 V300', label: 'agency asks', lx: 257, ly: 250, anchor: 'end' },
  { id: 'na-pr', from: 'action', to: 'processing', d: 'M305 300 V196', label: 'agency resolves', lx: 313, ly: 250, anchor: 'start' },
  { id: 'ap-na', from: 'approved', to: 'action', d: 'M425 116 C405 200 385 322 350 328', label: 'agency asks', lx: 400, ly: 318, anchor: 'start' },
]

const FLOWS = [
  {
    id: 'filed', title: 'Refund as filed', steps: [
      { nodes: ['received'], text: 'The taxpayer files. The return is stored as Received, its place in the agency\'s queue.' },
      { edges: ['re-pr'], text: 'The processor screens it and transmits it. History: "We sent your return to the IRS."' },
      { edges: ['pr-ap'], text: 'A batch run finds the agency has approved it. The payment date replaces the estimate.' },
      { edges: ['ap-se'], text: 'On the payment date, the agency reports it sent. Checks stop, because the status is final.' },
    ],
  },
  {
    id: 'adjusted', title: 'Refund adjusted', steps: [
      { edges: ['re-pr'], text: 'Filed and transmitted like any other return.' },
      { edges: ['pr-ap'], text: 'The agency approves, possibly for a different amount. If so, the taxpayer sees both the approved amount and what they claimed.' },
      { edges: ['ap-ad'], text: 'The agency pays a different amount, with its reason. The taxpayer sees Refund adjusted in place of Refund sent, so nobody mistakes it for the refund they expected.' },
    ],
  },
  {
    id: 'balance', title: 'Balance due', steps: [
      { edges: ['re-pr'], text: 'A return with no refund is filed and transmitted the same way.' },
      { edges: ['pr-ac'], text: 'The agency accepts it. If there\'s a balance, the taxpayer sees the amount the agency reports. Paying it happens elsewhere.' },
    ],
  },
  {
    id: 'held', title: 'Held by screening', steps: [
      { edges: ['re-ac'], text: 'Screening finds another taxpayer\'s return paying the same bank account with near-identical figures. The return is held before it reaches an agency.' },
      { edges: ['ac-re'], text: 'After identity verification, an admin releases it. The release is audited.' },
      { edges: ['re-pr'], text: 'It goes back in the queue, and isn\'t screened out a second time.' },
    ],
  },
  {
    id: 'agency', title: 'Agency needs more', steps: [
      { edges: ['pr-na'], text: 'The agency asks for something, such as verifying identity. The taxpayer sees its message and what to do.' },
      { edges: ['na-pr'], text: 'The batch sync keeps checking, because only the agency can resolve it. The return carries on from there.' },
    ],
  },
]

export default function StatusDiagram() {
  return (
    <StepDiagram
      id="status"
      nodes={NODES}
      edges={EDGES}
      flows={FLOWS}
      height={376}
      label="Refund status states and the transitions between them"
      hint="Select a state to see what it means and what the taxpayer sees, or walk through a path. Green states are final."
    />
  )
}
