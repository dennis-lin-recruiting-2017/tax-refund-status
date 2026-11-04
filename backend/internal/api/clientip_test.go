package api

import (
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestClientIP(t *testing.T) {
	trusted := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),     // portal pods
		netip.MustParsePrefix("192.168.0.0/16"), // load balancer
	}
	for _, c := range []struct {
		name, remote, xff, want string
	}{
		{"direct, no header", "203.0.113.7:5000", "", "203.0.113.7"},
		{"untrusted caller can't forge the header", "203.0.113.7:5000", "1.2.3.4", "203.0.113.7"},
		{"behind nginx", "10.1.0.5:4000", "203.0.113.7", "203.0.113.7"},
		{"behind a load balancer and nginx", "10.1.0.5:4000", "203.0.113.7, 192.168.1.10", "203.0.113.7"},
		{"forged entries left of the client are ignored", "10.1.0.5:4000", "1.2.3.4, 203.0.113.7, 192.168.1.10", "203.0.113.7"},
		{"forged trusted-looking entry is ignored", "10.1.0.5:4000", "10.9.9.9, 203.0.113.7", "203.0.113.7"},
		{"split across header lines", "10.1.0.5:4000", "", "203.0.113.7"},
		{"malformed entry stops the walk", "10.1.0.5:4000", "203.0.113.7, garbage", "10.1.0.5"},
		{"only trusted hops", "10.1.0.5:4000", "192.168.1.10", "192.168.1.10"},
		{"IPv4-mapped IPv6", "[::ffff:10.1.0.5]:4000", "203.0.113.7", "203.0.113.7"},
	} {
		r := httptest.NewRequest("GET", "/api/auth/login", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if c.name == "split across header lines" {
			r.Header.Add("X-Forwarded-For", "203.0.113.7")
			r.Header.Add("X-Forwarded-For", "192.168.1.10")
		}
		if got := clientIP(r, trusted); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestViewLog(t *testing.T) {
	v := newViewLog(15 * time.Minute)
	now := time.Now()
	if !v.fresh("a|return|1", now) {
		t.Fatal("first view should be fresh")
	}
	if v.fresh("a|return|1", now.Add(5*time.Second)) {
		t.Error("a repeat within the TTL should not be fresh")
	}
	if !v.fresh("b|return|1", now.Add(5*time.Second)) {
		t.Error("another admin's view should be fresh")
	}
	if !v.fresh("a|return|1", now.Add(16*time.Minute)) {
		t.Error("a view after the TTL should be fresh again")
	}
}
