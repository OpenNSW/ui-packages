import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateExpression, evaluateExpressions } from './expression'
import { FormulaError } from './reference'
import { parseWorkbookToMatrix } from './parse'
import type { FormulaConfigEntry, FormulaErrorCode, Matrix } from './types'

// evaluateExpression is async now (dynamic import of both libraries, plus the
// library's own parse may itself be async) — every call site below must
// await it. expectFormulaError does the awaiting itself so call sites read
// the same as the old, synchronous test suite did.
async function expectFormulaError(promise: Promise<unknown>, code: FormulaErrorCode) {
  try {
    await promise
  } catch (err) {
    if (!(err instanceof FormulaError)) throw err
    expect(err.code).toBe(code)
    return
  }
  throw new Error('expected the promise to reject with a FormulaError')
}

// Row 1 (index 0): headers
// Row 2 (index 1): Widget, 10, 100, (blank)
// Row 3 (index 2): Gadget, 20, 200, (blank)
// Row 4 (index 3): Gizmo,   5,  50, (blank)
// Row 5 (index 4): Thing,  15, 150, (blank)
// Column D is present on every row but always blank — an in-bounds, genuinely
// empty numeric range (as opposed to a range whose column doesn't exist on
// the sheet at all, covered separately below).
const matrix: Matrix = [
  ['Item', 'Qty', 'Price', 'Notes'],
  ['Widget', 10, 100, null],
  ['Gadget', 20, 200, null],
  ['Gizmo', 5, 50, null],
  ['Thing', 15, 150, null],
]

describe('evaluateExpression', () => {
  it('evaluates the spec example: SUM over a quantity range', async () => {
    expect(await evaluateExpression(matrix, '=SUM(B2:B5)')).toBe(50)
  })

  it('evaluates the spec example: SUM(...)*100', async () => {
    expect(await evaluateExpression(matrix, '=SUM(B2:B5)*100')).toBe(5000)
  })

  it('tolerates a missing leading =', async () => {
    expect(await evaluateExpression(matrix, 'SUM(B2:B5)')).toBe(50)
  })

  it('evaluates a nested function call, pooling both ranges', async () => {
    // MAX(C2:C5) = 200; SUM(B2:B5, MAX(C2:C5)) = 50 + 200 = 250
    expect(await evaluateExpression(matrix, '=SUM(B2:B5, MAX(C2:C5))')).toBe(250)
  })

  it('pools two plain ranges of different sizes passed directly as multiple AVERAGE args', async () => {
    // B2:B4 = [10,20,5] (3 items), C2:C5 = [100,200,50,150] (4 items).
    // Pooled mean = (10+20+5+100+200+50+150) / 7, which differs from an (incorrect)
    // average-of-averages, so this disambiguates pooling from per-range averaging.
    expect(await evaluateExpression(matrix, '=AVERAGE(B2:B4, C2:C5)')).toBeCloseTo(535 / 7, 10)
    expect(await evaluateExpression(matrix, '=COUNT(B2:B4, C2:C5)')).toBe(7)
  })

  it('COUNT counts only numeric cells', async () => {
    expect(await evaluateExpression(matrix, '=COUNT(B2:B5)')).toBe(4)
  })

  it('AVERAGE computes the mean', async () => {
    expect(await evaluateExpression(matrix, '=AVERAGE(B2:B5)')).toBe(12.5)
  })

  it('MIN/MAX over an entirely-blank-but-in-bounds numeric range is 0, matching formulajs’s own empty-input convention', async () => {
    expect(await evaluateExpression(matrix, '=MIN(D2:D5)')).toBe(0)
    expect(await evaluateExpression(matrix, '=MAX(D2:D5)')).toBe(0)
  })

  // Verified against the real library, not carried over from the hand-rolled
  // engine this replaces: AVERAGE over an entirely-blank range computes 0/0
  // internally, and fast-formula-parser's own top-level result check
  // (`checkFormulaResult`) turns any NaN number result into #VALUE! — not
  // #DIV/0! the way real Excel (and the old hand-rolled engine) reports it.
  // That is the library's own, verified behavior; documented here rather than
  // silently asserting the old (now-incorrect) expectation.
  it('AVERAGE over an entirely-blank range is #VALUE! per the real library’s own NaN handling', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=AVERAGE(D2:D5)'), 'VALUE')
  })

  describe('error codes', () => {
    it('REF: a row reference past the end of the sheet', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=B10'), 'REF')
    })

    it('REF: a range whose column does not exist anywhere on the sheet (re-verifies the range-out-of-bounds fix through the library)', async () => {
      // The matrix is 4 columns wide (A-D); F is entirely off the sheet, not
      // merely sparse near the edge — this must throw REF, not resolve to an
      // empty-but-valid-looking range that would let SUM return a confident 0.
      await expectFormulaError(evaluateExpression(matrix, '=F2:F5'), 'REF')
      await expectFormulaError(evaluateExpression(matrix, '=SUM(F2:F5)'), 'REF')
    })

    it('a bare scalar reference to a non-numeric cell returns its raw value instead of throwing', async () => {
      expect(await evaluateExpression(matrix, '=A2')).toBe('Widget')
    })

    it('VALUE: arithmetic on a non-numeric scalar reference', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=A2+1'), 'VALUE')
    })

    it('DIV0: division by a literal zero', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=10/0'), 'DIV0')
    })

    it('NAME: unrecognized function name', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=FOO(B2)'), 'NAME')
    })

    it('NAME: the allowlist rejects a genuinely-stubbed, NOT-backfilled function end-to-end (the single most important safety guarantee this rewrite adds)', async () => {
      // SUBTOTAL has real (but incomplete/TODO) native code and was
      // deliberately not backfilled (see formulaFunctions.ts). Without the
      // allowlist pre-scan, fast-formula-parser would throw its own generic
      // "not implemented" error for this specific stub today — but that is an
      // accident of the current dispatcher, not a guarantee. This test proves
      // the *allowlist*, not the library's incidental behavior, is what
      // stands between a stubbed function and a caller, by asserting the
      // error shape our own code produces (#NAME?) end-to-end through
      // evaluateExpression, not just against assertAllowedFunctions in
      // isolation (see formulaFunctions.test.ts for that unit-level check).
      await expectFormulaError(evaluateExpression(matrix, '=SUBTOTAL(9,B2:B5)'), 'NAME')
    })

    it('ERROR: mismatched parens', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=SUM(B2:B5'), 'ERROR')
    })

    it('ERROR: leftover trailing tokens', async () => {
      await expectFormulaError(evaluateExpression(matrix, '=5)'), 'ERROR')
    })

    it('ERROR: empty expression', async () => {
      await expectFormulaError(evaluateExpression(matrix, ''), 'ERROR')
    })

    it('ERROR: non-string expression field', async () => {
      await expectFormulaError(evaluateExpression(matrix, null as unknown as string), 'ERROR')
    })
  })

  describe('IF short-circuiting — precisely scoped (verified empirically, not assumed)', () => {
    it('IF(FALSE, 1/0, 99) returns 99 without ever evaluating the untaken 1/0 branch', async () => {
      expect(await evaluateExpression(matrix, '=IF(FALSE, 1/0, 99)')).toBe(99)
    })

    it('IF(TRUE, 99, 1/0) returns 99 without ever evaluating the untaken 1/0 branch', async () => {
      expect(await evaluateExpression(matrix, '=IF(TRUE, 99, 1/0)')).toBe(99)
    })

    it('a bare, not-yet-retrieved reference in the untaken branch is genuinely discarded, never dereferenced', async () => {
      // B100 does not exist on the 5-row matrix — if it were ever dereferenced
      // this would throw REF instead of returning 99.
      expect(await evaluateExpression(matrix, '=IF(FALSE, B100, 99)')).toBe(99)
    })

    it('a backfilled function raising the library’s own error class in the untaken branch also short-circuits', async () => {
      // MATCH's own not-found case raises the library's FormulaError from
      // inside MATCH's own function body, converted to a value by
      // `_callFunction`'s per-call try/catch before IF ever runs — a
      // fundamentally different path from the REF case below.
      expect(await evaluateExpression(matrix, '=IF(FALSE, MATCH(999,B2:B5), 99)')).toBe(99)
    })

    // Documented, accepted limitation (see expression.ts's module comment for
    // the full root-cause explanation and why it is not "fixed" by making
    // onCell/onRange return an error value instead of throwing): a REF error
    // from this project's own onCell/onRange does NOT short-circuit when it's
    // nested inside a function call in the untaken/caught branch, because
    // fast-formula-parser evaluates a nested function call eagerly — before
    // IF/IFERROR is ever dispatched — regardless of which branch would end up
    // selected. This is the opposite of the two cases above; both are pinned
    // here so a future change can't silently regress either one.
    it('does NOT short-circuit a REF error from onRange nested inside a function call in the untaken branch', async () => {
      // Z is entirely off the 4-column matrix.
      await expectFormulaError(evaluateExpression(matrix, '=IF(FALSE, SUM(Z2:Z5), 99)'), 'REF')
      await expectFormulaError(evaluateExpression(matrix, '=IF(TRUE, 99, SUM(Z2:Z5))'), 'REF')
    })
  })
})

describe('IF condition validation (see formulaFunctions.ts’s LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION)', () => {
  it('numbers coerce: 0 is false, any nonzero number is true', async () => {
    expect(await evaluateExpression(matrix, '=IF(0,1,2)')).toBe(2)
    expect(await evaluateExpression(matrix, '=IF(1,1,2)')).toBe(1)
    expect(await evaluateExpression(matrix, '=IF(-5,1,2)')).toBe(1)
  })

  it('a string condition throws VALUE regardless of its content — not fast-formula-parser’s native JS-truthy coercion', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=IF("abc",1,2)'), 'VALUE')
    await expectFormulaError(evaluateExpression(matrix, '=IF("",1,2)'), 'VALUE')
    await expectFormulaError(evaluateExpression(matrix, '=IF("FALSE",1,2)'), 'VALUE')
    await expectFormulaError(evaluateExpression(matrix, '=IF("true",1,2)'), 'VALUE')
  })

  it('a bare cell reference used directly as the condition is dereferenced and its real value decides the branch', async () => {
    // Previously this always took the true branch regardless of the
    // referenced cell's actual value (native IF never dereferences a raw
    // reference used as its own condition) — B2=10 (truthy), B4=5 (truthy),
    // A2='Widget' (a string condition, so VALUE) confirm real dereferencing.
    expect(await evaluateExpression(matrix, '=IF(B2,1,2)')).toBe(1)
    await expectFormulaError(evaluateExpression(matrix, '=IF(A2,1,2)'), 'VALUE')
  })

  it('a condition referencing an out-of-bounds cell still surfaces as an error rather than a confident branch choice', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=IF(Z1,1,2)'), 'REF')
  })
})

describe('operators and literals', () => {
  describe('comparison (= <> < > <= >=)', () => {
    it('= is numeric for numbers', async () => {
      expect(await evaluateExpression(matrix, '=1=1')).toBe(true)
      expect(await evaluateExpression(matrix, '=1=2')).toBe(false)
    })

    // Verified against the real library, not carried over from the
    // hand-rolled engine this replaces (which deliberately made string
    // comparison case-insensitive, matching real Excel). fast-formula-
    // parser's own `=` operator is case-sensitive for strings — documented
    // here as the real, verified behavior rather than silently assuming the
    // old (now-incorrect) expectation.
    it('= is case-sensitive for strings', async () => {
      expect(await evaluateExpression(matrix, '="abc"="ABC"')).toBe(false)
      expect(await evaluateExpression(matrix, '="abc"="abc"')).toBe(true)
    })

    it('<> is the not-equal operator', async () => {
      expect(await evaluateExpression(matrix, '=1<>2')).toBe(true)
      expect(await evaluateExpression(matrix, '=1<>1')).toBe(false)
    })

    it('< > <= >= compare numerically for numbers', async () => {
      expect(await evaluateExpression(matrix, '=1<2')).toBe(true)
      expect(await evaluateExpression(matrix, '=2>1')).toBe(true)
      expect(await evaluateExpression(matrix, '=2<=2')).toBe(true)
      expect(await evaluateExpression(matrix, '=3>=4')).toBe(false)
    })

    it('< > fall back to lexicographic string comparison for non-numeric operands', async () => {
      expect(await evaluateExpression(matrix, '="b">"a"')).toBe(true)
      expect(await evaluateExpression(matrix, '="apple"<"banana"')).toBe(true)
    })

    it('never throws, even comparing a number against a string (must not crash)', async () => {
      await expect(evaluateExpression(matrix, '=1<"abc"')).resolves.not.toBeUndefined()
    })
  })

  describe('& (concatenation)', () => {
    it('concatenates a string with a number', async () => {
      expect(await evaluateExpression(matrix, '="Total: "&10')).toBe('Total: 10')
    })

    it('concatenates a boolean as TRUE/FALSE, not lowercase', async () => {
      expect(await evaluateExpression(matrix, '="Value is "&TRUE')).toBe('Value is TRUE')
    })
  })

  describe('^ (exponentiation)', () => {
    it('computes a power', async () => {
      expect(await evaluateExpression(matrix, '=2^3')).toBe(8)
    })

    it('throws VALUE for a non-numeric operand', async () => {
      await expectFormulaError(evaluateExpression(matrix, '="abc"^2'), 'VALUE')
    })

    it('matches Excel precedence: negation binds tighter than exponentiation (-2^2 = 4, not -4)', async () => {
      expect(await evaluateExpression(matrix, '=-2^2')).toBe(4)
    })
  })

  describe('% (postfix percent)', () => {
    it('divides by 100', async () => {
      expect(await evaluateExpression(matrix, '=5%')).toBe(0.05)
    })

    it('throws VALUE for a non-numeric operand', async () => {
      await expectFormulaError(evaluateExpression(matrix, '="abc"%'), 'VALUE')
    })
  })

  describe('string and boolean literals', () => {
    it('parses a string literal containing a doubled-quote escape', async () => {
      expect(await evaluateExpression(matrix, '="say ""hi"""')).toBe('say "hi"')
    })

    // Verified against the real library, not carried over from the
    // hand-rolled engine this replaces (which deliberately recognized
    // TRUE/FALSE case-insensitively): fast-formula-parser's grammar only
    // recognizes the exact uppercase spelling as the boolean literal —
    // `true`/`True` parse as an ordinary (unrecognized) bareword name rather
    // than the boolean TRUE, and evaluate as FALSE, not as an error or as
    // TRUE. Documented here as the real, verified behavior.
    it('only the exact uppercase TRUE/FALSE spelling is recognized as the boolean literal', async () => {
      expect(await evaluateExpression(matrix, '=IF(TRUE, 1, 2)')).toBe(1)
      expect(await evaluateExpression(matrix, '=IF(FALSE, 1, 2)')).toBe(2)
      expect(await evaluateExpression(matrix, '=IF(true, 1, 2)')).toBe(2)
      expect(await evaluateExpression(matrix, '=IF(False, 1, 2)')).toBe(2)
    })
  })
})

describe('IFERROR', () => {
  it('catches an error thrown while evaluating the first argument', async () => {
    expect(await evaluateExpression(matrix, '=IFERROR(1/0, 99)')).toBe(99)
  })

  it('returns the first argument unchanged when it does not throw', async () => {
    expect(await evaluateExpression(matrix, '=IFERROR(42, 99)')).toBe(42)
  })

  it('does NOT catch an error thrown while evaluating the fallback itself', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=IFERROR(1/0, 1/0)'), 'DIV0')
  })

  // Documented, accepted limitation — same root cause as the IF case in the
  // 'IF short-circuiting' describe block above (see expression.ts's module
  // comment): a REF error from this project's own onCell/onRange, raised
  // while evaluating IFERROR's own first argument, is not caught — it
  // unwinds straight past IFERROR to the outermost parser.parse() try/catch,
  // hard-failing instead of falling back to the second argument.
  it('does NOT catch a REF error from onRange raised while evaluating its own first argument', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=IFERROR(SUM(Z2:Z5), 99)'), 'REF')
  })
})

describe('ROUND / ROUNDUP / ROUNDDOWN', () => {
  it('ROUND rounds half away from zero, including for a negative number', async () => {
    expect(await evaluateExpression(matrix, '=ROUND(2.5,0)')).toBe(3)
    expect(await evaluateExpression(matrix, '=ROUND(-2.5,0)')).toBe(-3)
  })

  it('ROUND handles a negative num_digits (rounds to hundreds)', async () => {
    expect(await evaluateExpression(matrix, '=ROUND(1234,-2)')).toBe(1200)
  })

  it('ROUNDUP always rounds away from zero, including for a negative number and negative num_digits', async () => {
    expect(await evaluateExpression(matrix, '=ROUNDUP(1.1,0)')).toBe(2)
    expect(await evaluateExpression(matrix, '=ROUNDUP(-1.1,0)')).toBe(-2)
    expect(await evaluateExpression(matrix, '=ROUNDUP(1234,-2)')).toBe(1300)
  })

  it('ROUNDDOWN always truncates toward zero, including for a negative number and negative num_digits', async () => {
    expect(await evaluateExpression(matrix, '=ROUNDDOWN(1.9,0)')).toBe(1)
    expect(await evaluateExpression(matrix, '=ROUNDDOWN(-1.9,0)')).toBe(-1)
    expect(await evaluateExpression(matrix, '=ROUNDDOWN(1234,-2)')).toBe(1200)
  })
})

describe('CONCATENATE / CONCAT', () => {
  it('mixes number, string, boolean, and a blank cell into one call', async () => {
    // D2 is blank -> coerces to '' (verified end-to-end: fast-formula-parser's
    // own native CONCATENATE mishandles a bare blank cell argument, which is
    // exactly why CONCATENATE is backfilled — see formulaFunctions.ts).
    expect(await evaluateExpression(matrix, '=CONCATENATE("Qty: ", 10, " ok=", TRUE, D2)')).toBe('Qty: 10 ok=TRUE')
  })

  it('CONCAT is an alias with identical behavior', async () => {
    expect(await evaluateExpression(matrix, '=CONCAT("a", 1, FALSE)')).toBe('a1FALSE')
  })

  it('joins a whole range argument with no separator', async () => {
    // B2:B4 = [10, 20, 5]
    expect(await evaluateExpression(matrix, '=CONCATENATE(B2:B4)')).toBe('10205')
  })
})

describe('COUNTA', () => {
  it('counts every non-blank value in an all-text range', async () => {
    expect(await evaluateExpression(matrix, '=COUNTA(A2:A5)')).toBe(4)
  })

  it('counts numbers, text, and skips the blank in one mixed-type range', async () => {
    // A2:D2 = ['Widget', 10, 100, null] — three non-blank values of different types.
    expect(await evaluateExpression(matrix, '=COUNTA(A2:D2)')).toBe(3)
  })
})

describe('AND / OR / NOT', () => {
  it('AND is true only when every argument is true', async () => {
    expect(await evaluateExpression(matrix, '=AND(TRUE,TRUE)')).toBe(true)
    expect(await evaluateExpression(matrix, '=AND(TRUE,FALSE)')).toBe(false)
    expect(await evaluateExpression(matrix, '=AND(B2=10,C2=100)')).toBe(true)
  })

  it('OR is true when any argument is true', async () => {
    expect(await evaluateExpression(matrix, '=OR(FALSE,TRUE)')).toBe(true)
    expect(await evaluateExpression(matrix, '=OR(FALSE,FALSE)')).toBe(false)
  })

  it('NOT inverts a boolean', async () => {
    expect(await evaluateExpression(matrix, '=NOT(TRUE)')).toBe(false)
    expect(await evaluateExpression(matrix, '=NOT(1=2)')).toBe(true)
  })
})

describe('text functions', () => {
  it('LEN/TRIM/UPPER/LOWER', async () => {
    expect(await evaluateExpression(matrix, '=LEN("hello")')).toBe(5)
    expect(await evaluateExpression(matrix, '=TRIM("  hi  ")')).toBe('hi')
    expect(await evaluateExpression(matrix, '=UPPER("abc")')).toBe('ABC')
    expect(await evaluateExpression(matrix, '=LOWER("ABC")')).toBe('abc')
  })

  it('LEFT/RIGHT/MID extract substrings', async () => {
    expect(await evaluateExpression(matrix, '=LEFT("hello",2)')).toBe('he')
    expect(await evaluateExpression(matrix, '=RIGHT("hello",2)')).toBe('lo')
    expect(await evaluateExpression(matrix, '=MID("hello",2,3)')).toBe('ell')
  })

  it('FIND is case-sensitive; SEARCH is not', async () => {
    expect(await evaluateExpression(matrix, '=FIND("l","hello")')).toBe(3)
    await expectFormulaError(evaluateExpression(matrix, '=FIND("L","hello")'), 'VALUE')
    expect(await evaluateExpression(matrix, '=SEARCH("L","hello")')).toBe(3)
  })

  it('SUBSTITUTE and TEXTJOIN', async () => {
    expect(await evaluateExpression(matrix, '=SUBSTITUTE("hello world","o","0")')).toBe('hell0 w0rld')
    expect(await evaluateExpression(matrix, '=TEXTJOIN(",",TRUE,A2:A5)')).toBe('Widget,Gadget,Gizmo,Thing')
  })
})

describe('date functions', () => {
  it('DATE builds an Excel serial number; YEAR/MONTH/DAY/WEEKDAY read it back correctly', async () => {
    expect(await evaluateExpression(matrix, '=DATE(2024,1,15)')).toBe(45306)
    expect(await evaluateExpression(matrix, '=YEAR(DATE(2024,1,15))')).toBe(2024)
    expect(await evaluateExpression(matrix, '=MONTH(DATE(2024,1,15))')).toBe(1)
    expect(await evaluateExpression(matrix, '=DAY(DATE(2024,1,15))')).toBe(15)
    // Jan 15 2024 is a Monday -> weekday 2 under the default (Sunday=1) scheme.
    expect(await evaluateExpression(matrix, '=WEEKDAY(DATE(2024,1,15))')).toBe(2)
  })
})

describe('SWITCH, MEDIAN, LARGE, SMALL', () => {
  it('SWITCH picks the matching branch, falling back to a default', async () => {
    expect(await evaluateExpression(matrix, '=SWITCH(2,1,"one",2,"two","default")')).toBe('two')
    expect(await evaluateExpression(matrix, '=SWITCH(9,1,"one",2,"two","default")')).toBe('default')
  })

  it('MEDIAN/LARGE/SMALL compute real answers over a range', async () => {
    expect(await evaluateExpression(matrix, '=MEDIAN(B2:B5)')).toBe(12.5)
    expect(await evaluateExpression(matrix, '=LARGE(B2:B5,2)')).toBe(15)
    expect(await evaluateExpression(matrix, '=SMALL(B2:B5,2)')).toBe(10)
  })
})

describe('INDEX / MATCH', () => {
  it('INDEX returns the raw value at a 1-based position', async () => {
    expect(await evaluateExpression(matrix, '=INDEX(A2:A5,2)')).toBe('Gadget')
  })

  it('INDEX throws REF when the position is genuinely out of range', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=INDEX(A2:A5,5)'), 'REF')
  })

  it('MATCH returns the 1-based index of the first exact match, regardless of sort order', async () => {
    expect(await evaluateExpression(matrix, '=MATCH(20,B2:B5)')).toBe(2)
  })

  it('MATCH throws NA when there is no match', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=MATCH(999,B2:B5)'), 'NA')
  })

  it('INDEX/MATCH together find the name for the highest quantity — the real-world lookup pattern', async () => {
    // MAX(B2:B5) = 20 (Gadget's Qty); INDEX(A2:A5, MATCH(20, B2:B5)) => 'Gadget'
    expect(await evaluateExpression(matrix, '=INDEX(A2:A5,MATCH(MAX(B2:B5),B2:B5))')).toBe('Gadget')
  })
})

describe('VLOOKUP', () => {
  it('finds a value in another column of a small multi-column range (exact match)', async () => {
    expect(await evaluateExpression(matrix, '=VLOOKUP("Gadget",A2:C5,3,FALSE)')).toBe(200)
    expect(await evaluateExpression(matrix, '=VLOOKUP(20,B2:C5,2,FALSE)')).toBe(200)
  })

  it('throws NA when the lookup value is not found', async () => {
    await expectFormulaError(evaluateExpression(matrix, '=VLOOKUP("Nope",A2:C5,2,FALSE)'), 'NA')
  })
})

describe('HLOOKUP', () => {
  it('finds a value in another row of a small multi-row range (exact match)', async () => {
    const wide: Matrix = [
      ['Item', 'Widget', 'Gadget', 'Gizmo'],
      ['Qty', 10, 20, 5],
    ]
    expect(await evaluateExpression(wide, '=HLOOKUP("Gadget",A1:D2,2,FALSE)')).toBe(20)
  })
})

describe('IFS', () => {
  it('returns the value for the first true condition', async () => {
    expect(await evaluateExpression(matrix, '=IFS(1=2,"a",1=1,"b",TRUE,"c")')).toBe('b')
  })
})

describe('evaluateExpressions', () => {
  it('never throws and computes the exact spec example', async () => {
    const results = await evaluateExpressions(matrix, [
      { id: 'total-quantity', label: 'Total Quantity', expression: '=SUM(B2:B5)' },
      { id: 'total-price', label: 'Total Price', expression: '=SUM(B2:B5)*100' },
    ])

    expect(results).toEqual([
      { id: 'total-quantity', label: 'Total Quantity', value: 50 },
      { id: 'total-price', label: 'Total Price', value: 5000 },
    ])
  })

  it('isolates a bad expression so it does not blank the others', async () => {
    const results = await evaluateExpressions(matrix, [
      { id: 'good-1', label: 'Good 1', expression: '=SUM(B2:B5)' },
      { id: 'bad', label: 'Bad', expression: '=FOO(B2)' },
      { id: 'good-2', label: 'Good 2', expression: '=SUM(B2:B5)*2' },
    ])

    expect(results[0]).toEqual({ id: 'good-1', label: 'Good 1', value: 50 })
    expect(results[1].value).toBeNull()
    expect(results[1].error).toBe('#NAME?')
    expect(results[2]).toEqual({ id: 'good-2', label: 'Good 2', value: 100 })
  })

  it('maps each error code to its Excel-style string', async () => {
    const results = await evaluateExpressions(matrix, [
      { id: 'ref', label: 'ref', expression: '=B10' },
      { id: 'value', label: 'value', expression: '=A2+1' },
      { id: 'div0', label: 'div0', expression: '=10/0' },
      { id: 'name', label: 'name', expression: '=FOO(B2)' },
      { id: 'error', label: 'error', expression: '=SUM(B2:B5' },
      { id: 'na', label: 'na', expression: '=MATCH(999,B2:B5)' },
    ])

    expect(results.map((r) => r.error)).toEqual(['#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#ERROR!', '#N/A'])
    expect(results.every((r) => r.value === null)).toBe(true)
  })

  it('returns an empty array for an empty config', async () => {
    expect(await evaluateExpressions(matrix, [])).toEqual([])
  })

  it('a zero-row matrix produces #ERROR! for every entry instead of a confident-looking 0', async () => {
    const emptyMatrix: Matrix = []
    const results = await evaluateExpressions(emptyMatrix, [
      { id: 'total', label: 'Total', expression: '=SUM(A1:A5)' },
      { id: 'average', label: 'Average', expression: '=AVERAGE(A1:A5)' },
    ])
    expect(results).toEqual([
      { id: 'total', label: 'Total', value: null, error: '#ERROR!' },
      { id: 'average', label: 'Average', value: null, error: '#ERROR!' },
    ])
  })

  it('never throws even when individual entries are structurally malformed, not just when their expressions fail', async () => {
    // Exercises the `!entry || typeof entry.label !== 'string' || typeof entry.expression !== 'string' ||
    // typeof entry.id !== 'string'` guard directly: null/undefined entries, entries missing fields, and
    // wrong-typed fields must all degrade to an ERROR result for that slot without throwing or affecting
    // neighboring good entries.
    const config = [
      { id: 'good-1', label: 'Good 1', expression: '=SUM(B2:B5)' },
      null,
      undefined,
      {},
      { id: 'bad-label', label: 123, expression: '=SUM(B2:B2)' },
      { id: 'missing-expression', label: 'missing-expression' },
      { id: 'missing-label', expression: '=SUM(B2:B2)' },
      { id: 'good-2', label: 'Good 2', expression: '=SUM(B2:B5)*2' },
    ] as unknown as FormulaConfigEntry[]

    const results = await evaluateExpressions(matrix, config)

    expect(results).toHaveLength(8)
    expect(results[0]).toEqual({ id: 'good-1', label: 'Good 1', value: 50 })
    expect(results[7]).toEqual({ id: 'good-2', label: 'Good 2', value: 100 })
    // Every malformed slot in between resolved to a well-formed ERROR result, not a crash.
    for (const bad of [results[1], results[2], results[3], results[4], results[5], results[6]]) {
      expect(bad.value).toBeNull()
      expect(bad.error).toBe('#ERROR!')
    }
  })

  it('passes id through into the result on the success path', async () => {
    const results = await evaluateExpressions(matrix, [
      { id: 'qty-total', label: 'Total Quantity', expression: '=SUM(B2:B5)' },
    ])
    expect(results).toEqual([{ id: 'qty-total', label: 'Total Quantity', value: 50 }])
  })

  it('passes id through on the error/catch path', async () => {
    const results = await evaluateExpressions(matrix, [{ id: 'bad-formula', label: 'Bad', expression: '=FOO(B2)' }])
    expect(results).toEqual([{ id: 'bad-formula', label: 'Bad', value: null, error: '#NAME?' }])
  })

  it('rejects an entry missing id with the same #ERROR! result a missing label/expression produces today', async () => {
    const config = [{ label: 'No Id', expression: '=SUM(B2:B5)' }] as unknown as FormulaConfigEntry[]
    const results = await evaluateExpressions(matrix, config)
    expect(results).toEqual([{ id: '(unknown)', label: 'No Id', value: null, error: '#ERROR!' }])
  })

  it('falls back to "(unknown)" for a present but non-string id, on both the empty-matrix and catch paths', async () => {
    const config = [{ id: 1, label: 'Numeric Id', expression: '=SUM(B2:B5)' }] as unknown as FormulaConfigEntry[]

    const catchPathResults = await evaluateExpressions(matrix, config)
    expect(catchPathResults).toEqual([{ id: '(unknown)', label: 'Numeric Id', value: null, error: '#ERROR!' }])

    const emptyMatrixResults = await evaluateExpressions([] as Matrix, config)
    expect(emptyMatrixResults).toEqual([{ id: '(unknown)', label: 'Numeric Id', value: null, error: '#ERROR!' }])
  })
})

// Reads the real dev/sample-files/spreadsheet-sample.xlsx fixture (the same
// file dev/fixtures.ts's 'spreadsheet' fixture tells a developer to upload)
// and confirms the pre-existing, real-world x-evaluate config from that
// fixture still produces exactly the same 11 values it did before this
// library swap — the concrete, end-to-end proof that replacing the
// hand-rolled engine with fast-formula-parser + formulajs did not silently
// change any existing behavior.
describe('regression: the original 11 x-evaluate entries against the real sample file', () => {
  it('produces byte-identical values to the pre-rewrite hand-rolled engine', async () => {
    const buffer = readFileSync(path.resolve(__dirname, '../../../dev/sample-files/spreadsheet-sample.xlsx'))
    const { matrix: sampleMatrix } = parseWorkbookToMatrix(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    )

    const originalElevenExpressions = [
      '=SUM(I2:I6)',
      '=SUM(J2:J6)',
      '=AVERAGE(H2:H6)',
      '=MAX(H2:H6)',
      '=MIN(H2:H6)',
      '=COUNT(I2:I6)',
      '=SUM(J2:J6)/COUNT(J2:J6)',
      '=SUM(J2:J6)*1.05',
      '=MAX(H2:H6)-MIN(H2:H6)',
      '=SUM(I2:I6, MAX(I2:I6))',
      '=AVERAGE(I2:I4, I5:I6)',
    ]

    const results = await Promise.all(
      originalElevenExpressions.map((expression) => evaluateExpression(sampleMatrix, expression)),
    )

    expect(results).toEqual([27000, 7463400, 274.95, 310, 245, 5, 1492680, 7836570, 65, 35000, 5400])
  })
})
