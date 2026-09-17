/* node --experimental-strip-types scripts/phone-check.ts
   Fails if a phone field starts accepting what is not a number, or if filtering
   as you type breaks the local formats normalizePhone accepts. */
import assert from "node:assert/strict";
import { normalizePhone, typedPhone } from "../src/lib/phones.ts";

// Nothing but a + and digits survives being typed.
for (const [raw, want] of [
  ["Jordan", ""],
  ["+1 (209) 555-1212", "+12095551212"],
  ["09o17", "+0917"],
  ["", ""],
  ["+", ""],
] as const) {
  assert.equal(typedPhone(raw), want, `typedPhone(${JSON.stringify(raw)})`);
}

// The local shorthands still reach normalizePhone through the forced +, which
// is the whole reason the filter can prefix one without asking.
for (const [raw, want] of [
  ["09171234567", "+639171234567"],
  ["2095551212", "+12095551212"],
  ["639171234567", "+639171234567"],
  ["+1 209 555 1212", "+12095551212"],
] as const) {
  assert.equal(normalizePhone(typedPhone(raw)), want, `normalizePhone(typedPhone(${raw}))`);
}

console.log("phones ok");
