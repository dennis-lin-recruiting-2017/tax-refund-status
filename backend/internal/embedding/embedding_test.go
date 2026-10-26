package embedding

import (
	"crypto/hmac"
	"crypto/sha256"
	"math"
	"testing"

	"taxrefund/internal/tax"
)

const threshold = 0.02 // matches the SIMILARITY_THRESHOLD default

func fingerprint(account string) []byte {
	m := hmac.New(sha256.New, []byte("test-key-0123456789"))
	m.Write([]byte("110000000:" + account))
	return m.Sum(nil)
}

func cosineDistance(a, b []float32) float64 {
	var dot float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
	}
	return 1 - dot // vectors are unit length
}

func vec(in tax.Input, account string) []float32 {
	return Features("CA", in, tax.California540(in), fingerprint(account))
}

func TestSimilarity(t *testing.T) {
	base := tax.Input{FilingStatus: tax.Single, Wages: 72000, Withholding: 2900, Interest: 120}
	nearby := base
	nearby.Wages, nearby.Withholding = 72400, 2950
	other := tax.Input{FilingStatus: tax.MFJ, Wages: 145000, Withholding: 9100, Dependents: 2}

	cases := []struct {
		name    string
		a, b    []float32
		flagged bool
	}{
		{"identical figures, same account", vec(base, "000123456789"), vec(base, "000123456789"), true},
		{"similar figures, same account", vec(base, "000123456789"), vec(nearby, "000123456789"), true},
		{"identical figures, different account", vec(base, "000123456789"), vec(base, "000987654321"), false},
		{"different taxpayer profile, same account", vec(base, "000123456789"), vec(other, "000123456789"), false},
	}
	for _, c := range cases {
		d := cosineDistance(c.a, c.b)
		if (d < threshold) != c.flagged {
			t.Errorf("%s: distance %.4f, flagged=%v, want %v", c.name, d, d < threshold, c.flagged)
		}
	}
}

func TestUnitLength(t *testing.T) {
	v := vec(tax.Input{FilingStatus: tax.HOH, Wages: 50000, Withholding: 4000, Dependents: 1}, "1234")
	var n float64
	for _, x := range v {
		n += float64(x) * float64(x)
	}
	if math.Abs(n-1) > 1e-5 {
		t.Fatalf("norm^2 = %f", n)
	}
}
