// Shared brand tokens for email templates. Kept intentionally bolder/more
// saturated than the base `accent`/`brand` Tailwind scale used in the app UI
// (tooling/tailwind/web.ts) — emails render on white backgrounds across many
// clients with inconsistent color management, so a stronger red/navy holds
// up better than the softer in-app tones.
export const BRAND_RED = "#d32636"; // accent-600
export const BRAND_NAVY = "#141d3b"; // brand-900
export const BODY_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
