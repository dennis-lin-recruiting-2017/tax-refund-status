import { Link } from 'react-router-dom'

export default function Overview() {
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Tax Refund Status Service</h1>
      <p className="lede">
        A self-service system that lets taxpayers check where their most recent tax refund is, from the
        moment their return is filed until the money arrives.
      </p>

      <section>
        <h2>Problem statement</h2>
        <p>
          Once a taxpayer files their return, the refund disappears into a process they can't see. The return
          is received, validated, possibly flagged for review, approved, and finally paid out by direct deposit
          or paper check. Each step happens in a different back-office system, and none of them were built to
          answer the one question the taxpayer has: <em>"Where is my refund, and when will I get it?"</em>
        </p>
        <p>
          Without a reliable way to answer that question themselves, taxpayers call support lines, file
          duplicate returns, or simply worry. Support centers are overwhelmed in exactly the weeks when
          they're needed most, and the people waiting on the refund, often counting on it to pay bills, get
          vague answers.
        </p>
        <blockquote className="callout">
          Design a service that gives taxpayers an accurate, timely, and secure view of the status of their
          most recent refund, and that stays available under the extreme, seasonal load of filing season.
        </blockquote>
      </section>

      <section>
        <h2>Who uses it</h2>
        <div className="cards">
          <div className="card">
            <h3>Taxpayers</h3>
            <p>
              Individuals who have already filed and are expecting a refund. Most check a handful of times;
              some check daily. They use phones more than desktops.
            </p>
          </div>
          <div className="card">
            <h3>Support agents</h3>
            <p>
              Call-center staff who need the same status view the taxpayer sees, so their answers match what
              the taxpayer read online.
            </p>
          </div>
          <div className="card">
            <h3>Tax preparers</h3>
            <p>
              Professionals and filing software that check status on behalf of clients, with the client's
              authorization.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>Where it fits in the journey</h2>
        <p>
          The service begins after filing is complete. It does not prepare or submit returns; it observes
          the refund as it moves through processing.
        </p>
        <ol className="timeline">
          <li><strong>Return received</strong><span>The return is accepted for processing.</span></li>
          <li><strong>Under processing</strong><span>Validation, matching, and any manual review.</span></li>
          <li><strong>Refund approved</strong><span>The amount is confirmed and a payment date is set.</span></li>
          <li><strong>Refund sent</strong><span>Funds are released by direct deposit or check.</span></li>
        </ol>
      </section>

      <section>
        <h2>What makes this hard</h2>
        <ul className="points">
          <li>
            <strong>Seasonal, spiky traffic.</strong> Load is concentrated in a few months a year, with sharp
            peaks around the start of the season, filing deadlines, and the days payments go out. The system
            must handle many times its average load without degrading.
          </li>
          <li>
            <strong>Sensitive data, no accounts.</strong> Many taxpayers won't have, or won't want, an online
            account. Identity has to be verified from information only the filer knows, without making the
            endpoint an oracle for guessing other people's data.
          </li>
          <li>
            <strong>Status comes from many systems.</strong> Intake, processing, review, and payment each own
            part of the truth, update on different schedules, and some are batch-oriented legacy systems.
          </li>
          <li>
            <strong>Accuracy over freshness, but not too stale.</strong> Showing the wrong status is worse
            than showing a slightly old one. Updates every few hours may be acceptable; a contradictory
            answer is not.
          </li>
          <li>
            <strong>Reducing, not shifting, support load.</strong> A vague status ("still processing") just
            moves the phone call later. The status must be specific enough to set expectations.
          </li>
        </ul>
      </section>

      <section>
        <h2>Goals</h2>
        <ul className="checks">
          <li>Show the current status of a taxpayer's most recent refund for the current tax year.</li>
          <li>Give an expected payment date once one is known, and explain delays when the return needs action.</li>
          <li>Verify identity without requiring an account, and resist enumeration and abuse.</li>
          <li>Stay available and fast during peak filing season.</li>
          <li>Optionally notify taxpayers when their status changes, so they don't need to keep checking.</li>
        </ul>

        <h2>Non-goals</h2>
        <ul className="crosses">
          <li>Preparing, filing, or amending tax returns.</li>
          <li>Changing refund details such as the amount or bank account.</li>
          <li>Showing history for prior tax years or for balances owed.</li>
          <li>Replacing the back-office processing systems that own the status.</li>
        </ul>
      </section>

      <section>
        <h2>How we'll know it works</h2>
        <table className="metrics">
          <thead>
            <tr><th>Measure</th><th>Why it matters</th></tr>
          </thead>
          <tbody>
            <tr><td>Fewer "where's my refund" support calls</td><td>The primary reason the service exists.</td></tr>
            <tr><td>Availability during peak weeks</td><td>The service is worthless if it's down when everyone checks.</td></tr>
            <tr><td>Status matches back-office record</td><td>Wrong answers erode trust and create calls.</td></tr>
            <tr><td>Time from status change to visible</td><td>Bounds how stale an answer can be.</td></tr>
            <tr><td>Fewer repeat checks per taxpayer</td><td>Signals that answers and notifications are clear enough.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Next in this design</h2>
        <p>
          The following sections in the navigation break this down into functional and non-functional
          requirements, the architecture of the system and its components, a dedicated{' '}
          <Link to="/security">Security</Link> section, and how it is operated through peak season. The{' '}
          <Link to="/demo">Demo</Link> shows the taxpayer experience with sample data.
        </p>
      </section>
    </>
  )
}
