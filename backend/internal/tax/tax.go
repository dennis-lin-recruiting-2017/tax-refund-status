// Package tax computes simplified federal, California, and New York results for the demo.
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

	// Part-year and nonresident state returns: income from this state's sources. The state taxes
	// that share of the tax it would charge a full resident.
	SourceIncome int64
	// Resident state returns: tax charged by other states' part-year and nonresident returns, and
	// the income they taxed, for the credit for tax paid to other states. Filled in by the caller
	// from the taxpayer's other returns, not entered by the taxpayer.
	OtherStateTax    int64
	OtherStateIncome int64
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
	// Set on part-year and nonresident returns: the income this state taxed.
	SourceIncome int64 `json:"sourceIncome,omitempty"`
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

// stateForm finishes a state return from the tax a full resident would owe. A resident return
// subtracts the credit for tax paid to other states, limited to this state's tax on the income
// those states taxed. A part-year or nonresident return taxes only this state's share of income.
func stateForm(code string, lines []Line, residentTax int64, in Input, resident bool) Result {
	r := Result{Lines: lines}
	agi := in.Wages + in.Interest
	tax := residentTax
	if resident {
		if in.OtherStateTax > 0 && agi > 0 {
			limit := int64(math.Round(float64(residentTax) * math.Min(1, float64(in.OtherStateIncome)/float64(agi))))
			credit := min(in.OtherStateTax, limit)
			tax -= credit
			r.Lines = append(r.Lines,
				Line{"Credit for tax paid to other states", credit},
				Line{"Tax after credits", tax})
		}
	} else {
		share := 0.0
		if agi > 0 {
			share = math.Min(1, float64(max(0, in.SourceIncome))/float64(agi))
		}
		tax = int64(math.Round(float64(residentTax) * share))
		r.SourceIncome = min(max(0, in.SourceIncome), agi)
		r.Lines = append(r.Lines,
			Line{code + "-source income", r.SourceIncome},
			Line{"Share of income from " + code + " (%)", int64(math.Round(share * 100))},
			Line{"Tax on " + code + " share", tax})
	}
	r.Lines = append(r.Lines, Line{code + " income tax withheld (W-2 box 17)", in.Withholding})
	settle(&r, tax, in.Withholding)
	return r
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
