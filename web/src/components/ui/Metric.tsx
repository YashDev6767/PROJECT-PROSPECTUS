import { NumberTicker } from "../vendor/magicui/number-ticker";
import { prefersReducedMotion } from "./motion";

/**
 * A dashboard number. With motion allowed it uses Magic UI's Number Ticker (spring count-up, starts when scrolled into view);
 * with prefers-reduced-motion it is plain text. The final value is always exact.
 */
export function Metric({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  if (prefersReducedMotion()) return <span className="tabular-nums">{prefix}{value.toFixed(decimals)}{suffix}</span>;
  return <>{prefix}<NumberTicker value={value} decimalPlaces={decimals} />{suffix}</>;
}
