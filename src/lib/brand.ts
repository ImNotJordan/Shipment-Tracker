import type { CSSProperties } from "react";
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND } from "./types";

/** A company's colours as board variables.
 *  The stylesheet maps --brand-accent onto --amber, darkening it for day mode
 *  so a pale brand stays readable; --brand only tints the scheme. */
export function brandVars(company?: {
  accent?: string | null;
  background?: string | null;
} | null): CSSProperties {
  return {
    ["--brand-accent" as string]: company?.accent || DEFAULT_ACCENT,
    ["--brand" as string]: company?.background || DEFAULT_BACKGROUND,
  };
}
