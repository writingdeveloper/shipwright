# @repo/ui — Claude Code rules

shadcn/ui (new-york style, zinc base) + Tailwind v4. The shared design system.

- Add a component: `npx shadcn@latest add <name> -c packages/ui -b radix`. **The `-b radix` flag is not optional** — shadcn switched its default primitive library to Base UI in July 2026, and `components.json` has no field to pin it, so a bare `add` will pull Base UI components into this Radix-based system (they have no `asChild`/Slot, so they will not compose with `button.tsx`/`card.tsx`). After adding, `grep -r "@base-ui" packages/ui` must return nothing. You own the source — extend it in place.
- Import from the package: `@repo/ui/components/ui/<name>`, `@repo/ui/lib/utils` (`cn`). An app imports `@repo/ui/globals.css` once and adds `@source "../../../packages/ui/src/**/*.{ts,tsx}"` so Tailwind scans these components.
- **Build from theme tokens** (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`) — not ad-hoc hex. Keep radius/spacing consistent; Lucide icons at `h-4 w-4`.
- Radix primitives come from the unified `radix-ui` package, not `@radix-ui/react-*`. This is what the registry emits for Tailwind v4 projects (the `new-york-v4` style), so `shadcn add … -b radix` already produces the right import — do not hand-migrate it.
