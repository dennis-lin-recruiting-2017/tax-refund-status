package embedding

import (
	"math"
	"testing"

	"taxrefund/internal/tax"
)

const threshold = 0.02 // matches the SIMILARITY_THRESHOLD default

func cosineDistance(a, b []float32) float64 {
	var dot float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
	}
	return 1 - dot // vectors are unit length
}

func vec(in tax.Input) []float32 { return Features(in, tax.California540(in)) }

func TestSimilarity(t *testing.T) {
	base := tax.Input{FilingStatus: tax.Single, Wages: 72000, Withholding: 2900, Interest: 120}
	templated := base
	templated.Wages, templated.Withholding = 72100, 2905 // a fraud template with tiny tweaks
	other := tax.Input{FilingStatus: tax.MFJ, Wages: 145000, Withholding: 9100, Dependents: 2}

	if d := cosineDistance(vec(base), vec(base)); d > 1e-6 {
		t.Errorf("identical figures: distance %.6f, want 0", d)
	}
	if d := cosineDistance(vec(base), vec(templated)); d >= threshold {
		t.Errorf("templated figures: distance %.4f, want under %.2f", d, threshold)
	}
	if d := cosineDistance(vec(base), vec(other)); d < threshold {
		t.Errorf("different household: distance %.4f, want at least %.2f", d, threshold)
	}
}

func TestUnitLength(t *testing.T) {
	v := vec(tax.Input{FilingStatus: tax.HOH, Wages: 50000, Withholding: 4000, Dependents: 1})
	var n float64
	for _, x := range v {
		n += float64(x) * float64(x)
	}
	if math.Abs(n-1) > 1e-5 {
		t.Fatalf("norm^2 = %f", n)
	}
}
