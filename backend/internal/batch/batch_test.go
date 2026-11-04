package batch

import (
	"testing"
	"time"
)

func TestMapStatus(t *testing.T) {
	for in, want := range map[string]string{
		"received": "processing", "processing": "processing", "approved": "approved",
		"sent": "sent", "adjusted": "adjusted", "accepted": "accepted", "action_required": "action_needed", "not_found": "", "weird": "",
	} {
		if got := MapStatus(in); got != want {
			t.Errorf("MapStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNextCheck(t *testing.T) {
	now := time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC)
	recheck := 6 * time.Hour
	within := func(got *time.Time, want time.Time) bool {
		return got != nil && !got.Before(want) && got.Before(want.Add(recheck/10+time.Second))
	}

	if got := NextCheck("processing", "", now, recheck); !within(got, now.Add(recheck)) {
		t.Errorf("processing: %v", got)
	}
	// Payment date far out: wait for it instead of checking every cycle.
	if got := NextCheck("approved", "2026-03-09", now, recheck); !within(got, time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("approved with future payment date: %v", got)
	}
	// Payment date today or past: normal cadence.
	if got := NextCheck("approved", "2026-03-02", now, recheck); !within(got, now.Add(recheck)) {
		t.Errorf("approved paying today: %v", got)
	}
	// The agency resolves its own holds, so keep checking.
	if got := NextCheck("action_needed", "", now, recheck); !within(got, now.Add(recheck)) {
		t.Errorf("action_needed: %v", got)
	}
	for _, final := range []string{"sent", "adjusted", "accepted"} {
		if got := NextCheck(final, "", now, recheck); got != nil {
			t.Errorf("%s should not be checked again, got %v", final, got)
		}
	}
}

func TestNote(t *testing.T) {
	amt := func(n int64) *int64 { return &n }
	for _, c := range []struct {
		status        string
		refund, owed  *int64
		message, want string
	}{
		{"approved", amt(1234), nil, "", "The IRS approved your refund of $1,234."},
		{"approved", amt(900), nil, "We corrected a math error on line 13.", "The IRS approved your refund of $900. We corrected a math error on line 13."},
		{"sent", amt(1234567), nil, "", "The IRS sent your refund of $1,234,567 by direct deposit."},
		{"accepted", nil, amt(312), "", "The IRS accepted your return. Balance due: $312."},
		{"adjusted", amt(900), nil, "We corrected a math error on line 13.", "The IRS adjusted your refund to $900 and sent it by direct deposit. We corrected a math error on line 13."},
		{"action_needed", nil, nil, "Verify your identity.", "The IRS needs more information: Verify your identity."},
		{"approved", nil, nil, "", "The IRS approved your refund."},
	} {
		if got := Note(c.status, "IRS", c.refund, c.owed, c.message); got != c.want {
			t.Errorf("Note(%s) = %q, want %q", c.status, got, c.want)
		}
	}
}
