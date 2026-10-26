package agencymock

import (
	"strconv"
	"testing"
	"time"

	"go.opentelemetry.io/otel/trace/noop"
)

func TestLifecycle(t *testing.T) {
	m := New(Config{Agency: "ca-ftb", ProcessAfter: 5 * time.Second, ApproveAfter: 20 * time.Second, SendAfter: 45 * time.Second}, nil, noop.NewTracerProvider())
	received := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	refundID := "ca-ftb-" + itoa(received.UnixMilli()) + "-r-abc"
	owedID := "ca-ftb-" + itoa(received.UnixMilli()) + "-o-abc"

	for _, c := range []struct {
		id    string
		after time.Duration
		want  string
	}{
		{refundID, 1 * time.Second, "received"},
		{refundID, 10 * time.Second, "processing"},
		{refundID, 30 * time.Second, "approved"},
		{refundID, 50 * time.Second, "sent"},
		{owedID, 30 * time.Second, "accepted"},
		{"irs-" + itoa(received.UnixMilli()) + "-r-abc", 30 * time.Second, "not_found"}, // other agency's ID
		{"garbage", 0, "not_found"},
	} {
		got := m.Status(c.id, received.Add(c.after))
		if got.Status != c.want {
			t.Errorf("%s after %s: got %s, want %s", c.id, c.after, got.Status, c.want)
		}
	}
	if got := m.Status(refundID, received.Add(30*time.Second)); got.PaymentDate != "2026-03-01" {
		t.Errorf("payment date = %q", got.PaymentDate)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
