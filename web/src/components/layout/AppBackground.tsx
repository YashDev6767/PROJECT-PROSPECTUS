import { Spotlight } from "../vendor/aceternity/spotlight";
import { DotPattern } from "../vendor/magicui/dot-pattern";

/**
 * The application's atmosphere, painted once behind every route (fixed, full viewport, never inside a page):
 *   1. .app-bg (index.css): the base colour plus four large, soft indigo / violet / sky light pools and a faint grain,
 *      with their own light and dark values;
 *   2. Aceternity UI Spotlight: a single beam of light that settles in from the top-left once per page load;
 *   3. Magic UI Dot Pattern: a fine dot texture, masked so it fades out toward the middle of the page.
 * Cards are translucent (.surface), so this layer stays visible in the gutters and faintly through the panels.
 */
export function AppBackground() {
  return (
    <div aria-hidden className="app-bg">
      <Spotlight className="-top-40 left-0 opacity-0 md:-top-24 md:left-72 [&_ellipse]:[fill-opacity:0.38]" fill="var(--accent)" />
      <div className="absolute inset-x-0 top-0 h-[70vh] [mask-image:radial-gradient(75%_100%_at_50%_0%,black,transparent_85%)]">
        <DotPattern width={26} height={26} cr={1.1} className="text-[color:var(--bg-dots)]" />
      </div>
    </div>
  );
}
