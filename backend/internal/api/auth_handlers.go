package api

import (
	"net/http"

	"taxrefund/internal/auth"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

const loginFailed = "We couldn't sign you in with those details. Check them and try again, or wait 15 minutes if you've tried several times."

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.login.Allow(s.clientIP(r)) {
		w.Header().Set("Retry-After", "300")
		writeError(w, http.StatusTooManyRequests, "Too many sign-in attempts. Wait a few minutes and try again.")
		return
	}
	var req loginRequest
	if !decode(w, r, &req) {
		return
	}
	if req.Email == "" || req.Password == "" || len(req.Password) > 256 {
		writeError(w, http.StatusUnauthorized, loginFailed)
		return
	}

	userID, ok, err := s.auth.Authenticate(r.Context(), req.Email, req.Password)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !ok {
		s.audit(r.Context(), r, nil, "login_failed", nil)
		writeError(w, http.StatusUnauthorized, loginFailed)
		return
	}
	if err := s.auth.CreateSession(r.Context(), w, userID); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r.Context(), r, &userID, "login", nil)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.DestroySession(r.Context(), w, r); err != nil {
		s.internalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, auth.UserFrom(r.Context()))
}
