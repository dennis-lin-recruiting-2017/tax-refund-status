// Package tax computes simplified Form 1040 and CA Form 540 results for the demo.
//
// These are illustrations, not tax software: no phase-ins, refundable credits, AMT,
// or other schedules. Amounts are whole dollars.
package tax

import "math"

const TaxYear = 2025

type FilingStatus string

const (
	Single  FilingStatus = "single"
	MFJ     FilingStatus = "married_joint"
	MFS     FilingStatus = "married_separate"
	HOH     FilingStatus = "head_of_household"
	Widowed FilingStatus = "qualifying_surviving_spouse"
)

var FilingStatuses = []FilingStatus{Single, MFJ, MFS, HOH, Widowed}

func (f FilingStatus) Valid() bool {
	for _, s := range FilingStatuses {
		if f == s {
			return true
		}
	}
	return false
}

type Input struct {
	FilingStatus       FilingStatus
	Wages              int64
	Withholding        int64
	Interest           int64
	ItemizedDeductions int64
	Dependents         int64
}

type Line struct {
	Label  string `json:"label"`
	Amount int64  `json:"amount"`
}

type Result struct {
	Lines       []Line `json:"lines"`
	Tax         int64  `json:"tax"`
	Withholding int64  `json:"withholding"`
	Refund      int64  `json:"refund"`
	Owed        int64  `json:"owed"`
}

type bracket struct {
	upTo float64 // upper bound of the bracket; math.Inf(1) for the top one
	rate float64
}

func progressive(income int64, brackets []bracket) int64 {
	var tax, lower float64
	x := float64(income)
	for _, b := range brackets {
		if x <= lower {
			break
		}
		tax += (math.Min(x, b.upTo) - lower) * b.rate
		lower = b.upTo
	}
	return int64(math.Round(tax))
}

func settle(r *Result, tax, withholding int64) {
	r.Tax = tax
	r.Withholding = withholding
	if diff := withholding - tax; diff >= 0 {
		r.Refund = diff
		r.Lines = append(r.Lines, Line{"Refund", diff})
	} else {
		r.Owed = -diff
		r.Lines = append(r.Lines, Line{"Amount you owe", -diff})
	}
}
