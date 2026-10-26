package tax

import "math"

var inf = math.Inf(1)

// 2025 federal rate schedules (Rev. Proc. 2024-40).
var federalBrackets = map[FilingStatus][]bracket{
	Single:  {{11925, .10}, {48475, .12}, {103350, .22}, {197300, .24}, {250525, .32}, {626350, .35}, {inf, .37}},
	MFS:     {{11925, .10}, {48475, .12}, {103350, .22}, {197300, .24}, {250525, .32}, {375800, .35}, {inf, .37}},
	MFJ:     {{23850, .10}, {96950, .12}, {206700, .22}, {394600, .24}, {501050, .32}, {751600, .35}, {inf, .37}},
	Widowed: {{23850, .10}, {96950, .12}, {206700, .22}, {394600, .24}, {501050, .32}, {751600, .35}, {inf, .37}},
	HOH:     {{17000, .10}, {64850, .12}, {103350, .22}, {197300, .24}, {250500, .32}, {626350, .35}, {inf, .37}},
}

// 2025 standard deduction, as amended in July 2025.
var federalStandardDeduction = map[FilingStatus]int64{
	Single: 15750, MFS: 15750, MFJ: 31500, Widowed: 31500, HOH: 23625,
}

const (
	childTaxCredit      = 2200
	ctcPhaseoutJoint    = 400000
	ctcPhaseoutOther    = 200000
	ctcPhaseoutPerThous = 50
)

func Federal1040(in Input) Result {
	var r Result
	agi := in.Wages + in.Interest
	deduction := federalStandardDeduction[in.FilingStatus]
	deductionLabel := "Standard deduction"
	if in.ItemizedDeductions > deduction {
		deduction, deductionLabel = in.ItemizedDeductions, "Itemized deductions"
	}
	taxable := max(0, agi-deduction)
	tax := progressive(taxable, federalBrackets[in.FilingStatus])

	threshold := int64(ctcPhaseoutOther)
	if in.FilingStatus == MFJ {
		threshold = ctcPhaseoutJoint
	}
	credit := in.Dependents * childTaxCredit
	if agi > threshold {
		excessThousands := (agi - threshold + 999) / 1000
		credit = max(0, credit-excessThousands*ctcPhaseoutPerThous)
	}
	credit = min(credit, tax) // nonrefundable portion only
	totalTax := tax - credit

	r.Lines = []Line{
		{"Wages (W-2 box 1)", in.Wages},
		{"Taxable interest", in.Interest},
		{"Adjusted gross income", agi},
		{deductionLabel, deduction},
		{"Taxable income", taxable},
		{"Tax", tax},
		{"Child tax credit", credit},
		{"Total tax", totalTax},
		{"Federal income tax withheld", in.Withholding},
	}
	settle(&r, totalTax, in.Withholding)
	return r
}
