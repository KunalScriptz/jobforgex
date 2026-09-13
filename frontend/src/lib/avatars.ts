// Curated "corporate professional" avatar presets + a deterministic initials fallback.
// All presets are inline SVG (no external assets/network calls).

export type AvatarPreset = {
  id: string;
  label: string;
  bg: string;
  fg: string;
  accent: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "navy", label: "Navy", bg: "#1e3a5f", fg: "#e8eef4", accent: "#c9a24b" },
  { id: "slate", label: "Slate", bg: "#334155", fg: "#e2e8f0", accent: "#38bdf8" },
  { id: "teal", label: "Teal", bg: "#0f4c4c", fg: "#e6f4f1", accent: "#2dd4bf" },
  { id: "maroon", label: "Maroon", bg: "#5c1f2e", fg: "#f4e7e9", accent: "#e0b0b8" },
  { id: "forest", label: "Forest", bg: "#1f4d2c", fg: "#e6f0e8", accent: "#8fd19e" },
  { id: "plum", label: "Plum", bg: "#3d2657", fg: "#ede6f4", accent: "#c4a3e0" },
  { id: "charcoal", label: "Charcoal", bg: "#2a2a2e", fg: "#ececee", accent: "#d4af37" },
  { id: "burgundy", label: "Burgundy", bg: "#4a1c2c", fg: "#f2e6ea", accent: "#e6b8c4" },
];

export function getAvatarPreset(id: string | null | undefined): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}

// A simple, consistent "professional bust" silhouette: head + shoulders + necktie,
// recolored per preset so it reads as a distinct set rather than one clip-art icon repeated.
export function presetAvatarSvg(preset: AvatarPreset): string {
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect width="64" height="64" fill="${preset.bg}" />
      <circle cx="32" cy="24" r="12" fill="${preset.fg}" />
      <path d="M10 58c0-13 9.8-22 22-22s22 9 22 22z" fill="${preset.fg}" />
      <path d="M32 36l-4 6 4 4 4-4-4-6z" fill="${preset.accent}" />
    </svg>
  `.trim();
}

const INITIALS_PALETTE = ["#1e3a5f", "#334155", "#0f4c4c", "#5c1f2e", "#1f4d2c", "#3d2657", "#2a2a2e", "#4a1c2c"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getInitials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  if (trimmed.includes("@")) return trimmed[0]!.toUpperCase();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function getInitialsAvatar(nameOrEmail: string): { initials: string; bg: string } {
  const key = nameOrEmail.trim() || "?";
  const bg = INITIALS_PALETTE[hashString(key) % INITIALS_PALETTE.length]!;
  return { initials: getInitials(key), bg };
}
