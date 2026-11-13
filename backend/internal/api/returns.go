package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"taxrefund/internal/agency"
	"taxrefund/internal/auth"
	"taxrefund/internal/embedding"
	"taxrefund/internal/store"
	"taxrefund/internal/tax"
)

type formSpec struct {
	jurisdiction string
	resident     bool // state forms: for full residents, rather than part-year residents and nonresidents
	compute      func(tax.Input) tax.Result
}

var forms = map[string]formSpec{
	"1040":   {"federal", false, tax.Federal1040},
	"540":    {"CA", true, tax.California540},
	"540NR":  {"CA", false, tax.California540NR},
	"IT-201": {"NY", true, tax.NewYorkIT201},
	"IT-203": {"NY", false, tax.NewYorkIT203},
}

// allocated reports whether the form taxes only the state's share of income.
func (f formSpec) allocated() bool { return f.jurisdiction != "federal" && !f.resident }

type returnRequest struct {
	FilingStatus       tax.FilingStatus `json:"filingStatus"`
	Wages              int64            `json:"wages"`
	Withholding        int64            `json:"withholding"`
	Interest           int64            `json:"interest"`
	ItemizedDeductions int64            `json:"itemizedDeductions"`
	Dependents         int64            `json:"dependents"`
	RoutingNumber      string           `json:"routingNumber"`
	AccountNumber      string           `json:"accountNumber"`
	StateIncome        int64            `json:"stateIncome"` // part-year and nonresident forms only
}

const maxAmount = 100_000_000

func (req returnRequest) validate(spec formSpec, requireBank bool) map[string]string {
	errs := map[string]string{}
	if !req.FilingStatus.Valid() {
		errs["filingStatus"] = "Choose a filing status."
	}
	for field, v := range map[string]int64{
		"wages": req.Wages, "withholding": req.Withholding, "interest": req.Interest,
		"itemizedDeductions": req.ItemizedDeductions,
	} {
		if v < 0 || v > maxAmount {
			errs[field] = "Enter a whole-dollar amount between 0 and 100,000,000."
		}
	}
	if req.Dependents < 0 || req.Dependents > 20 {
		errs["dependents"] = "Enter a number from 0 to 20."
	}
	if req.Withholding > req.Wages && req.Wages > 0 {
		errs["withholding"] = "Withholding can't be more than wages."
	}
	if spec.allocated() {
		if req.StateIncome <= 0 || req.StateIncome > req.Wages+req.Interest {
			errs["stateIncome"] = "Enter the income you earned in this state, up to your total wages and interest."
		}
	} else if req.StateIncome != 0 {
		errs["stateIncome"] = "Only part-year and nonresident returns ask for income from this state."
	}
	if requireBank {
		if !validRouting(req.RoutingNumber) {
			errs["routingNumber"] = "Enter a valid 9-digit routing number."
		}
		if !allDigits(req.AccountNumber) || len(req.AccountNumber) < 4 || len(req.AccountNumber) > 17 {
			errs["accountNumber"] = "Enter an account number of 4 to 17 digits."
		}
	}
	return errs
}

func (req returnRequest) input() tax.Input {
	return tax.Input{
		FilingStatus: req.FilingStatus, Wages: req.Wages, Withholding: req.Withholding,
		Interest: req.Interest, ItemizedDeductions: req.ItemizedDeductions, Dependents: req.Dependents,
		SourceIncome: req.StateIncome,
	}
}

func allDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return s != ""
}

// validRouting checks length and the ABA routing number checksum.
func validRouting(s string) bool {
	if len(s) != 9 || !allDigits(s) {
		return false
	}
	d := func(i int) int { return int(s[i] - '0') }
	sum := 3*(d(0)+d(3)+d(6)) + 7*(d(1)+d(4)+d(7)) + (d(2) + d(5) + d(8))
	return sum%10 == 0
}

func (s *Server) parseForm(w http.ResponseWriter, r *http.Request, requireBank bool) (formSpec, string, returnRequest, bool) {
	form := r.PathValue("form")
	spec, ok := forms[form]
	if !ok {
		writeError(w, http.StatusNotFound, "Unknown form.")
		return spec, form, returnRequest{}, false
	}
	if spec.jurisdiction != "federal" {
		filing, ok := auth.UserFrom(r.Context()).Filing(spec.jurisdiction)
		if !ok {
			writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("You're not set up to file a %s return.", spec.jurisdiction))
			return spec, form, returnRequest{}, false
		}
		if want := stateForm(filing); want != form {
			writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("As a %s of %s, you file Form %s, not this form.",
				residencyLabel(filing.Residency), spec.jurisdiction, want))
			return spec, form, returnRequest{}, false
		}
	}
	var req returnRequest
	if !decode(w, r, &req) {
		return spec, form, req, false
	}
	if errs := req.validate(spec, requireBank); len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "Check the highlighted fields.", "fields": errs})
		return spec, form, req, false
	}
	return spec, form, req, true
}

// stateForm is the form a taxpayer files for a state, given their residency there. A state with
// no income tax has none.
func stateForm(f auth.StateFiling) string {
	resident := f.Residency == "resident"
	for id, spec := range forms {
		if spec.jurisdiction == f.State && spec.resident == resident {
			return id
		}
	}
	return ""
}

func residencyLabel(r string) string {
	switch r {
	case "part_year":
		return "part-year resident"
	case "nonresident":
		return "nonresident"
	}
	return "resident"
}

// otherStates fills in what the resident state's credit needs: the tax charged, and the income
// taxed, by the taxpayer's part-year and nonresident returns in other states. It also names
// those states the taxpayer hasn't filed in yet, because the credit can't count them.
func (s *Server) otherStates(ctx context.Context, user auth.User, spec formSpec, in *tax.Input) ([]string, error) {
	if !spec.resident {
		return nil, nil
	}
	filed := map[string]bool{}
	rows, err := s.pool.Query(ctx, `SELECT jurisdiction, (computed->>'tax')::bigint, COALESCE((computed->>'sourceIncome')::bigint, 0)
		FROM tax_returns WHERE user_id = $1 AND tax_year = $2 AND jurisdiction NOT IN ('federal', $3)`,
		user.ID, tax.TaxYear, spec.jurisdiction)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var state string
		var otherTax, income int64
		if err := rows.Scan(&state, &otherTax, &income); err != nil {
			return nil, err
		}
		filed[state] = true
		in.OtherStateTax += otherTax
		in.OtherStateIncome += income
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var missing []string
	for _, f := range user.States {
		if f.IncomeTax && f.State != spec.jurisdiction && f.Residency != "resident" && !filed[f.State] {
			missing = append(missing, f.State)
		}
	}
	return missing, nil
}

func (s *Server) handleEstimate(w http.ResponseWriter, r *http.Request) {
	spec, _, req, ok := s.parseForm(w, r, false)
	if !ok {
		return
	}
	in := req.input()
	if _, err := s.otherStates(r.Context(), auth.UserFrom(r.Context()), spec, &in); err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, spec.compute(in))
}

func (s *Server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	spec, form, req, ok := s.parseForm(w, r, true)
	if !ok {
		return
	}
	user := auth.UserFrom(r.Context())
	in := req.input()
	missing, err := s.otherStates(r.Context(), user, spec, &in)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if len(missing) > 0 {
		writeError(w, http.StatusConflict, fmt.Sprintf(
			"File your %s return first. This return claims a credit for the tax charged there.", strings.Join(missing, " and ")))
		return
	}
	result := spec.compute(in)

	mac := hmac.New(sha256.New, s.cfg.BankHMACKey)
	mac.Write([]byte(req.RoutingNumber + ":" + req.AccountNumber))
	fingerprint := mac.Sum(nil)
	features := embedding.Features(in, result)

	// Bank numbers are not stored: only the last four digits and the keyed fingerprint.
	storedInput := map[string]any{
		"filingStatus": in.FilingStatus, "wages": in.Wages, "withholding": in.Withholding,
		"interest": in.Interest, "itemizedDeductions": in.ItemizedDeductions, "dependents": in.Dependents,
	}
	if spec.allocated() {
		storedInput["stateIncome"] = in.SourceIncome
	}
	if in.OtherStateTax > 0 {
		storedInput["otherStateTax"], storedInput["otherStateIncome"] = in.OtherStateTax, in.OtherStateIncome
	}

	var id string
	err = pgx.BeginFunc(r.Context(), s.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `INSERT INTO tax_returns
			(user_id, jurisdiction, form, tax_year, filing_status, input, computed,
			 refund_cents, owed_cents, bank_last4, bank_fingerprint, features)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector)
			RETURNING id`,
			user.ID, spec.jurisdiction, form, tax.TaxYear, in.FilingStatus, storedInput, result,
			result.Refund*100, result.Owed*100, req.AccountNumber[len(req.AccountNumber)-4:],
			fingerprint, embedding.Literal(features)).Scan(&id)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO return_events (return_id, status, note) VALUES ($1, 'received', $2)",
			id, "We received your return.")
		return err
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		writeError(w, http.StatusConflict, fmt.Sprintf("You've already filed a Form %s for %d.", form, tax.TaxYear))
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r.Context(), r, &user.ID, "return_submitted", map[string]any{"form": form, "returnId": id})

	ret, err := s.loadReturn(r.Context(), user.ID, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, ret)
}

// handleDraft serves a demo user's pre-filled form, so testers can review and submit quickly.
func (s *Server) handleDraft(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	draft, ok := store.DemoDraft(user.Email, r.PathValue("form"))
	if !ok {
		writeError(w, http.StatusNotFound, "No pre-filled form for this account.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(draft)
}

func (s *Server) handleListReturns(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	rets, err := s.queryReturns(r.Context(), "user_id = $1", user.ID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"taxYear": tax.TaxYear, "returns": rets, "serverTime": time.Now()})
}

// handleReset deletes the signed-in user's returns so the demo can be run again.
func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if _, err := s.pool.Exec(r.Context(), "DELETE FROM tax_returns WHERE user_id = $1", user.ID); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r.Context(), r, &user.ID, "returns_reset", nil)
	w.WriteHeader(http.StatusNoContent)
}

type event struct {
	Status    string    `json:"status"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
}

type returnView struct {
	ID                  string     `json:"id"`
	Form                string     `json:"form"`
	Jurisdiction        string     `json:"jurisdiction"`
	TaxYear             int        `json:"taxYear"`
	FilingStatus        string     `json:"filingStatus"`
	Refund              int64      `json:"refund"`
	Owed                int64      `json:"owed"`
	BankLast4           *string    `json:"bankLast4"`
	Status              string     `json:"status"`
	StatusReason        *string    `json:"statusReason"`
	ExpectedPaymentDate *string    `json:"expectedPaymentDate"`
	SubmittedAt         time.Time  `json:"submittedAt"`
	StatusChangedAt     time.Time  `json:"statusChangedAt"`
	Agency              string     `json:"agency"`
	AgencyRefund        *int64     `json:"agencyRefund"`  // refund the agency approved or sent, if it differs from "as filed"
	AgencyOwed          *int64     `json:"agencyOwed"`    // balance due the agency reported
	AgencyMessage       *string    `json:"agencyMessage"` // the agency's message to the taxpayer
	TransmittedAt       *time.Time `json:"transmittedAt"`
	LastCheckedAt       *time.Time `json:"lastCheckedAt"`
	NextCheckAt         *time.Time `json:"nextCheckAt"`
	SupportAccessUntil  *time.Time `json:"supportAccessUntil"` // end of the taxpayer's grant to support, if active
	Computed            tax.Result `json:"computed"`
	Events              []event    `json:"events"`
}

func (s *Server) loadReturn(ctx context.Context, userID, id string) (returnView, error) {
	rets, err := s.queryReturns(ctx, "user_id = $1 AND id = $2", userID, id)
	if err != nil {
		return returnView{}, err
	}
	if len(rets) == 0 {
		return returnView{}, errNotFound
	}
	return rets[0], nil
}

func (s *Server) queryReturns(ctx context.Context, where string, args ...any) ([]returnView, error) {
	rows, err := s.pool.Query(ctx, `SELECT r.id, r.form, r.jurisdiction, r.tax_year, r.filing_status,
			r.refund_cents / 100, r.owed_cents / 100, r.bank_last4, r.status, r.status_reason,
			to_char(r.expected_payment_date, 'YYYY-MM-DD'), r.submitted_at, r.status_changed_at,
			r.transmitted_at, r.last_checked_at, r.next_check_at, `+returnGrantSQL+`, r.computed,
			r.agency_refund_cents / 100, r.agency_owed_cents / 100, r.agency_message,
			COALESCE((SELECT json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e.created_at)
			          ORDER BY e.created_at, e.id)
			          FROM return_events e WHERE e.return_id = r.id), '[]')
		FROM tax_returns r WHERE `+where+` ORDER BY r.jurisdiction <> 'federal', r.submitted_at`, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (returnView, error) {
		var v returnView
		err := row.Scan(&v.ID, &v.Form, &v.Jurisdiction, &v.TaxYear, &v.FilingStatus, &v.Refund, &v.Owed,
			&v.BankLast4, &v.Status, &v.StatusReason, &v.ExpectedPaymentDate, &v.SubmittedAt,
			&v.StatusChangedAt, &v.TransmittedAt, &v.LastCheckedAt, &v.NextCheckAt, &v.SupportAccessUntil, &v.Computed,
			&v.AgencyRefund, &v.AgencyOwed, &v.AgencyMessage, &v.Events)
		if j, ok := agency.Lookup(v.Jurisdiction); ok {
			v.Agency = j.Name
		}
		return v, err
	})
}
