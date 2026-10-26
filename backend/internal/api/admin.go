package api

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"taxrefund/internal/agency"
	"taxrefund/internal/auth"
)

// Admin endpoints operate the demo. Real agencies don't let anyone change a refund's status;
// here an admin plays the agency, through the mock agency's own operator API. Our records then
// change the normal way: the next batch run reads the agency's new status.

type taxpayer struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	TaxIDLast4 string `json:"taxIdLast4"`
}

type liveStatus struct {
	Status      string     `json:"status,omitempty"`
	PaymentDate string     `json:"paymentDate,omitempty"`
	UpdatedAt   *time.Time `json:"updatedAt,omitempty"`
	Manual      bool       `json:"manual"`
	Error       string     `json:"error,omitempty"`
}

type adminReturn struct {
	returnView
	Taxpayer         taxpayer    `json:"taxpayer"`
	SubmissionID     *string     `json:"submissionId"`
	IdentityVerified bool        `json:"identityVerified"`
	Held             bool        `json:"held"` // held by our duplicate screening, not yet transmitted
	AgencyStatus     *liveStatus `json:"agencyStatus"`
}

func (s *Server) adminRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/returns", s.adminList)
	mux.HandleFunc("PUT /api/admin/returns/{id}/agency-status", s.adminSetStatus)
	mux.HandleFunc("DELETE /api/admin/returns/{id}/agency-status", s.adminClearStatus)
	mux.HandleFunc("POST /api/admin/returns/{id}/check-now", s.adminCheckNow)
	mux.HandleFunc("POST /api/admin/returns/{id}/release", s.adminRelease)
}

const adminListLimit = 100

func (s *Server) adminList(w http.ResponseWriter, r *http.Request) {
	rets, err := s.loadAdminReturns(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), "")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"returns": rets, "limit": adminListLimit})
}

// loadAdminReturns returns matching returns, newest first, with taxpayer details and each
// transmitted return's live status at its agency.
func (s *Server) loadAdminReturns(ctx context.Context, q, id string) ([]adminReturn, error) {
	rows, err := s.pool.Query(ctx, `SELECT r.id, u.full_name, u.email, u.tax_id_last4, r.agency_submission_id,
			r.identity_verified_at IS NOT NULL, r.status = 'action_needed' AND r.agency_submission_id IS NULL
		FROM tax_returns r JOIN users u ON u.id = r.user_id
		WHERE ($1 = '' OR r.id::text = $1)
		  AND ($2 = '' OR u.email ILIKE '%' || $2 || '%' OR u.full_name ILIKE '%' || $2 || '%')
		ORDER BY r.submitted_at DESC
		LIMIT $3`, id, q, adminListLimit)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (adminReturn, error) {
		var a adminReturn
		return a, row.Scan(&a.ID, &a.Taxpayer.Name, &a.Taxpayer.Email, &a.Taxpayer.TaxIDLast4, &a.SubmissionID,
			&a.IdentityVerified, &a.Held)
	})
	if err != nil || len(list) == 0 {
		return list, err
	}

	ids := make([]string, len(list))
	for i, a := range list {
		ids[i] = a.ID
	}
	views, err := s.queryReturns(ctx, "r.id = ANY($1)", ids)
	if err != nil {
		return nil, err
	}
	byID := map[string]returnView{}
	for _, v := range views {
		byID[v.ID] = v
	}
	for i := range list {
		list[i].returnView = byID[list[i].ID]
	}
	s.attachLiveStatus(ctx, list)
	return list, nil
}

// attachLiveStatus asks each agency, in one bulk call per jurisdiction, for the current status
// of the listed returns. Failures are shown per row rather than failing the page.
func (s *Server) attachLiveStatus(ctx context.Context, list []adminReturn) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	byJur := map[string][]int{}
	for i, a := range list {
		if a.SubmissionID != nil {
			byJur[a.Jurisdiction] = append(byJur[a.Jurisdiction], i)
		}
	}
	for jur, idx := range byJur {
		client := s.agencies[jur]
		ids := make([]string, len(idx))
		for k, i := range idx {
			ids[k] = *list[i].SubmissionID
		}
		var results []agency.StatusResult
		var err error
		if client == nil {
			err = errors.New("agency not configured")
		} else {
			results, err = client.BatchStatus(ctx, ids)
		}
		found := map[string]agency.StatusResult{}
		for _, res := range results {
			found[res.SubmissionID] = res
		}
		for _, i := range idx {
			if err != nil {
				list[i].AgencyStatus = &liveStatus{Error: "Couldn't reach the agency"}
				continue
			}
			res := found[*list[i].SubmissionID]
			ls := &liveStatus{Status: res.Status, PaymentDate: res.PaymentDate, Manual: res.Manual}
			if !res.UpdatedAt.IsZero() {
				ls.UpdatedAt = &res.UpdatedAt
			}
			list[i].AgencyStatus = ls
		}
	}
}

// settableFor lists the agency statuses an admin may choose. Approved and Sent only make
// sense when there's a refund.
func settableFor(refund int64) []string {
	if refund > 0 {
		return []string{"received", "processing", "approved", "sent", "action_required"}
	}
	return []string{"received", "processing", "accepted", "action_required"}
}

type setStatusRequest struct {
	Status      string `json:"status"`
	PaymentDate string `json:"paymentDate"`
}

// loadOne fetches a return for an admin action, writing the error response if it can't.
func (s *Server) loadOne(w http.ResponseWriter, r *http.Request) (adminReturn, bool) {
	id := r.PathValue("id")
	rets, err := s.loadAdminReturns(r.Context(), "", id)
	if err != nil {
		s.internalError(w, r, err)
		return adminReturn{}, false
	}
	if len(rets) == 0 {
		writeError(w, http.StatusNotFound, "Return not found.")
		return adminReturn{}, false
	}
	return rets[0], true
}

func (s *Server) adminSetStatus(w http.ResponseWriter, r *http.Request) {
	var req setStatusRequest
	if !decode(w, r, &req) {
		return
	}
	ret, ok := s.loadOne(w, r)
	if !ok {
		return
	}
	if ret.SubmissionID == nil {
		writeError(w, http.StatusConflict, "This return hasn't been sent to the agency yet, so there's no agency status to change.")
		return
	}
	if !slices.Contains(settableFor(ret.Refund), req.Status) {
		writeError(w, http.StatusUnprocessableEntity, "That status isn't available for this return.")
		return
	}
	if req.PaymentDate != "" {
		if _, err := time.Parse(time.DateOnly, req.PaymentDate); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "Payment date must be YYYY-MM-DD.")
			return
		}
	}
	client := s.agencies[ret.Jurisdiction]
	if client == nil {
		writeError(w, http.StatusServiceUnavailable, "This agency isn't configured.")
		return
	}
	if _, err := client.SetStatus(r.Context(), *ret.SubmissionID, req.Status, req.PaymentDate); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.afterAgencyChange(w, r, ret, "admin_set_agency_status", map[string]any{
		"returnId": ret.ID, "status": req.Status, "paymentDate": req.PaymentDate, "previousStatus": ret.Status,
	})
}

func (s *Server) adminClearStatus(w http.ResponseWriter, r *http.Request) {
	ret, ok := s.loadOne(w, r)
	if !ok {
		return
	}
	client := s.agencies[ret.Jurisdiction]
	if ret.SubmissionID == nil || client == nil {
		writeError(w, http.StatusConflict, "This return hasn't been sent to the agency yet.")
		return
	}
	if _, err := client.ClearStatus(r.Context(), *ret.SubmissionID); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.afterAgencyChange(w, r, ret, "admin_clear_agency_status", map[string]any{"returnId": ret.ID})
}

// afterAgencyChange makes the return due now, so the next batch run syncs the agency's change,
// records the action, and responds with the updated row.
func (s *Server) afterAgencyChange(w http.ResponseWriter, r *http.Request, ret adminReturn, action string, detail map[string]any) {
	if _, err := s.pool.Exec(r.Context(), "UPDATE tax_returns SET next_check_at = now() WHERE id = $1", ret.ID); err != nil {
		s.internalError(w, r, err)
		return
	}
	admin := auth.UserFrom(r.Context())
	s.audit(r.Context(), r, &admin.ID, action, detail)
	s.respondOne(w, r, ret.ID)
}

func (s *Server) adminCheckNow(w http.ResponseWriter, r *http.Request) {
	ret, ok := s.loadOne(w, r)
	if !ok {
		return
	}
	if ret.SubmissionID == nil {
		writeError(w, http.StatusConflict, "This return hasn't been sent to the agency yet.")
		return
	}
	s.afterAgencyChange(w, r, ret, "admin_check_now", map[string]any{"returnId": ret.ID})
}

// adminRelease clears a duplicate-screening hold after identity has been verified out of band.
// The processor then transmits the return without screening it again.
func (s *Server) adminRelease(w http.ResponseWriter, r *http.Request) {
	ret, ok := s.loadOne(w, r)
	if !ok {
		return
	}
	if !ret.Held {
		writeError(w, http.StatusConflict, "Only returns held by duplicate screening can be released.")
		return
	}
	j, _ := agency.Lookup(ret.Jurisdiction)
	err := pgx.BeginFunc(r.Context(), s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE tax_returns
			SET status = 'received', status_reason = NULL, status_changed_at = now(), identity_verified_at = now(), lease_until = NULL
			WHERE id = $1 AND status = 'action_needed' AND agency_submission_id IS NULL`, ret.ID); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), "INSERT INTO return_events (return_id, status, note) VALUES ($1, 'received', $2)",
			ret.ID, "Your identity was verified. We'll send your return to the "+j.Name+" shortly.")
		return err
	})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	admin := auth.UserFrom(r.Context())
	s.audit(r.Context(), r, &admin.ID, "admin_release_hold", map[string]any{"returnId": ret.ID})
	s.respondOne(w, r, ret.ID)
}

func (s *Server) respondOne(w http.ResponseWriter, r *http.Request, id string) {
	rets, err := s.loadAdminReturns(r.Context(), "", id)
	if err != nil || len(rets) == 0 {
		s.internalError(w, r, errors.Join(err, errNotFound))
		return
	}
	writeJSON(w, http.StatusOK, rets[0])
}
