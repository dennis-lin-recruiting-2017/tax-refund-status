package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"taxrefund/internal/auth"
)

// Support endpoints are read-only. An agent sees every taxpayer's name and where they live, but sees a
// return only while the taxpayer has granted support access to it (see grants.go).

type supportReturn struct {
	ID              string    `json:"id"`
	Jurisdiction    string    `json:"jurisdiction"`
	Form            string    `json:"form"`
	TaxYear         int       `json:"taxYear"`
	FilingStatus    string    `json:"filingStatus"`
	Status          string    `json:"status"`
	StatusChangedAt time.Time `json:"statusChangedAt"`
	AccessUntil     time.Time `json:"accessUntil"`
}

// accessLogEntry is one grant, active or not: which return, and when it started and ended.
type accessLogEntry struct {
	ReturnID     string     `json:"returnId"`
	Form         string     `json:"form"`
	Jurisdiction string     `json:"jurisdiction"`
	GrantedAt    time.Time  `json:"grantedAt"`
	ExpiresAt    time.Time  `json:"expiresAt"`
	RevokedAt    *time.Time `json:"revokedAt"`
	RevokedBy    *string    `json:"revokedBy"` // taxpayer or support, when ended early
}

type supportUser struct {
	ID     string             `json:"id"`
	Name   string             `json:"name"`
	Email  string             `json:"email"`
	States []auth.StateFiling `json:"states"`
	// Returns holds only the returns the taxpayer is sharing right now, federal first.
	Returns []supportReturn `json:"returns"`
	// AccessLog is the taxpayer's most recent grants from the past week, newest first.
	AccessLog []accessLogEntry `json:"accessLog"`
}

const (
	supportListLimit = 500
	accessLogEntries = 5
)

func (s *Server) supportRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/support/users", s.supportUsers)
	mux.HandleFunc("GET /api/support/returns/{id}", s.supportReturnDetails)
	mux.HandleFunc("DELETE /api/support/returns/{id}/access", s.supportEndAccess)
}

// supportEndAccess lets an agent end a taxpayer's grant early, once they no longer need the return. Ending
// access only ever takes it away, so any agent may do it; only the taxpayer can give it again.
func (s *Server) supportEndAccess(w http.ResponseWriter, r *http.Request) {
	var taxpayerID, form string
	err := s.pool.QueryRow(r.Context(), `UPDATE support_grants g SET revoked_at = now(), revoked_by = 'support'
		FROM tax_returns t
		WHERE g.return_id::text = $1 AND t.id = g.return_id AND g.revoked_at IS NULL AND g.expires_at > now()
		RETURNING g.user_id, t.form`, r.PathValue("id")).Scan(&taxpayerID, &form)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "This return isn't shared with support right now.")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	agent := auth.UserFrom(r.Context())
	s.audit(r.Context(), r, &agent.ID, "support_access_ended", map[string]any{
		"taxpayerId": taxpayerID, "returnId": r.PathValue("id"), "form": form,
	})
	w.WriteHeader(http.StatusNoContent)
}

// supportReturnDetails shows one return in full, as its taxpayer sees it, but only while the taxpayer is
// sharing it. The grant is part of the query, so an expired or ended grant finds nothing.
func (s *Server) supportReturnDetails(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rets, err := s.queryReturns(r.Context(), "r.id::text = $1 AND "+returnGrantSQL+" IS NOT NULL", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if len(rets) == 0 {
		writeError(w, http.StatusNotFound, "This return isn't shared with support right now.")
		return
	}
	var taxpayer struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := s.pool.QueryRow(r.Context(), `SELECT u.id, u.full_name, u.email FROM users u
		JOIN tax_returns t ON t.user_id = u.id WHERE t.id = $1`, rets[0].ID).
		Scan(&taxpayer.ID, &taxpayer.Name, &taxpayer.Email); err != nil {
		s.internalError(w, r, err)
		return
	}
	// Every opening is audited, not de-duplicated: opening a return in full is a deliberate act.
	agent := auth.UserFrom(r.Context())
	s.audit(r.Context(), r, &agent.ID, "support_view_return_details", map[string]any{
		"taxpayerId": taxpayer.ID, "returnId": rets[0].ID, "form": rets[0].Form,
	})
	writeJSON(w, http.StatusOK, map[string]any{"return": rets[0], "taxpayer": taxpayer, "serverTime": time.Now()})
}

func (s *Server) supportUsers(w http.ResponseWriter, r *http.Request) {
	// A return is selected only while its grant is active, so unshared returns never leave the database.
	// Grants and returns are read in one statement, at one now().
	rows, err := s.pool.Query(r.Context(), `SELECT u.id, u.full_name, u.email, `+auth.StatesSQL+`,
			COALESCE((SELECT json_agg(json_build_object('id', r.id, 'jurisdiction', r.jurisdiction, 'form', r.form,
					'taxYear', r.tax_year, 'filingStatus', r.filing_status, 'status', r.status,
					'statusChangedAt', r.status_changed_at, 'accessUntil', a.until)
				ORDER BY r.jurisdiction <> 'federal', r.jurisdiction)
				FROM tax_returns r CROSS JOIN LATERAL (SELECT `+returnGrantSQL+` AS until) a
				WHERE r.user_id = u.id AND a.until IS NOT NULL), '[]') AS shared,
			COALESCE((SELECT json_agg(json_build_object('returnId', r.id, 'form', r.form, 'jurisdiction', r.jurisdiction,
					'grantedAt', g.granted_at, 'expiresAt', g.expires_at, 'revokedAt', g.revoked_at, 'revokedBy', g.revoked_by)
				ORDER BY g.granted_at DESC)
				FROM (SELECT * FROM support_grants WHERE user_id = u.id AND granted_at > now() - interval '7 days'
				      ORDER BY granted_at DESC LIMIT $2) g
				JOIN tax_returns r ON r.id = g.return_id), '[]') AS access_log
		FROM users u
		WHERE u.role = 'taxpayer'
		ORDER BY NOT EXISTS (SELECT 1 FROM support_grants g WHERE g.user_id = u.id AND g.revoked_at IS NULL AND g.expires_at > now()),
			u.email
		LIMIT $1`, supportListLimit, accessLogEntries)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	users, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (supportUser, error) {
		var u supportUser
		return u, row.Scan(&u.ID, &u.Name, &u.Email, &u.States, &u.Returns, &u.AccessLog)
	})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.auditSupportViews(r, users)
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "limit": supportListLimit, "serverTime": time.Now()})
}

// auditSupportViews records that an agent saw the list, once per view-log window, and each shared return
// they saw, once per agent per grant: polling during a grant isn't logged again, a new grant is.
func (s *Server) auditSupportViews(r *http.Request, users []supportUser) {
	agent := auth.UserFrom(r.Context())
	now := time.Now()
	if s.views.fresh(agent.ID+"|support|users", now) {
		s.audit(r.Context(), r, &agent.ID, "support_view_users", map[string]any{"results": len(users)})
	}
	for _, u := range users {
		for _, ret := range u.Returns {
			if s.views.fresh(agent.ID+"|grant|"+ret.ID+"|"+ret.AccessUntil.Format(time.RFC3339Nano), now) {
				s.audit(r.Context(), r, &agent.ID, "support_view_returns", map[string]any{
					"taxpayerId": u.ID, "returnId": ret.ID, "form": ret.Form, "accessUntil": ret.AccessUntil,
				})
			}
		}
	}
}
