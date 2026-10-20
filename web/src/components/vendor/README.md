# Vendored third-party components

Each file here is the **official source** of a component, copied from the library's documented distribution channel and then
changed as little as possible. The header of every file lists its source URL, licence and exact modifications; a pristine
copy plus SHA-256 of each official file is kept in `_originals/` (see `MANIFEST.json`), and `src/test/provenance.test.ts`
re-verifies checksums, headers, usage in the app, and a per-file budget on how many lines may differ from the official file.

| Library | Official component | Official source | Local file | Used by | Changed lines vs official |
|---|---|---|---|---|---|
| Magic UI | Theme Toggler (`animated-theme-toggler`) | https://magicui.design/r/animated-theme-toggler.json | `magicui/animated-theme-toggler.tsx` | `ThemeMenu.tsx` → header | 0 (byte-identical); registry CSS added to `index.css` |
| Aceternity UI | Stateful Button | https://ui.aceternity.com/registry/stateful-button.json | `aceternity/stateful-button.tsx` | `pages/Syllabus.tsx` "Save syllabus" | 38 (tokens, reduced motion, failure handling) |
| Originkit | Arrow Reveal Button | https://www.originkit.dev/components/arrow-reveal-button (React/Next.js source on the component page) | `originkit/arrow-reveal-button.tsx` | `LogSessionCta.tsx` → Overview header | 19 (onClick, visible label, soft shadow, no icon travel, strict typing) |
| Magic UI | Dot Pattern | https://magicui.design/r/dot-pattern.json | `magicui/dot-pattern.tsx` | `layout/AppBackground.tsx` (all pages) | 0 (byte-identical) |
| Aceternity UI | Spotlight | https://ui.aceternity.com/registry/spotlight.json | `aceternity/spotlight.tsx` | `layout/AppBackground.tsx` (all pages) | 2 (unused React import removed) |
| React Bits | Beams (WebGL2 background) | https://reactbits.dev/backgrounds/beams (raw source: github.com/DavidHDev/react-bits, `src/content/Backgrounds/Beams/`) | `reactbits/Beams.jsx` + `Beams.css` (+ our `Beams.d.ts` types) | `pages/Login.tsx` (full-viewport background) | 1 (cleanup only releases the WebGL context when the canvas has left the DOM, so React StrictMode's re-run of effects works); CSS byte-identical. Licence: MIT + Commons Clause |

## Removed in the product-design pass
Magic UI Number Ticker, Magic UI Blur Fade and React Bits SpotlightCard were removed from the app (and from `_originals/` and the provenance
registry): count-up numbers, a pointer-following glow on the metric tiles and per-element blur-fades were decorative and cost frames while
scrolling. React Bits is used again for exactly one component: Beams on the login page (see the table). Nothing here claims otherwise.

## Honest notes
- **Not used on purpose:** React Bits `FadeContent` (needs gsap + ScrollTrigger), Aceternity `Card Spotlight` (needs three.js / @react-three/fiber and a WebGL canvas), and the Originkit CLI (`npx originkit add …` needs an Originkit account — the source was taken from the public component page instead).
- **Custom approximations (not library code):** `ui/motion.tsx` `Reveal` (CSS stagger — inspired by the idea behind React Bits FadeContent, not that component), `ui/Menu.tsx` (accessible dropdown), the `Input`/`Select`/`Field` styling in `ui/forms.tsx`. The previous report called these "Origin UI" adaptations; that was wrong — no Origin UI code is used. (originui.com now redirects to coss.com/ui; Originkit at originkit.dev is a different project.)
- **Licences:** Magic UI MIT; React Bits MIT + Commons Clause (use inside an application is allowed, selling the components themselves is not); Aceternity UI "Aceternity License" (end products allowed, re-distributing the item's source files is not — if this repository is ever published, review that file); Originkit licence (own projects free; no redistribution as a template/starter kit).
- **Dependencies added for these components:** `motion` (animation engine used by Magic UI / Aceternity / Originkit — one library), `clsx` + `tailwind-merge` (the `cn` helper those registries import via `@/lib/utils`). The `@` alias maps to `web/src`.
