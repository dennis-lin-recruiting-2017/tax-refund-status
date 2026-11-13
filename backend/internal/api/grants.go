package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"taxrefund/internal/auth"
)

// A taxpayer decides, return by return, when support may see it. A grant lasts supportGrantTTL and can be
// ended early; granting again starts a fresh window. Support's view checks for an active grant on every
// request, so access ends on the server the moment the window does.

const supportGrantTTL = 5 * time.Minute

// returnGrantSQL is the end of the active grant for the return aliased r, or NULL if there isn't one.
const returnGrantSQL = `(SELECT max(g.expires_at) FROM support_grants g
	WHERE g.return_id = r.id AND g.revoked_at IS NULL AND g.expires_at > now())`

type grantView struct {
	ReturnID   string     `json:"returnId"`
	ExpiresAt  *time.Time `json:"expiresAt"` // nil when support has no access
	ServerTime time.Time  `json:"serverTime"`
}

func (s *Server) grantRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/returns/{id}/support-access", s.taxpayerOnly(s.createGrant))
	mux.HandleFunc("DELETE /api/returns/{id}/support-access", s.taxpayerOnly(s.revokeGrant))
}

// taxpayerOnly keeps staff from granting access to themselves or to anyone else.
func (s *Server) taxpayerOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if auth.UserFrom(r.Context()).Role != "taxpayer" {
			writeError(w, http.StatusForbidden, "Only taxpayers can share their returns with support.")
			return
		}
		next(w, r)
	}
}

// ownReturn checks the return in the path belongs to the signed-in taxpayer, and returns its form.
func (s *Server) ownReturn(w http.ResponseWriter, r *http.Request) (string, bool) {
	var form string
	err := s.pool.QueryRow(r.Context(), "SELECT form FROM tax_returns WHERE id::text = $1 AND user_id = $2",
		r.PathValue("id"), auth.UserFrom(r.Context()).ID).Scan(&form)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Return not found.")
		return "", false
	}
	if err != nil {
		s.internalError(w, r, err)
		return "", false
	}
	return form, true
}

func (s *Server) respondGrant(w http.ResponseWriter, r *http.Request, id string) {
	v := grantView{ReturnID: id}
	if err := s.pool.QueryRow(r.Context(), `SELECT `+returnGrantSQL+`, now() FROM tax_returns r WHERE r.id = $1`, id).
		Scan(&v.ExpiresAt, &v.ServerTime); err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// createGrant ends the return's active grant, if any, and starts a new one, so a return only ever has one
// window at a time.
func (s *Server) createGrant(w http.ResponseWriter, r *http.Request) {
	form, ok := s.ownReturn(w, r)
	if !ok {
		return
	}
	user, id := auth.UserFrom(r.Context()), r.PathValue("id")
	err := pgx.BeginFunc(r.Context(), s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE support_grants SET revoked_at = now(), revoked_by = 'taxpayer'
			WHERE return_id = $1 AND revoked_at IS NULL AND expires_at > now()`, id); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), `INSERT INTO support_grants (user_id, return_id, expires_at)
			VALUES ($1, $2, now() + make_interval(secs => $3))`, user.ID, id, supportGrantTTL.Seconds())
		return err
	})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r.Context(), r, &user.ID, "support_access_granted", map[string]any{"returnId": id, "form": form, "minutes": supportGrantTTL.Minutes()})
	s.respondGrant(w, r, id)
}

func (s *Server) revokeGrant(w http.ResponseWriter, r *http.Request) {
	form, ok := s.ownReturn(w, r)
	if !ok {
		return
	}
	user, id := auth.UserFrom(r.Context()), r.PathValue("id")
	tag, err := s.pool.Exec(r.Context(), `UPDATE support_grants SET revoked_at = now(), revoked_by = 'taxpayer'
		WHERE return_id = $1 AND revoked_at IS NULL AND expires_at > now()`, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if tag.RowsAffected() > 0 {
		s.audit(r.Context(), r, &user.ID, "support_access_revoked", map[string]any{"returnId": id, "form": form})
	}
	s.respondGrant(w, r, id)
}
