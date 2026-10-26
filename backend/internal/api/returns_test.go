package api

import "testing"

func TestValidRouting(t *testing.T) {
	for in, want := range map[string]bool{
		"110000000":  true, // common test routing number
		"021000021":  true,
		"021000022":  false, // bad checksum
		"12345678":   false, // too short
		"11000000a":  false,
		"1100000000": false,
	} {
		if got := validRouting(in); got != want {
			t.Errorf("validRouting(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestValidateRequiresBankOnSubmit(t *testing.T) {
	req := returnRequest{FilingStatus: "single", Wages: 50000, Withholding: 5000}
	if errs := req.validate(false); len(errs) != 0 {
		t.Fatalf("estimate should not need bank details: %v", errs)
	}
	errs := req.validate(true)
	if errs["routingNumber"] == "" || errs["accountNumber"] == "" {
		t.Fatalf("submit should require bank details: %v", errs)
	}
}
