const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/**
 * The English cardinal for a row number: One, Twenty-One. These are title case
 * because they sit in a name ("Attachment One"). 100 and above stay digits.
 * The words are English only: a compound such as Twenty-One does not translate
 * by looking each piece up, and other languages do not build the phrase the
 * same way.
 */
export function spellNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n >= 100) return String(n)
  if (n < 20) return ONES[n]
  const ten = Math.floor(n / 10)
  const one = n % 10
  return one === 0 ? TENS[ten] : `${TENS[ten]}-${ONES[one]}`
}
