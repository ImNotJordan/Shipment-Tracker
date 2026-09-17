import type { CSSProperties } from "react";
import { groundImage, type BoardGround } from "./logo-palette";
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND } from "./types";

/** A company's colours as board variables.
 *  The stylesheet maps --brand-accent onto --amber, darkening it for day mode
 *  so a pale brand stays readable; --brand only tints the scheme, and stays a
 *  plain colour because a dozen rules feed it through color-mix(). */
export function brandVars(company?: {
  accent?: string | null;
  background?: string | null;
  ground?: BoardGround | null;
} | null): CSSProperties {
  const ground = company?.ground ?? null;
  return {
    ["--brand-accent" as string]: company?.accent || DEFAULT_ACCENT,
    ["--brand" as string]: company?.background || DEFAULT_BACKGROUND,
    ["--brand-ground" as string]: groundImage(ground),
    // A measured ground IS the page wash. Leaving the head glow on as well
    // stacks two washes and the top of the page turns into a solid band.
    ...(ground ? { ["--head-glow" as string]: "0%" } : null),
  };
}
