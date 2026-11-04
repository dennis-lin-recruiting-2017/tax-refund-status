package api

import "testing"

func TestSetStatusValidation(t *testing.T) {
	amt := func(n int64) *int64 { return &n }
	const refund, owed = 800, 0 // as filed

	for _, c := range []struct {
		name string
		req  setStatusRequest
		ok   bool
	}{
		{"approved with a date", setStatusRequest{Status: "approved", PaymentDate: "2026-11-02"}, true},
		{"approved needs a date", setStatusRequest{Status: "approved"}, false},
		{"sent with a date", setStatusRequest{Status: "sent", PaymentDate: "2026-11-02"}, true},
		{"adjusted with amount, reason and date", setStatusRequest{Status: "adjusted", RefundAmount: amt(750), Message: "We corrected a math error.", PaymentDate: "2026-11-02"}, true},
		{"adjusted needs a reason", setStatusRequest{Status: "adjusted", RefundAmount: amt(750), PaymentDate: "2026-11-02"}, false},
		{"adjusted needs an amount", setStatusRequest{Status: "adjusted", Message: "We corrected a math error.", PaymentDate: "2026-11-02"}, false},
		{"adjusted must differ from the claim", setStatusRequest{Status: "adjusted", RefundAmount: amt(800), Message: "We corrected a math error.", PaymentDate: "2026-11-02"}, false},
		{"refund can't be a windfall", setStatusRequest{Status: "adjusted", RefundAmount: amt(5000), Message: "We found a missed credit.", PaymentDate: "2026-11-02"}, false},
		{"refund up to $1,000 over the claim", setStatusRequest{Status: "adjusted", RefundAmount: amt(1800), Message: "We found a missed credit.", PaymentDate: "2026-11-02"}, true},
		{"bad date", setStatusRequest{Status: "approved", PaymentDate: "11/02/2026"}, false},
		{"action required needs a reason", setStatusRequest{Status: "action_required", Message: "  short "}, false},
		{"action required with a reason", setStatusRequest{Status: "action_required", Message: "Verify your identity with Letter 5071C."}, true},
		{"message length capped", setStatusRequest{Status: "processing", Message: string(make([]byte, 501))}, false},
		{"accepted balance in range", setStatusRequest{Status: "accepted", AmountOwed: amt(300)}, true},
		{"accepted balance can't be negative", setStatusRequest{Status: "accepted", AmountOwed: amt(-1)}, false},
	} {
		req := c.req
		if msg := req.validate(refund, owed); (msg == "") != c.ok {
			t.Errorf("%s: got %q, want ok=%v", c.name, msg, c.ok)
		}
	}

	// Fields that don't apply to a status are dropped rather than forwarded to the agency.
	req := setStatusRequest{Status: "processing", RefundAmount: amt(100), AmountOwed: amt(5), PaymentDate: "2026-11-02"}
	if req.validate(refund, owed) != "" || req.RefundAmount != nil || req.AmountOwed != nil || req.PaymentDate != "" {
		t.Errorf("processing kept irrelevant fields: %+v", req)
	}
}
