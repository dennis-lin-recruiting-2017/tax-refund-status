package auth

import (
	"testing"
	"time"
)

func TestNeedsRefresh(t *testing.T) {
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	ttl := 30 * time.Minute
	cases := []struct {
		name          string
		extendedAgo   time.Duration // time since the expiry was last written
		ttl           time.Duration
		wantExtension bool
	}{
		{"just extended", 0, ttl, false},
		{"4 minutes ago", 4 * time.Minute, ttl, false},
		{"exactly 5 minutes ago", 5 * time.Minute, ttl, true},
		{"20 minutes ago", 20 * time.Minute, ttl, true},
		// With a short TTL, extend after half of it, so the session never runs out between extensions.
		{"short TTL, under half", 1 * time.Minute, 4 * time.Minute, false},
		{"short TTL, half", 2 * time.Minute, 4 * time.Minute, true},
	}
	for _, c := range cases {
		expires := now.Add(c.ttl - c.extendedAgo)
		if got := needsRefresh(expires, now, c.ttl); got != c.wantExtension {
			t.Errorf("%s: needsRefresh = %v, want %v", c.name, got, c.wantExtension)
		}
	}
}
