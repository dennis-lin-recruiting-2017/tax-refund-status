package config

import "testing"

func TestPrefixes(t *testing.T) {
	got, err := prefixes(" 10.0.0.0/8, 192.168.1.10 ,fc00::/7,")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"10.0.0.0/8", "192.168.1.10/32", "fc00::/7"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i].String() != want[i] {
			t.Errorf("entry %d: got %s, want %s", i, got[i], want[i])
		}
	}
	if _, err := prefixes("10.0.0.0/33"); err == nil {
		t.Error("an invalid range should be rejected")
	}
	if _, err := prefixes(defaultTrustedProxies); err != nil {
		t.Errorf("default ranges: %v", err)
	}
}
