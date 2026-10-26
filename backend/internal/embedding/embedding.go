// Package embedding turns a tax return into a fixed-length vector for similarity search.
//
// Fraud rings reuse the same figures and the same bank account across stolen identities.
// Encoding those signals as a vector lets pgvector find near-duplicate returns filed under
// different taxpayers with a single nearest-neighbour query.
package embedding

import (
	"math"
	"strconv"
	"strings"

	"taxrefund/internal/tax"
)

const Dims = 16

func Features(jurisdiction string, in tax.Input, r tax.Result, bankFingerprint []byte) []float32 {
	v := make([]float64, Dims)
	logScale := func(n int64) float64 { return math.Log1p(float64(max(n, 0))) / 14 }

	v[0] = logScale(in.Wages)
	v[1] = logScale(in.Withholding)
	if in.Wages > 0 {
		v[2] = math.Min(float64(in.Withholding)/float64(in.Wages), 1)
	}
	v[3] = logScale(in.Interest)
	v[4] = logScale(in.ItemizedDeductions)
	v[5] = math.Min(float64(in.Dependents)/5, 1)
	for i, s := range tax.FilingStatuses {
		if in.FilingStatus == s {
			v[6+i] = 1
		}
	}
	v[11] = logScale(r.Refund) - logScale(r.Owed)
	if jurisdiction == "CA" {
		v[12] = 1
	}
	// Three dimensions derived from the bank fingerprint: same account, same direction.
	for i := 0; i < 3 && i < len(bankFingerprint); i++ {
		v[13+i] = (float64(bankFingerprint[i])/255)*2 - 1
	}

	var norm float64
	for _, x := range v {
		norm += x * x
	}
	norm = math.Sqrt(norm)
	out := make([]float32, Dims)
	for i, x := range v {
		if norm > 0 {
			out[i] = float32(x / norm)
		}
	}
	return out
}

// Literal formats a vector as pgvector's text input, e.g. "[0.1,0.2]".
func Literal(v []float32) string {
	parts := make([]string, len(v))
	for i, x := range v {
		parts[i] = strconv.FormatFloat(float64(x), 'f', 6, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
