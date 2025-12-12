export function calculateTotal(amount: string): number {
  if (!amount) return 0;

  return amount
    .split(/[\n,]+/)           // split on newlines OR commas
    .map(s => s.trim())        // remove whitespace
    .filter(s => s.length > 0) // ignore empty entries
    .map(amt => parseFloat(amt))               // convert to numbers
    .filter(n => !isNaN(n))    // ignore invalid numbers
    .reduce((sum, n) => sum + n, 0);
}