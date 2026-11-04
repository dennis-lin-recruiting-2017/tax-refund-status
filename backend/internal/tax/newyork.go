package tax

// New York figures use the published 2024 rate schedules and standard deductions for
// illustration. New York City and Yonkers taxes, credits, and the recapture rules for high
// incomes are left out.
var nyBrackets = map[FilingStatus][]bracket{
	Single:  {{8500, .04}, {11700, .045}, {13900, .0525}, {80650, .055}, {215400, .06}, {1077550, .0685}, {5000000, .0965}, {25000000, .103}, {inf, .109}},
	MFS:     {{8500, .04}, {11700, .045}, {13900, .0525}, {80650, .055}, {215400, .06}, {1077550, .0685}, {5000000, .0965}, {25000000, .103}, {inf, .109}},
	MFJ:     {{17150, .04}, {23600, .045}, {27900, .0525}, {161550, .055}, {323200, .06}, {2155350, .0685}, {5000000, .0965}, {25000000, .103}, {inf, .109}},
	Widowed: {{17150, .04}, {23600, .045}, {27900, .0525}, {161550, .055}, {323200, .06}, {2155350, .0685}, {5000000, .0965}, {25000000, .103}, {inf, .109}},
	HOH:     {{12800, .04}, {17650, .045}, {20900, .0525}, {107650, .055}, {269300, .06}, {1616450, .0685}, {5000000, .0965}, {25000000, .103}, {inf, .109}},
}

var nyStandardDeduction = map[FilingStatus]int64{
	Single: 8000, MFS: 8000, MFJ: 16050, Widowed: 16050, HOH: 11200,
}

const nyDependentExemption = 1000

func NewYorkIT201(in Input) Result {
	var r Result
	agi := in.Wages + in.Interest
	deduction := nyStandardDeduction[in.FilingStatus]
	deductionLabel := "NY standard deduction"
	if in.ItemizedDeductions > deduction {
		deduction, deductionLabel = in.ItemizedDeductions, "NY itemized deductions"
	}
	exemptions := in.Dependents * nyDependentExemption
	taxable := max(0, agi-deduction-exemptions)
	tax := progressive(taxable, nyBrackets[in.FilingStatus])

	r.Lines = []Line{
		{"NY wages (W-2 box 16)", in.Wages},
		{"Taxable interest", in.Interest},
		{"NY adjusted gross income", agi},
		{deductionLabel, deduction},
		{"Dependent exemptions", exemptions},
		{"NY taxable income", taxable},
		{"Total tax", tax},
		{"NY income tax withheld (W-2 box 17)", in.Withholding},
	}
	settle(&r, tax, in.Withholding)
	return r
}
