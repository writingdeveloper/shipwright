# @repo/ui — Claude Code rules

shadcn/ui (new-york style, zinc base) + Tailwind v4. The shared design system.

- Add a component: `pnpm gen react-component --args <name>`, or `npx shadcn@latest add <name> -c packages/ui`. You own the source — extend it in place.
- Import from the package: `@repo/ui/components/ui/<name>`, `@repo/ui/lib/utils` (`cn`). An app imports `@repo/ui/globals.css` once and adds `@source "../../../packages/ui/src/**/*.{ts,tsx}"` so Tailwind scans these components.
- **Build from theme tokens** (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`) — not ad-hoc hex. Keep radius/spacing consistent; Lucide icons at `h-4 w-4`.
- Radix primitives come from the unified `radix-ui` package, not `@radix-ui/react-*`.
