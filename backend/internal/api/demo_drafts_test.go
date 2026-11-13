package api

import (
	"encoding/json"
	"strings"
	"testing"

	"taxrefund/internal/auth"
	"taxrefund/internal/store"
)

// owesTax lists the testers whose pre-filled returns deliberately owe tax, to demo "Accepted".
var owesTax = map[string]bool{"tester05@test.com": true, "tester15@test.com": true}

type seeded struct {
	email, form string
	req         returnRequest
}

func loadDrafts(t *testing.T) []seeded {
	t.Helper()
	users, err := store.DemoUsers()
	if err != nil {
		t.Fatal(err)
	}
	var out []seeded
	for _, u := range users {
		for form, raw := range u.Drafts {
			spec, ok := forms[form]
			if !ok {
				t.Fatalf("%s: unknown form %q", u.Email, form)
			}
			if spec.jurisdiction != "federal" && !filesForm(u, form) {
				t.Errorf("%s: has a %s draft but doesn't file that form (files %v)", u.Email, form, u.Filings())
			}
			var req returnRequest
			dec := json.NewDecoder(strings.NewReader(string(raw)))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&req); err != nil {
				t.Fatalf("%s %s: %v", u.Email, form, err)
			}
			out = append(out, seeded{u.Email, form, req})
		}
		want := 1
		for _, f := range u.Filings() {
			if stateForm(auth.StateFiling{State: f.State, Residency: f.Residency}) != "" {
				want++
			}
		}
		if u.Role != "admin" && len(u.Drafts) != want {
			t.Errorf("%s: %d drafts; want the 1040 plus one per state with an income tax (%v)", u.Email, len(u.Drafts), u.Filings())
		}
	}
	return out
}

func filesForm(u store.DemoUser, form string) bool {
	for _, f := range u.Filings() {
		if stateForm(auth.StateFiling{State: f.State, Residency: f.Residency}) == form {
			return true
		}
	}
	return false
}

func TestDemoDraftsAreSubmittable(t *testing.T) {
	for _, d := range loadDrafts(t) {
		spec := forms[d.form]
		if errs := d.req.validate(spec, true); len(errs) > 0 {
			t.Errorf("%s %s: invalid draft: %v", d.email, d.form, errs)
			continue
		}
		r := spec.compute(d.req.input())
		if r.Tax <= 0 {
			t.Errorf("%s %s: tax is %d; a realistic filer owes some tax", d.email, d.form, r.Tax)
		}
		switch {
		case owesTax[d.email] && r.Owed == 0:
			t.Errorf("%s %s: should owe tax, got refund %d", d.email, d.form, r.Refund)
		case !owesTax[d.email] && r.Refund < 150:
			t.Errorf("%s %s: refund %d is below $150", d.email, d.form, r.Refund)
		}
	}
}

// Duplicate screening only compares returns that pay into the same bank account, so testers can
// never be held as long as no two of them share one.
func TestDemoDraftsPassDuplicateScreening(t *testing.T) {
	owner := map[string]string{}
	for _, d := range loadDrafts(t) {
		account := d.req.RoutingNumber + ":" + d.req.AccountNumber
		if prev, ok := owner[account]; ok && prev != d.email {
			t.Errorf("%s and %s share bank account %s; duplicate screening would hold one of them", prev, d.email, account)
		}
		owner[account] = d.email
	}
}
