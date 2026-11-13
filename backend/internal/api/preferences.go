package api

import (
	"net/http"
	"slices"

	"taxrefund/internal/auth"
)

// colorSchemes are the portal color schemes a user can pick. The database checks the same list
// (migration 014), and the frontend's src/schemes.js defines how each looks.
var colorSchemes = []string{"evergreen", "ocean", "sunset", "plum", "graphite"}

type colorSchemeRequest struct {
	ColorScheme string `json:"colorScheme"`
}

// handleSetColorScheme saves the signed-in user's color scheme to their profile. Any role can pick one.
func (s *Server) handleSetColorScheme(w http.ResponseWriter, r *http.Request) {
	var req colorSchemeRequest
	if !decode(w, r, &req) {
		return
	}
	if !slices.Contains(colorSchemes, req.ColorScheme) {
		writeError(w, http.StatusUnprocessableEntity, "That color scheme isn't available.")
		return
	}
	user := auth.UserFrom(r.Context())
	if _, err := s.pool.Exec(r.Context(), "UPDATE users SET color_scheme = $1 WHERE id = $2", req.ColorScheme, user.ID); err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, req)
}
