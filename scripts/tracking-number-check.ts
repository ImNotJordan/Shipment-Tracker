/* node --experimental-strip-types scripts/tracking-number-check.ts
   Fails if grouped entry stops round-tripping to the raw number, or if the
   caret math drifts out of step with the spacing. */
import assert from "node:assert/strict";
import {
  TRACKING_DIGITS,
  caretAfter,
  groupTracking,
  trackingDigits,
} from "../src/lib/tracking-number.ts";

// What is typed is not what is stored.
assert.equal(trackingDigits("8771 1477 9998"), "877114779998");
assert.equal(trackingDigits("abc877-114/779.998xyz"), "877114779998");
assert.equal(trackingDigits(""), "");
assert.equal(trackingDigits("9".repeat(40)).length, TRACKING_DIGITS, "caps at the limit");

// Grouping is display only, and never leaves a trailing separator.
assert.equal(groupTracking("877114779998"), "8771 1477 9998");
assert.equal(groupTracking("8771"), "8771", "a full group gets no trailing space");
assert.equal(groupTracking("87711"), "8771 1");
assert.equal(groupTracking(""), "");

// The submitted value must read as one number whatever the spacing looked like.
for (let n = 0; n <= TRACKING_DIGITS; n += 1) {
  const digits = "123456789012".slice(0, n);
  assert.equal(
    trackingDigits(groupTracking(digits)),
    digits,
    `round-trip failed at ${n} digits`,
  );
}

// The caret lands after the nth digit in the grouped string.
for (let n = 0; n <= TRACKING_DIGITS; n += 1) {
  const digits = "123456789012".slice(0, n);
  const grouped = groupTracking(digits);
  const pos = caretAfter(n);
  assert.equal(
    grouped.slice(0, pos).replace(/\D/g, "").length,
    n,
    `caret at ${n} digits sits over the wrong character`,
  );
  assert.ok(grouped[pos - 1] !== " ", `caret at ${n} digits landed behind a space`);
}
assert.equal(caretAfter(0), 0);
assert.equal(caretAfter(TRACKING_DIGITS), groupTracking("877114779998").length);

console.log("tracking number entry ok");
