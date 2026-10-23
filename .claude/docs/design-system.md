# Design system

Reference: a dark, neon "HUMAN NEXT" hero: huge wide display type split in two colours, wide-tracked captions,
an outlined circle button with an arrow, and a bright subject on the right. Here the subject is the **real bill**.

## Tokens (`frontend/src/styles/tokens.css`)
| Token | Value | Use |
| --- | --- | --- |
| `--ink-ground` | `#0A0A0A` | page ground (primary) |
| `--blue` | `#007BA7` | primary: display type, selected chips |
| `--blue-bright` | `#3DB4E0` | lighter tint of the primary for small text/outlines (contrast on dark) |
| `--pink` | `#FF2D95` | mix primary: the price, the action, favourites |
| `--surface`, `--surface-2`, `--surface-3` | tone steps | surfaces (no shadows, tone steps only) |

Type: **Unbounded** (display, 700) + **Manrope** (text), both self-hosted via `@fontsource`.

## Rules (from the design-taste-frontend skill, with user-approved exceptions)
- Colour goes on data: the price is pink, the discount green, everything else neutral.
- KPIs are type, not tiles. No icon-in-circle cards, no fake dashboards, no emoji (use SVG).
- Flat surfaces, no shadows at rest. Honest empty and zero states.
- **Exceptions the reference requires, allowed in the inspector:** wide-tracked uppercase captions (`micro-label`),
  neon text glow (`text-shadow`), glow on the ring button (`button-fx`), hero-sized h1 (`app-title-size`).
- Gate: `node .claude/skills/design-taste-frontend/scripts/inspect.mjs <url> --app --allow micro-label,text-shadow,button-fx,app-title-size --out .claude/skills/design-taste-frontend/.taste-skill/inspect`
  must report 0 FAIL at 1440, 768 and 390px. Screenshots land in `.claude/skills/design-taste-frontend/.taste-skill/inspect/`.

## Brand and motion
- **Logo**: `components/brand/Logo3D.jsx` is a CSS-3D rotating rupee coin (stacked discs, cerulean at the back to pink at the front) with an
  orbiting ring; `LogoMark.jsx` is the flat SVG mark for the top bar and `public/favicon.svg`.
- **Login** lives at `/login` (client-side route in `hooks/usePath.js`; FastAPI serves the app for any non-`/api` path). Logged-out visitors are sent there, logged-in ones never see it. It is a local profile (name + 10-digit mobile), stored in SQLite via `/api/v1/profile`. The number is not OTP-verified; Zomato and
  Swiggy keep their own OTP logins. The profile menu in the top bar can change the number or log out.
- **Motion** (`styles/motion.css`, `hooks/useInView|useCountUp|useMagnetic`, `components/motion/`): scroll reveal, count-up numbers, hunt radar,
  receipt print-in, deal-arrival flash, cursor spotlight, magnetic run button, deals ticker. Transform and opacity only; all of it is switched
  off under `prefers-reduced-motion`. Use flat colour (no gradient fills): the inspector fails them.

## Insight features
- **Deal of the hour** (`components/hero/DealOfHour.jsx`): cheapest deal seen in the last hour plus a countdown to the next meal (12:30 lunch, 19:30 dinner).
  The countdown is a reminder only: the platforms don't publish price-drop times.
- **Cheapest times** (`components/insights/HeatCalendar.jsx`) and **Hunt replay** (`ReplayPanel.jsx`): read `/deals/heatmap` and `/hunts/{id}/replay`.
- **Share as image** (`lib/shareCard.js`): draws a 1080x1350 PNG on a canvas in the theme; uses the share sheet where available, else downloads.
- **Chime** (`lib/chime.js`): Web Audio two-note sound + vibration when a new deal is at or under the user's price. Settings live in Options and `localStorage`.
- **This week** and **Compare dishes** (`components/insights/WeekSummary.jsx`, `CompareDishes.jsx`) read `/insights/weekly` and `/deals/compare`.
  `/#insights-compare` (also `-week`, `-heat`, `-replay`) opens a given Insights tab.

## Popups
- `components/ui/Modal.jsx`: one dialog for everything (`variant="drawer"` slides in from the right, `"center"` pops in). Solid dark scrim,
  Esc or scrim click closes, Tab stays inside, focus returns to the opener. Hunt options is a drawer; Change number and Log out are centred dialogs.
- `components/ui/Toasts.jsx` + `hooks/useToasts.js`: self-dismissing popups for new deals, price alerts, model switches, errors and hunt end.
- `/#options` opens the options drawer directly.
- Options groups: Where to hunt, What to look for (search terms are removable chips with suggestions), **Unlocking offers** (0 to 3 extra items the
  agent may add to reach an offer's minimum order; sent as `extra_items` and written into the prompt), Limits, Sound.

## Genie effect and meal alarm
- `Modal` opens and closes with a genie effect: the panel funnels out of the button that was pressed and sucks back into it
  (`.genie-in` / `.genie-out` in `styles/modal.css`; origin from the last clicked button, funnel side from where that button sits).
  CSS cannot do the real mesh warp of macOS, so this is a scale plus a wedge-shaped `clip-path`. Reduced motion turns it off.
- **Meal alarm** (`hooks/useAlarms.js`, `components/alarm/`): breakfast, lunch and dinner alarms with their own times, saved in `localStorage`.
  When one rings: chime, toast, a browser notification if allowed, and a dialog with Hunt now / Snooze 10 min / Dismiss.
  It only rings while the app is open in a tab. The "Deal of the hour" strip counts down to the next alarm.

## The show (effects layer)
`styles/effects.css` holds every glow and motion graphic, layered over the clean layout: two-colour glowing headline with letters rising in,
pointer-following light, the turning 3D coin in the hero, the ring button (leans toward the pointer, radar pulses while hunting),
the receipt printing in, the deals ticker, row lift and new-deal flash, the big alarm clock. They need these inspector exemptions:
`--allow micro-label,text-shadow,button-fx,app-title-size,mixed-font-headline`. All of it stops under `prefers-reduced-motion`.
