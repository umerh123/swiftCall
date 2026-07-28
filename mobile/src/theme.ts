// Ported from the web console's actual design tokens (webapp/assets/app.css)
// so the app doesn't feel like a different product.
export const colors = {
  void: '#08080D',
  bg: '#0A0A11',
  panel: '#0D0E15',
  raised: '#15161F',
  high: '#1D1F2B',
  input: '#0F1018',

  line: '#212330',
  lineSoft: '#191A24',
  lineHot: '#2B2E3D',

  text: '#EDEEF4',
  textMuted: '#9CA0B4',
  textFaint: '#686C82',
  textGhost: '#4A4D60',

  accent: '#2563EB',
  accent2: '#1D4ED8',
  accentDark: '#1E40AF',
  accentWash: 'rgba(37, 99, 235, .12)',

  success: '#16A34A',
  warn: '#D97706',
  danger: '#DC2626',
  dangerWash: 'rgba(220, 38, 38, .10)',

  bubbleIn: '#191B26',
  bubbleOut: '#1D4ED8',

  // Aliases kept for screens that haven't been visually reworked yet.
  card: '#15161F',
  border: '#212330',
};

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 3,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 8,
  },
};

/** Deterministic accent color per contact, same idea as the web app's avatars. */
const AVATAR_HUES = ['#2563EB', '#7C3AED', '#0891B2', '#C026D3', '#DB2777', '#059669', '#D97706', '#DC2626'];
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
