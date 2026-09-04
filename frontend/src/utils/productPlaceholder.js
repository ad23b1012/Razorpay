/**
 * Product artwork, drawn locally as inline SVG.
 *
 * The catalog used to point at external photo URLs. Half of them were wrong (a
 * charging dock illustrated by two computer mice, a travel case by a paper bag)
 * and one was a dead link, and all of them made the storefront depend on a
 * third-party CDN being reachable — which is exactly the thing that fails on
 * venue wifi during a demo.
 *
 * These render from a data URI, so they always load, always match the product,
 * and stay visually consistent across the grid.
 */

const THEMES = {
  Smartphones: { from: "#EEF2FF", to: "#6366F1", ink: "#312E81", accent: "#FFFFFF" },
  Audio: { from: "#FEF3C7", to: "#F59E0B", ink: "#78350F", accent: "#FFFFFF" },
  Wearables: { from: "#DBEAFE", to: "#3B82F6", ink: "#1E3A8A", accent: "#FFFFFF" },
  Power: { from: "#D1FAE5", to: "#10B981", ink: "#065F46", accent: "#FFFFFF" },
  Accessories: { from: "#EDE9FE", to: "#8B5CF6", ink: "#4C1D95", accent: "#FFFFFF" },
  default: { from: "#E2E8F0", to: "#64748B", ink: "#0D121F", accent: "#FFFFFF" },
};

/** Simple, recognisable line art per category. Drawn on a 600x420 canvas. */
const ARTWORK = {
  Smartphones: (c) => `
    <rect x="236" y="96" width="128" height="228" rx="26" fill="${c}"/>
    <rect x="246" y="112" width="108" height="196" rx="18" fill="#FFFFFF" opacity="0.92"/>
    <circle cx="300" cy="122" r="5" fill="#0D121F" opacity="0.35"/>
    <rect x="282" y="296" width="36" height="4" rx="2" fill="#0D121F" opacity="0.3"/>`,

  Audio: (c) => `
    <path d="M190 235 v-35 a110 110 0 0 1 220 0 v35"
          fill="none" stroke="${c}" stroke-width="16" stroke-linecap="round"/>
    <rect x="160" y="228" width="56" height="92" rx="24" fill="${c}"/>
    <rect x="384" y="228" width="56" height="92" rx="24" fill="${c}"/>`,

  Wearables: (c) => `
    <rect x="246" y="112" width="108" height="46" rx="16" fill="${c}" opacity="0.75"/>
    <rect x="246" y="262" width="108" height="46" rx="16" fill="${c}" opacity="0.75"/>
    <rect x="234" y="146" width="132" height="128" rx="34" fill="${c}"/>
    <rect x="256" y="168" width="88" height="84" rx="22" fill="none" stroke="${c}" stroke-width="0"/>
    <circle cx="300" cy="210" r="30" fill="none" stroke="#0D121F" stroke-width="7" opacity="0.25"/>
    <rect x="366" y="188" width="14" height="34" rx="7" fill="${c}"/>`,

  Power: (c) => `
    <rect x="216" y="150" width="168" height="132" rx="30" fill="${c}"/>
    <rect x="286" y="96" width="14" height="58" rx="7" fill="${c}"/>
    <rect x="322" y="96" width="14" height="58" rx="7" fill="${c}"/>
    <path d="M306 186 l-30 44 h26 l-8 38 34 -50 h-26 z"
          fill="#0D121F" opacity="0.28"/>`,

  Accessories: (c) => `
    <rect x="176" y="150" width="248" height="150" rx="28" fill="${c}"/>
    <path d="M176 208 h248" stroke="#0D121F" stroke-width="7" opacity="0.2"/>
    <circle cx="300" cy="208" r="13" fill="#0D121F" opacity="0.25"/>
    <path d="M258 150 v-18 a42 42 0 0 1 84 0 v18"
          fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round"/>`,
};

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function productPlaceholder(name, category) {
  const theme = THEMES[category] || THEMES.default;
  const draw = ARTWORK[category] || ARTWORK.Accessories;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.from}"/>
      <stop offset="100%" stop-color="${theme.to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="420" fill="url(#bg)"/>
  <circle cx="300" cy="210" r="150" fill="#FFFFFF" opacity="0.18"/>
  ${draw(theme.accent)}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Falls back to local artwork the first time an image fails, clearing the
 * handler so a failing fallback can never loop.
 */
export function handleImageError(event, name, category) {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = productPlaceholder(name, category);
}
