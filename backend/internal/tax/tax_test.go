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
