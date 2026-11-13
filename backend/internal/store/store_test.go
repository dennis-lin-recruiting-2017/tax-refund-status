package store

import "testing"

func TestDemoUserFilings(t *testing.T) {
	if f := (DemoUser{}).Filings(); len(f) != 1 || f[0] != (DemoFiling{"CA", "resident"}) {
		t.Errorf("no state at all should default to a California resident, got %v", f)
	}
	if f := (DemoUser{State: "NY"}).Filings(); len(f) != 1 || f[0] != (DemoFiling{"NY", "resident"}) {
		t.Errorf(`"state": "NY" should mean a New York resident, got %v`, f)
	}
	if f := (DemoUser{States: []DemoFiling{}}).Filings(); len(f) != 0 {
		t.Errorf(`"states": [] should mean no states, got %v`, f)
	}
}

func TestEveryDemoUserIsValid(t *testing.T) {
	users, err := DemoUsers()
	if err != nil {
		t.Fatal(err)
	}
	known := map[string]bool{"CA": true, "NY": true, "FL": true, "TX": true, "WA": true} // migration 010
	for _, u := range users {
		residents := 0
		for _, f := range u.Filings() {
			if !known[f.State] {
				t.Errorf("%s: unknown state %q", u.Email, f.State)
			}
			if f.Residency == "resident" {
				residents++
			}
		}
		if residents > 1 {
			t.Errorf("%s: %d resident states; at most one is allowed", u.Email, residents)
		}
	}
}
