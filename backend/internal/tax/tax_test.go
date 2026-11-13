package tax

import "testing"

func TestFederalSingleRefund(t *testing.T) {
	// 72,000 wages - 15,750 = 56,250 taxable.
	// 11,925*.10 + (48,475-11,925)*.12 + (56,250-48,475)*.22 = 1,192.50 + 4,386 + 1,710.50 = 7,289
	r := Federal1040(Input{FilingStatus: Single, Wages: 72000, Withholding: 8500})
	if r.Tax != 7289 || r.Refund != 1211 || r.Owed != 0 {
		t.Fatalf("got tax=%d refund=%d owed=%d", r.Tax, r.Refund, r.Owed)
	}
}

func TestFederalChildCreditCappedAtTax(t *testing.T) {
	r := Federal1040(Input{FilingStatus: HOH, Wages: 30000, Withholding: 500, Dependents: 3})
	if r.Tax != 0 || r.Refund != 500 {
		t.Fatalf("got tax=%d refund=%d", r.Tax, r.Refund)
	}
}

func TestFederalChildCreditPhaseout(t *testing.T) {
	// 210,500 AGI is 10,500 over the 200k threshold: 11 thousands * $50 = $550 reduction.
	r := Federal1040(Input{FilingStatus: Single, Wages: 210500, Dependents: 1})
	for _, l := range r.Lines {
		if l.Label == "Child tax credit" && l.Amount != 2200-550 {
			t.Fatalf("credit = %d", l.Amount)
		}
	}
}

func TestFederalItemizedWhenLarger(t *testing.T) {
	r := Federal1040(Input{FilingStatus: Single, Wages: 100000, ItemizedDeductions: 20000})
	if r.Lines[3].Label != "Itemized deductions" || r.Lines[3].Amount != 20000 {
		t.Fatalf("deduction line = %+v", r.Lines[3])
	}
}

func TestCaliforniaSingleOwed(t *testing.T) {
	// 72,000 - 5,540 = 66,460 taxable.
	// 107.56 + 294.86 + 589.84 + 937.26 + (66,460-55,866)*.08=847.52 → 2,777.04 → 2,777; minus 149 = 2,628
	r := California540(Input{FilingStatus: Single, Wages: 72000, Withholding: 2400})
	if r.Tax != 2628 || r.Owed != 228 {
		t.Fatalf("got tax=%d owed=%d refund=%d", r.Tax, r.Owed, r.Refund)
	}
}

func TestNewYorkSingle(t *testing.T) {
	// 72,000 - 8,000 = 64,000 taxable.
	// 8,500*.04=340 + 3,200*.045=144 + 2,200*.0525=115.50 + (64,000-13,900)*.055=2,755.50 → 3,355
	r := NewYorkIT201(Input{FilingStatus: Single, Wages: 72000, Withholding: 3500})
	if r.Tax != 3355 || r.Refund != 145 {
		t.Fatalf("got tax=%d refund=%d owed=%d", r.Tax, r.Refund, r.Owed)
	}
}

func TestNewYorkDependentExemption(t *testing.T) {
	a := NewYorkIT201(Input{FilingStatus: HOH, Wages: 60000})
	b := NewYorkIT201(Input{FilingStatus: HOH, Wages: 60000, Dependents: 2})
	if a.Tax-b.Tax != 110 { // 2,000 less taxable income at the 5.5% bracket
		t.Fatalf("dependent exemption saved %d, want 110", a.Tax-b.Tax)
	}
}

func TestNewYorkNonresidentTaxesOnlyItsShare(t *testing.T) {
	// The tax a full resident would owe on 72,000 is 3,355 (above). A quarter of the income is from
	// New York, so New York charges a quarter of it.
	r := NewYorkIT203(Input{FilingStatus: Single, Wages: 72000, SourceIncome: 18000, Withholding: 900})
	if r.Tax != 839 || r.Refund != 61 || r.SourceIncome != 18000 {
		t.Fatalf("got tax=%d refund=%d source=%d", r.Tax, r.Refund, r.SourceIncome)
	}
}

func TestNonresidentShareIsCapped(t *testing.T) {
	full := California540(Input{FilingStatus: Single, Wages: 72000})
	r := California540NR(Input{FilingStatus: Single, Wages: 72000, SourceIncome: 500000})
	if r.Tax != full.Tax || r.SourceIncome != 72000 {
		t.Fatalf("source income above total income: tax=%d (resident %d) source=%d", r.Tax, full.Tax, r.SourceIncome)
	}
	if r := California540NR(Input{FilingStatus: Single, Wages: 72000}); r.Tax != 0 {
		t.Fatalf("no California income should mean no California tax, got %d", r.Tax)
	}
}

func TestResidentCreditForTaxPaidToOtherStates(t *testing.T) {
	// California tax on 72,000 is 2,628 (above). New York taxed 18,000 of it, a quarter, so the
	// credit is New York's tax, limited to California's tax on that quarter: 657.
	in := Input{FilingStatus: Single, Wages: 72000, OtherStateIncome: 18000}
	in.OtherStateTax = 839
	if r := California540(in); r.Tax != 2628-657 {
		t.Fatalf("limited credit: tax=%d, want %d", r.Tax, 2628-657)
	}
	in.OtherStateTax = 400
	if r := California540(in); r.Tax != 2628-400 {
		t.Fatalf("full credit: tax=%d, want %d", r.Tax, 2628-400)
	}
	if r := California540(Input{FilingStatus: Single, Wages: 72000}); len(r.Lines) != 11 {
		t.Fatalf("no credit lines without other-state tax, got %d lines", len(r.Lines))
	}
}
