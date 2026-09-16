/* FedEx numbers are entered in groups of four so they can be read and checked
   against a label. Only the raw digits are ever held in state or submitted —
   the grouping exists on screen and nowhere else. */

export const TRACKING_DIGITS = 12;
const GROUP = 4;
/* Kept as a literal so the escapes are unambiguous. If it and GROUP ever
   disagree, the caret assertions in the check catch it. */
const GROUPER = /(\d{4})(?=\d)/g;

/** Everything that is not a digit, dropped; anything past the cap, cut. */
export function trackingDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, TRACKING_DIGITS);
}

export function groupTracking(digits: string) {
  return digits.replace(GROUPER, "$1 ");
}

/** Where the caret belongs in the grouped text once `count` digits precede it.
    Without this, reformatting on each keystroke throws the caret to the end
    and editing the middle of a number becomes impossible. */
export function caretAfter(count: number) {
  if (count <= 0) return 0;
  return count + Math.floor((count - 1) / GROUP);
}
