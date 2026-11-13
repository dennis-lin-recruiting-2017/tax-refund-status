// Package auth handles password login, account lockout, and server-side sessions.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	CookieName      = "sid"
	maxFailedLogins = 5
	lockoutMinutes  = 15
)

type User struct {
	ID          string        `json:"id"`
	Email       string        `json:"email"`
	FullName    string        `json:"fullName"`
	TaxIDLast4  string        `json:"taxIdLast4"`
	Role        string        `json:"role"`
	States      []StateFiling `json:"states"`      // where this taxpayer lives and works; returns to file first come first
	ColorScheme string        `json:"colorScheme"` // the portal color scheme they picked
}

// StateFiling is one state a taxpayer lives or works in, and how. In a state with an income tax,
// residency decides the form; a state without one needs no return.
type StateFiling struct {
	State     string `json:"state"`
	Name      string `json:"name"`
	Residency string `json:"residency"` // resident, part_year, or nonresident
	IncomeTax bool   `json:"incomeTax"`
}

// StatesSQL lists the states of the user aliased u as JSON. Part-year and nonresident returns come
// first, because the resident return's credit for tax paid to other states depends on them.
const StatesSQL = `(SELECT COALESCE(json_agg(json_build_object('state', us.state, 'name', st.name,
		'residency', us.residency, 'incomeTax', st.income_tax)
	ORDER BY us.residency = 'resident', us.state), '[]')
	FROM user_states us JOIN states st ON st.code = us.state WHERE us.user_id = u.id)`

// colorSchemeSQL is the portal scheme of the user aliased u: the one they picked, or else their role's
// default, so each role's pages look different at a glance: taxpayers Sunset, support Ocean, admins
// Graphite. (Signed-out pages always use Evergreen; that's decided in the portal.)
const colorSchemeSQL = `COALESCE(u.color_scheme, CASE u.role WHEN 'support' THEN 'ocean' WHEN 'admin' THEN 'graphite' ELSE 'sunset' END)`

func (u User) IsAdmin() bool   { return u.Role == "admin" }
func (u User) IsSupport() bool { return u.Role == "support" }

// Filing returns how this user files in a state, if they do.
func (u User) Filing(state string) (StateFiling, bool) {
	for _, f := range u.States {
		if f.State == state {
			return f, true
		}
	}
	return StateFiling{}, false
}

type Service struct {
	pool         *pgxpool.Pool
	ttl          time.Duration
	cookieSecure bool
	dummyHash    string
}

func NewService(pool *pgxpool.Pool, ttl time.Duration, cookieSecure bool) (*Service, error) {
	// Verified against when the email is unknown, so timing doesn't reveal which accounts exist.
	dummy, err := HashPassword(randomToken())
	if err != nil {
		return nil, err
	}
	return &Service{pool: pool, ttl: ttl, cookieSecure: cookieSecure, dummyHash: dummy}, nil
}

// Authenticate returns the user ID on success. Failures never say why.
func (s *Service) Authenticate(ctx context.Context, email, password string) (string, bool, error) {
	var id, hash string
	var lockedUntil *time.Time
	err := s.pool.QueryRow(ctx, "SELECT id, password_hash, locked_until FROM users WHERE email = $1",
		strings.ToLower(strings.TrimSpace(email))).Scan(&id, &hash, &lockedUntil)
	found := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}
	if !found {
		hash = s.dummyHash
	}

	ok, err := VerifyPassword(password, hash)
	if err != nil || !found {
		return "", false, err
	}
	if lockedUntil != nil && lockedUntil.After(time.Now()) {
		return "", false, nil
	}
	if !ok {
		_, err := s.pool.Exec(ctx, `UPDATE users
			SET failed_logins = failed_logins + 1,
			    locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) END
			WHERE id = $1`, id, maxFailedLogins, lockoutMinutes)
		return "", false, err
	}
	_, err = s.pool.Exec(ctx, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", id)
	return id, err == nil, err
}

func (s *Service) CreateSession(ctx context.Context, w http.ResponseWriter, userID string) error {
	token := randomToken()
	_, err := s.pool.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES ($1, $2, now() + make_interval(secs => $3))`, hashToken(token), userID, s.ttl.Seconds())
	if err != nil {
		return err
	}
	s.setCookie(w, token, s.ttl)
	return nil
}

func (s *Service) DestroySession(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
	s.setCookie(w, "", -1)
	c, err := r.Cookie(CookieName)
	if err != nil {
		return nil
	}
	_, err = s.pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash = $1", hashToken(c.Value))
	return err
}

type ctxKey struct{}

func UserFrom(ctx context.Context) User { return ctx.Value(ctxKey{}).(User) }

// refreshEvery is the most often a session's expiry is written. Checking a session is then a read,
// so status reads don't depend on the primary accepting writes, and idle timeouts stay accurate to
// within this interval.
const refreshEvery = 5 * time.Minute

// refreshInterval caps refreshEvery for short TTLs, so a session is always extended well before it ends.
func refreshInterval(ttl time.Duration) time.Duration { return min(refreshEvery, ttl/2) }

// needsRefresh reports whether a session expiring at expires is due to be extended: true once its
// last extension (expires - ttl) is at least refreshInterval old.
func needsRefresh(expires, now time.Time, ttl time.Duration) bool {
	return !expires.After(now.Add(ttl - refreshInterval(ttl)))
}

// Require loads the session user and rejects anonymous requests. It only reads; when the session is
// due, its expiry is extended in the background, and a failed extension never fails the request.
func (s *Service) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(CookieName)
		if err != nil || c.Value == "" {
			writeErr(w, http.StatusUnauthorized, "Sign in to continue.")
			return
		}
		token := hashToken(c.Value)
		var u User
		var expires time.Time
		err = s.pool.QueryRow(r.Context(), `SELECT u.id, u.email, u.full_name, u.tax_id_last4, u.role, `+StatesSQL+`, `+colorSchemeSQL+`, s.expires_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = $1 AND s.expires_at > now()`, token).
			Scan(&u.ID, &u.Email, &u.FullName, &u.TaxIDLast4, &u.Role, &u.States, &u.ColorScheme, &expires)
		if errors.Is(err, pgx.ErrNoRows) {
			s.setCookie(w, "", -1)
			writeErr(w, http.StatusUnauthorized, "Your session has ended. Sign in again.")
			return
		}
		if err != nil {
			// The database couldn't say either way. Reject without clearing the cookie: the session may
			// still be good once the database answers. Never trust a session we couldn't confirm.
			slog.Warn("session check failed", "err", err)
			writeErr(w, http.StatusServiceUnavailable, "We couldn't confirm you're signed in. Try again in a moment.")
			return
		}
		if needsRefresh(expires, time.Now(), s.ttl) {
			go s.extend(token)
		}
		s.setCookie(w, c.Value, s.ttl)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	})
}

// extend pushes a session's expiry forward. The WHERE clause makes concurrent requests extend it once,
// and leaves a session that was signed out or expired in the meantime alone.
func (s *Service) extend(token []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `UPDATE sessions SET expires_at = now() + make_interval(secs => $2)
		WHERE token_hash = $1 AND expires_at > now() AND expires_at <= now() + make_interval(secs => $3)`,
		token, s.ttl.Seconds(), (s.ttl - refreshInterval(s.ttl)).Seconds())
	if err != nil {
		slog.Warn("session extension failed; it will be retried on a later request", "err", err)
	}
}

// RequireAdmin rejects signed-in users who aren't admins. Use inside Require.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !UserFrom(r.Context()).IsAdmin() {
			writeErr(w, http.StatusForbidden, "You don't have access to this.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireSupport rejects signed-in users who aren't support agents. Use inside Require.
func RequireSupport(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !UserFrom(r.Context()).IsSupport() {
			writeErr(w, http.StatusForbidden, "You don't have access to this.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Service) setCookie(w http.ResponseWriter, token string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/api",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func randomToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":"` + msg + `"}`))
}

// RateLimiter is a per-client fixed-window limiter. It's per pod; the per-account
// lockout in Authenticate is the durable control.
type RateLimiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string]*window
}

type window struct {
	count   int
	resetAt time.Time
}

func NewRateLimiter(max int, per time.Duration) *RateLimiter {
	return &RateLimiter{max: max, window: per, hits: map[string]*window{}}
}

func (l *RateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, v := range l.hits {
		if v.resetAt.Before(now) {
			delete(l.hits, k)
		}
	}
	w, ok := l.hits[key]
	if !ok {
		l.hits[key] = &window{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	w.count++
	return w.count <= l.max
}
