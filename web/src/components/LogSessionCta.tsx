import { useNavigate } from "react-router-dom";
import { useTokenColors } from "../lib/useTokenColors";
import ArrowRevealButton from "./vendor/originkit/arrow-reveal-button";

const tokens = ["accent", "accent-solid", "accent-soft", "accent-soft-fg", "on-accent"] as const;

/**
 * The page's single primary call to action, built on Originkit's Arrow Reveal Button: an emerald badge sweeps across the
 * pill on hover and the label turns white. Colours are resolved from the active theme's tokens.
 */
export function LogSessionCta() {
  const navigate = useNavigate();
  const c = useTokenColors(tokens);
  return (
    <ArrowRevealButton
      label="Log a session"
      onClick={() => navigate("/session-logs")}
      colors={{ fill: c["accent-soft"], textColor: c["accent-soft-fg"], hoverTextColor: c["on-accent"] }}
      font={{ fontSize: 14, fontWeight: 600, lineHeight: "1.2em", letterSpacing: "0em" }}
      padding="5px 18px 5px 5px"
      gap={10}
      rounded={36}
      border={{ borderColor: c.accent, borderStyle: "solid", borderWidth: 1 }}
      icon={{ type: "icon", icon: "arrow", side: "left", size: 16, padding: 8, background: c["accent-solid"], color: c["on-accent"], rounded: 100, restAngle: 0, hoverAngle: 315 }}
      transition={{ type: "tween", ease: [0.44, 0, 0.56, 1], duration: 0.4 }}
      newTab={false}
      style={{ minHeight: 44 }}
    />
  );
}
