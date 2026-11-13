package tax

// California figures use the published 2024 rate schedules and credits for illustration.
var caBrackets = map[FilingStatus][]bracket{
	Single:  {{10756, .01}, {25499, .02}, {40245, .04}, {55866, .06}, {70606, .08}, {360659, .093}, {432787, .103}, {721314, .113}, {inf, .123}},
	MFS:     {{10756, .01}, {25499, .02}, {40245, .04}, {55866, .06}, {70606, .08}, {360659, .093}, {432787, .103}, {721314, .113}, {inf, .123}},
	MFJ:     {{21512, .01}, {50998, .02}, {80490, .04}, {111732, .06}, {141212, .08}, {721318, .093}, {865574, .103}, {1442628, .113}, {inf, .123}},
	Widowed: {{21512, .01}, {50998, .02}, {80490, .04}, {111732, .06}, {141212, .08}, {721318, .093}, {865574, .103}, {1442628, .113}, {inf, .123}},
	HOH:     {{21527, .01}, {51000, .02}, {65744, .04}, {81364, .06}, {96107, .08}, {490493, .093}, {588593, .103}, {980987, .113}, {inf, .123}},
}

var caStandardDeduction = map[FilingStatus]int64{
	Single: 5540, MFS: 5540, MFJ: 11080, Widowed: 11080, HOH: 11080,
}

var caPersonalExemption = map[FilingStatus]int64{
	Single: 149, MFS: 149, HOH: 149, MFJ: 298, Widowed: 298,
}

const (
	caDependentExemption    = 461
	caMentalHealthRate      = 0.01
	caMentalHealthThreshold = 1_000_000
)

// California540 is the resident return.
func California540(in Input) Result { return caReturn(in, true) }

// California540NR is the part-year and nonresident return.
func California540NR(in Input) Result { return caReturn(in, false) }

func caReturn(in Input, resident bool) Result {
	agi := in.Wages + in.Interest
	deduction := caStandardDeduction[in.FilingStatus]
	deductionLabel := "CA standard deduction"
	if in.ItemizedDeductions > deduction {
		deduction, deductionLabel = in.ItemizedDeductions, "CA itemized deductions"
	}
	taxable := max(0, agi-deduction)
	tax := progressive(taxable, caBrackets[in.FilingStatus])
	exemptions := min(tax, caPersonalExemption[in.FilingStatus]+in.Dependents*caDependentExemption)
	mhs := int64(0)
	if taxable > caMentalHealthThreshold {
		mhs = int64(float64(taxable-caMentalHealthThreshold) * caMentalHealthRate)
	}
	totalTax := tax - exemptions + mhs

	lines := []Line{
		{"Wages (all sources)", in.Wages},
		{"Taxable interest", in.Interest},
		{"CA adjusted gross income", agi},
		{deductionLabel, deduction},
		{"CA taxable income", taxable},
		{"Tax", tax},
		{"Exemption credits", exemptions},
		{"Mental health services tax", mhs},
		{"Total tax", totalTax},
	}
	if resident {
		lines[0].Label = "CA wages (W-2 box 16)"
	} else {
		lines[2].Label = "Adjusted gross income (all sources)"
		lines[4].Label = "Taxable income (all sources)"
		lines[len(lines)-1].Label = "Tax as if a full resident"
	}
	return stateForm("CA", lines, totalTax, in, resident)
}
