// Package embedding turns a tax return's figures into a fixed-length vector for similarity search.
//
// Fraud rings file templated returns, with near-identical figures, under stolen identities and
// route the refunds into one bank account. The processor finds them by looking for other
// taxpayers' returns paying into the same account (an exact match on the keyed bank fingerprint)
// and asking pgvector whether any of those have near-identical figures. The bank account is
// deliberately not part of the vector: hashed account bytes are effectively random, so two
// different accounts can land close together and make honest filers with similar incomes look
// like duplicates.
package embedding

import (
	"math"
	"strconv"
	"strings"

	"taxrefund/internal/tax"
)

const Dims = 16

func Features(in tax.Input, r tax.Result) []float32 {
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
	v[12] = logScale(r.Tax)
	if in.Wages > 0 {
		v[13] = math.Min(float64(r.Tax)/float64(in.Wages), 1) // effective tax rate
	}
	v[14] = math.Max(-1, math.Min(1, float64(r.Refund-r.Owed)/float64(max(r.Tax, 1))))
	if in.ItemizedDeductions > 0 {
		v[15] = 1
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
