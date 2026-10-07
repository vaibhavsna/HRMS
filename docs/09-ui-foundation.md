# UI Foundation (S0-9)

Status: **proposed, waiting for the owner's approval** (issue #10). No feature screen is built until this is approved. To see it, run `npm run dev -w frontend`: the temporary page at `frontend/src/features/foundation-preview/` shows the tokens, the app shell, the form pattern and every table state, with a light/dark switch.

Rules for everyone who writes a screen: use only the tokens and components described here (docs/12 section 9). If something is missing, add it to the foundation first, in its own PR.

## 1. Decisions

| Area | Choice | Notes |
|---|---|---|
| Styling | Tailwind CSS 4 (`tailwindcss`, `@tailwindcss/vite`) | Tokens are CSS variables mapped to utilities in `src/index.css` |
| Components | shadcn/ui, Radix base, style `radix-vega` | Source is copied into `src/components/ui/` and owned by us; edit freely, lint still applies |
| Behaviour | `radix-ui` | Accessible dialogs, menus and so on, used by the shadcn components |
| Icons | `lucide-react` | shadcn's default. Ionicons is not needed |
| Font | Inter Variable via `@fontsource-variable/inter` | Self-hosted in the bundle: no CDN, no external request |
| Theme | Light and dark | `dark` class on `<html>`; choice saved in `localStorage` (`hrms-theme`), default is the OS setting, applied before first paint |
| Class names | `cn` package, `class-variance-authority` | `cn` is shadcn's compiled replacement for `clsx` + `tailwind-merge` |

Frontend dependencies added: `radix-ui ^1.7`, `class-variance-authority ^0.7`, `cn ^0.4`, `lucide-react ^1.52`, `tw-animate-css ^1.4`, `shadcn ^4.21` (provides `shadcn/tailwind.css`), `@fontsource-variable/inter ^5.3`; dev: `tailwindcss ^4.3`, `@tailwindcss/vite ^4.3`. Not added yet: `react-hook-form` and `zod` (they arrive with the first real form) and `sonner` (first toast).

## 2. Library policy

shadcn first. A library from the original Horilla app is allowed only where shadcn has nothing equivalent, and only from npm. **Never copy files out of Horilla's repository** (vendored folders, its custom scripts): this project is a clean-room rebuild.

| Need | Horilla uses | Here |
|---|---|---|
| Icons | Ionicons | `lucide-react`. No Ionicons |
| Popups and confirmations | SweetAlert2 | shadcn `AlertDialog` and `Dialog`; toasts with `sonner` (shadcn's toast) when first needed |
| Guided tour | Driver.js | Nothing in shadcn. Decided in Sprint 5 ticket S5-8 (#58); if a tour ships, Driver.js from npm is acceptable |
| Rich text | Summernote (needs jQuery) | Not needed in Phase 1. If it is, prefer a React-native editor and ask first |
| Pivot tables | PivotTable.js (jQuery) | Phase 2 reports; decide then |
| Org chart | custom script | Not reused. S2-5 builds it from `manager_id` |

Every new package is announced with why, size and maintenance status before it is installed.

## 3. Tokens

Source of truth: `frontend/src/styles/tokens.css` (colours, radius, shell sizes). No raw colours, spacing or fonts in a screen.

**Colour roles.** `background`/`foreground` page; `card`, `popover` raised surfaces; `muted` quiet areas and secondary text; `primary` the brand teal for the main action and links; `secondary`, `accent` supporting fills; `destructive`, `success`, `warning`, `info` status; `border` decorative lines; `input` the visible border of form controls; `ring` keyboard focus; `sidebar-*` the shell; `chart-1..5` Phase 2 reports.

**Contrast is enforced by a test** (`src/styles/tokens.test.ts`): every text pair is at least 4.5:1 and input borders and focus rings at least 3:1, in both themes, so changing a colour cannot silently make something unreadable. Selected results:

| Pair | Light | Dark |
|---|---|---|
| text on page | 17.3 | 17.0 |
| muted text on page | 6.5 | 7.7 |
| text on primary button | 6.5 | 8.2 |
| primary used as link text | 6.4 | 8.7 |
| status text on its 12% tint (lowest of the four) | 4.8 | 5.3 |
| input border on page (needs 3) | 3.5 | 4.9 |
| focus ring on page (needs 3) | 4.2 | 7.5 |

Input borders are deliberately darker than shadcn's default pale ones so a text field is visible to everyone.

**Status colours** always come with written text, never colour alone:

| Meaning | Badge | Used for |
|---|---|---|
| good, done | `success` | leave `approved`, employee `active` |
| waiting, attention | `warning` | leave `pending`, employee `on_leave` |
| bad, blocked | `destructive` | leave `rejected` |
| ended, neutral | `secondary` | leave `cancelled`, employee `terminated` |
| informational | `info` | notices |

**Type.** Inter Variable; weights 400 body, 500 labels, 600 headings; `tabular-nums` for numbers in tables; text blocks no wider than `max-w-prose`.

| Role | Size / line (px) | Class |
|---|---|---|
| Page title | 30 / 36 | `text-3xl font-semibold` |
| Section heading | 24 / 32 | `text-2xl font-semibold` |
| Card title | 20 / 28 | `text-xl font-semibold` |
| Lead text | 18 / 28 | `text-lg` |
| Body and form fields | 16 / 24 | `text-base` |
| Dense UI, table cells | 14 / 20 | `text-sm` |
| Captions, hints, badges | 12 / 16 | `text-xs` |

**Spacing and shape.** Tailwind's 4 px scale. Page gutter 16 px below 640 px, 24 px above; 40 px between page sections, 16 px inside one. Radius base 0.5 rem (`--radius`). Controls are 1 px bordered with almost no shadow. Focus is a 3 px ring plus a ring-coloured border. **Motion** is decoration only and is switched off by `prefers-reduced-motion` globally.

## 4. App shell

```
Desktop (768 px and up)                          Phone (below 768 px)
+-----------+-------------------------------+    +-------------------------------+
| HRMS      | [Page title]        [User]    |    | [Menu]  Page title     [User] |
| ----------|-------------------------------|    |-------------------------------|
| Dashboard |                               |    |                               |
| Employees |   Content                     |    |   Content                     |
| Leave     |                               |    |                               |
| ...       |                               |    |   Menu opens an off-canvas    |
+-----------+-------------------------------+    |   sheet over the content      |
 sidebar 15 rem, top bar 3.5 rem                 +-------------------------------+
```

- The sidebar shows the links the signed-in user may use. Each link names the permission it needs; the list comes from `/auth/me`, so navigation follows **permissions, not role names**. Hiding a link is a convenience: the API still enforces every permission and scopes data in the service layer.
- The current page link has `aria-current="page"`. On phones the menu is a sheet with a focus trap that closes on navigation or Esc. Both are built in S2-3.

| Link | Needs permission | Typically seen by |
|---|---|---|
| Dashboard | none | everyone |
| Employees | `employee:read` | manager, HR, admin |
| Departments | `department:read` | everyone |
| Job positions | `job_position:read` | everyone |
| My leave | `leave_request:create` | everyone |
| Approvals | `leave_request:approve` | manager, HR, admin |
| Leave types | `leave_type:update` | HR, admin |
| Users | `user:read` | admin |
| Roles | `role:read` | admin |

The preview page lets you switch between four sample roles to see this. It uses sample data only.

## 5. Shared patterns

**Data table.** Every state renders something; the table never goes blank. `aria-busy` is set while loading and a polite status line says what is happening.

| State | What the user sees |
|---|---|
| Ready | Rows; status as a badge with text |
| First load | Skeleton rows |
| Refetch (filter or page change) | Previous rows stay, dimmed, with a slim progress bar |
| Empty, no data yet | Message and the primary action ("Add employee") |
| Empty, filter has no results | Different message and "Clear filters" |
| Error | Destructive alert with what happened, filters kept, "Try again" |

Tables scroll sideways inside their own box on phones; the page itself never does.

**Form.** `FormField` (`src/components/form-field.tsx`) is the one way to lay out a control: visible label, optional hint, optional error. It wires `aria-describedby`, `aria-invalid` and `aria-required`; the error is announced (`role="alert"`) and shown under the field. Server field errors from the error envelope go in the `error` prop. The submit button shows a spinner and disables the form while saving. Required fields are marked and explained ("* Required field"). Validation reuses the backend Zod rules where practical.

**Planned shared components** (Sprint 5, not built here; they will use these tokens): route loading indicator (#51), async select with loading/error/empty states (#52), table filters and URL state (#53), `TruncatedText` with tooltip (#54), auto-growing textarea (#55), responsive checks (#56), allowed status transitions (#57), tour copy rules (#58).

## 6. Accessibility and responsive rules

These extend docs/12 section 9.

- Designed for **320 px** wide and up. Measured on the preview at 320, 360, 400, 768 and 1024 px: no sideways page scroll. (docs/12 still says about 400 px; S5-6 (#56) will update it.)
- Touch targets are at least 44 px on touch screens (`pointer-coarse:min-h-11`, built into Button and Input).
- Everything works with the keyboard, focus is always visible, every control has a visible label, and nothing is conveyed by colour alone.
- Text and focus contrast are at least WCAG AA, checked by test. Animation respects `prefers-reduced-motion`.

## 7. Where things live

```
frontend/src/
  components/ui/   shadcn primitives (generated, owned by us)
  components/      shared pieces built from them (form-field, theme-toggle)
  features/<name>/ screens of one module; features/foundation-preview/ is temporary, delete in S2-3
  hooks/  lib/     shared hooks and helpers (use-theme, theme, utils)
  styles/          tokens.css
```

Add a component with `npx shadcn@latest add <name>` from `frontend/`, review the diff, run Prettier, and open a PR. A new npm package needs approval first.

## 8. For the owner to approve

- The palette (calm teal, neutral surfaces) and the dark theme.
- The shell and which links each permission shows.
- Inter as the font; shadcn first with the fallbacks in section 2.
- 320 px as the minimum width.

Merging the S0-9 pull request is the approval. After it, S2-0 and S2-3 can start.
