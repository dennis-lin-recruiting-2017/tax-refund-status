import { Link } from 'react-router-dom'

export default function Overview() {
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Tax Refund Status Service</h1>
      <p className="lede">
        A service in a TurboTax-style filing product that shows customers where their most recent tax refund
        is, from the moment their return is filed until the money arrives, and predicts how long the rest of
        the wait will take.
      </p>

      <section>
        <h2>Problem statement</h2>
        <p>
          Once a customer files their federal and state returns, the refund disappears into a process they can't
          see. The IRS and state tax agencies receive the return, validate it, possibly flag it for review,
          approve it, and finally pay it out, sometimes for a different amount than was claimed. Those agencies
          update on their own schedules, often with delays, and none of their systems were built to answer the
          two questions the customer has: <em>"Where is my refund, and when will I get it?"</em>
        </p>
        <p>
          Answering the second question takes more than relaying the agency's status. Until an agency sets a
          payment date, the service uses an <strong>AI model</strong> to estimate when the refund will be
          available. The model is trained on how long similar returns actually took, so the system also has to
          collect that training data and make inference requests, all without exposing taxpayer data.
        </p>
        <p>
          Without a reliable way to answer those questions themselves, taxpayers call support lines, file
          duplicate returns, or simply worry. Support centers are overwhelmed in exactly the weeks when
          they're needed most, and the people waiting on the refund, often counting on it to pay bills, get
          vague answers.
        </p>
        <blockquote className="callout">
          Design a service that gives customers an accurate, timely, and secure view of the status of their
          most recent refund, predicts when a refund that hasn't arrived will be available, tells them what to do
          if there's a problem, and stays available under the extreme, seasonal load of filing season.
        </blockquote>
      </section>

      <section>
        <h2>Who uses it</h2>
        <div className="cards">
          <div className="card">
            <h3>Taxpayers</h3>
            <p>
              Customers who filed through the product and are signed in to their account. Most check a handful of
              times; some check daily. They use phones more than desktops.
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
            <h3>Operations and data science</h3>
            <p>
              Engineers who run the agency integrations through peak season, and the team that trains, evaluates,
              and monitors the refund-time model.
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
          <li><strong>Return received</strong><span>The agency has the return. The model gives a first estimate of when the refund will arrive.</span></li>
          <li><strong>Under processing</strong><span>Validation, matching, and any manual review. The estimate is refreshed as the return moves; if the agency needs something, the customer is told what to do.</span></li>
          <li><strong>Refund approved</strong><span>The agency confirms the amount and sets a payment date, which replaces the estimate.</span></li>
          <li><strong>Refund sent</strong><span>Funds are released by direct deposit or check, either as filed or, if the agency changed the amount, as a <em>refund adjusted</em> with the reason.</span></li>
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
            <strong>Sensitive data behind one sign-in.</strong> A customer's account holds tax IDs, income, and
            bank details, so account takeover is the main threat. Sign-in has to be strong without being painful,
            and nothing about one customer's refund may leak to another.
          </li>
          <li>
            <strong>Status comes from systems we don't control.</strong> The IRS and each state own the truth,
            update on different schedules, and offer no push notifications, so the service has to ask them, in
            bulk, within their rate limits.
          </li>
          <li>
            <strong>Predicting an uncertain wait.</strong> Processing times vary with the filing date, the
            credits claimed, the agency's backlog, and review. The estimate has to be honest about its
            uncertainty, fall back gracefully when the model is unavailable, and train on outcomes without
            exposing personal data.
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
          <li>Show the current status of a customer's most recent federal and state refunds for the current tax year.</li>
          <li>Until the agency sets a payment date, show an AI estimate of when the refund will be available, as a range.</li>
          <li>Show the agency's payment date and amount once known, including why a refund was adjusted.</li>
          <li>Tell customers what to do when there's a problem: the agency needs information, the refund changed, or it's late.</li>
          <li>Protect accounts with strong sign-in, and resist takeover, enumeration, and abuse.</li>
          <li>Collect training data and serve predictions without exposing personal data.</li>
          <li>Stay available and fast during peak filing season.</li>
          <li>Optionally notify taxpayers when their status changes, so they don't need to keep checking.</li>
        </ul>

        <h2>Non-goals</h2>
        <ul className="crosses">
          <li>Preparing, filing, or amending tax returns.</li>
          <li>Changing refund details such as the amount or bank account.</li>
          <li>Guaranteeing a payment date. The estimate is a prediction; only the agency sets the date.</li>
          <li>Showing prior tax years, or paying a balance due. Returns with no refund show the balance the agency reports, and payment happens elsewhere.</li>
          <li>Replacing the agencies' processing systems, which own the status.</li>
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
            <tr><td>Estimate error, and how often the refund lands inside the range</td><td>An estimate customers can't rely on creates calls instead of preventing them.</td></tr>
            <tr><td>Fewer repeat checks per taxpayer</td><td>Signals that answers and notifications are clear enough.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Next in this design</h2>
        <p>
          The following sections in the navigation break this down into functional and non-functional
          requirements, the architecture of the system and its components (including the refund-time model), a dedicated{' '}
          <Link to="/security">Security</Link> section, and how it is operated through peak season. The{' '}
          <Link to="/demo">Demo</Link> shows the taxpayer experience with sample data.
        </p>
      </section>
    </>
  )
}
