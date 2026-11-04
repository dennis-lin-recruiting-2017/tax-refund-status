package processor

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"taxrefund/internal/agency"
)

func TestRetryDelay(t *testing.T) {
	for _, c := range []struct {
		attempt  int
		r        float64
		min, max time.Duration
	}{
		{1, 0, time.Second, time.Second},
		{1, 0.999, time.Second, 3 * time.Second},
		{3, 0.999, time.Second, 9 * time.Second},
		{10, 0.999, time.Second, retryCap + time.Second},
		{50, 0.999, time.Second, retryCap + time.Second}, // no overflow
	} {
		got := retryDelay(c.attempt, c.r)
		if got < c.min || got > c.max {
			t.Errorf("attempt %d, r %.3f: got %v, want between %v and %v", c.attempt, c.r, got, c.min, c.max)
		}
	}
	// Full jitter: returns that failed together spread out instead of retrying in step.
	if retryDelay(5, 0.1) == retryDelay(5, 0.9) {
		t.Error("different random draws should give different delays")
	}
}

func TestAgencyFault(t *testing.T) {
	for _, c := range []struct {
		name string
		err  error
		want bool
	}{
		{"network or 5xx after retries", errors.New("irs /v1/returns failed after 4 attempts"), true},
		{"credentials refused", &agency.StatusError{Code: 401}, true},
		{"forbidden", fmt.Errorf("wrapped: %w", &agency.StatusError{Code: 403}), true},
		{"this return was rejected", &agency.StatusError{Code: 400}, false},
		{"duplicate submission", &agency.StatusError{Code: 409}, false},
	} {
		if got := agencyFault(c.err); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
