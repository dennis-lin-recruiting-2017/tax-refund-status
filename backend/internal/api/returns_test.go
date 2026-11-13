package api

import (
	"testing"

	"taxrefund/internal/auth"
)

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
	if errs := req.validate(forms["1040"], false); len(errs) != 0 {
		t.Fatalf("estimate should not need bank details: %v", errs)
	}
	errs := req.validate(forms["1040"], true)
	if errs["routingNumber"] == "" || errs["accountNumber"] == "" {
		t.Fatalf("submit should require bank details: %v", errs)
	}
}

func TestValidateStateIncome(t *testing.T) {
	base := returnRequest{FilingStatus: "single", Wages: 50000, Interest: 100, Withholding: 2000}
	for _, c := range []struct {
		name, form  string
		stateIncome int64
		ok          bool
	}{
		{"nonresident needs income from the state", "IT-203", 0, false},
		{"nonresident with income from the state", "IT-203", 20000, true},
		{"all of it from the state", "540NR", 50100, true},
		{"more than total income", "540NR", 50101, false},
		{"resident form doesn't take it", "540", 20000, false},
		{"resident form without it", "IT-201", 0, true},
	} {
		req := base
		req.StateIncome = c.stateIncome
		errs := req.validate(forms[c.form], false)
		if (errs["stateIncome"] == "") != c.ok {
			t.Errorf("%s: errors %v", c.name, errs)
		}
	}
}

func TestStateFormFollowsResidency(t *testing.T) {
	for _, c := range []struct{ state, residency, want string }{
		{"CA", "resident", "540"},
		{"CA", "part_year", "540NR"},
		{"NY", "nonresident", "IT-203"},
		{"NY", "resident", "IT-201"},
		{"TX", "resident", ""}, // no income tax, no return
		{"WA", "nonresident", ""},
	} {
		if got := stateForm(auth.StateFiling{State: c.state, Residency: c.residency}); got != c.want {
			t.Errorf("%s %s: got %s, want %s", c.state, c.residency, got, c.want)
		}
	}
}
