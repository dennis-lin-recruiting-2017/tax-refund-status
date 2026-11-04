package api

import (
	"encoding/json"
	"strings"
	"testing"

	"taxrefund/internal/store"
)

// owesTax lists the testers whose pre-filled returns deliberately owe tax, to demo "Accepted".
var owesTax = map[string]bool{"tester05@test.com": true, "tester15@test.com": true}

type seeded struct {
	email, jurisdiction string
	req                 returnRequest
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
			if spec.jurisdiction != "federal" && spec.jurisdiction != u.State {
				t.Errorf("%s: has a %s draft but files in %s", u.Email, form, u.State)
			}
			var req returnRequest
			dec := json.NewDecoder(strings.NewReader(string(raw)))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&req); err != nil {
				t.Fatalf("%s %s: %v", u.Email, form, err)
			}
			out = append(out, seeded{u.Email, spec.jurisdiction, req})
		}
	}
	return out
}

func TestDemoDraftsAreSubmittable(t *testing.T) {
	drafts := loadDrafts(t)
	if len(drafts) != 40 {
		t.Fatalf("want 40 pre-filled returns (20 testers x 2), got %d", len(drafts))
	}
	for _, d := range drafts {
		if errs := d.req.validate(true); len(errs) > 0 {
			t.Errorf("%s %s: invalid draft: %v", d.email, d.jurisdiction, errs)
			continue
		}
		var spec formSpec
		for _, f := range forms {
			if f.jurisdiction == d.jurisdiction {
				spec = f
			}
		}
		r := spec.compute(d.req.input())
		if r.Tax <= 0 {
			t.Errorf("%s %s: tax is %d; a realistic filer owes some tax", d.email, d.jurisdiction, r.Tax)
		}
		switch {
		case owesTax[d.email] && r.Owed == 0:
			t.Errorf("%s %s: should owe tax, got refund %d", d.email, d.jurisdiction, r.Refund)
		case !owesTax[d.email] && r.Refund < 150:
			t.Errorf("%s %s: refund %d is below $150", d.email, d.jurisdiction, r.Refund)
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
