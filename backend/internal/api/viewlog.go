package api

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// viewLog remembers which returns and searches each admin was recently audited for, so the admin
// page's polling doesn't write the same view to the audit log every few seconds. It lives in one
// process: with several replicas a view may be logged once per replica, which errs toward more
// auditing, never less.
type viewLog struct {
	mu   sync.Mutex
	ttl  time.Duration
	seen map[string]time.Time
}

const viewLogMax = 50_000 // entries before expired ones are swept

func newViewLog(ttl time.Duration) *viewLog {
	return &viewLog{ttl: ttl, seen: map[string]time.Time{}}
}

// fresh reports whether key hasn't been seen within the TTL, and marks it seen if so.
func (v *viewLog) fresh(key string, now time.Time) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	if t, ok := v.seen[key]; ok && now.Sub(t) < v.ttl {
		return false
	}
	if len(v.seen) >= viewLogMax {
		for k, t := range v.seen {
			if now.Sub(t) >= v.ttl {
				delete(v.seen, k)
			}
		}
	}
	v.seen[key] = now
	return true
}

// auditViews records which returns an admin was shown, and what they searched for, unless the same
// admin was audited for them within the TTL. The search text is kept: searching for a name rather
// than working a case is the main sign of snooping.
func (s *Server) auditViews(r *http.Request, adminID, q string, rets []adminReturn) {
	now := time.Now()
	shown := []string{}
	for _, ret := range rets {
		if s.views.fresh(adminID+"|return|"+ret.ID, now) {
			shown = append(shown, ret.ID)
		}
	}
	searched := q != "" && s.views.fresh(adminID+"|search|"+strings.ToLower(q), now)
	if len(shown) == 0 && !searched {
		return
	}
	detail := map[string]any{"results": len(rets), "returnIds": shown}
	if q != "" {
		detail["query"] = q
	}
	s.audit(r.Context(), r, &adminID, "admin_view_returns", detail)
}
