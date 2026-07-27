/** Ridiculous 2004-flavoured identity generation. Deterministic given an RNG. */

const GUEST_ADJECTIVES = [
  'Chrome',
  'Turbo',
  'Wet',
  'Neon',
  'Glossy',
  'Frosted',
  'Vice',
  'Plastic',
  'Sunburnt',
  'Deluxe',
  'Bootleg',
  'Premium',
  'Aqua',
  'Toxic',
  'Inflatable',
];

const GUEST_NOUNS = [
  'Dog',
  'Dolphin',
  'Router',
  'Yacht',
  'Cousin',
  'Flamingo',
  'Landlord',
  'Nephew',
  'Blazer',
  'Jetski',
  'Realtor',
  'Iguana',
  'Bassline',
  'Sandal',
  'Valet',
];

export const BOT_NAMES = [
  'xX_DARKMOM_Xx',
  'MountainDewDad',
  'DVD_MENU',
  'FinalBoss2004',
  'LAN_PARTY_GIRL',
  'ChromeUncle',
  'WetRouter',
  'VHS_PRINCE',
] as const;

const CREW_FIRST = [
  'NEON',
  'WET',
  'CHROME',
  'TURBO',
  'VICE',
  'AQUA',
  'GLOSS',
  'PLASTIC',
  'SUNSET',
  'BOOTLEG',
];

const CREW_SECOND = [
  'RAT',
  'DVD',
  'MOM',
  'TAN',
  'YACHT',
  'CASH',
  'NANNY',
  'PALMS',
  'JUICE',
  'VALET',
];

const pick = <T>(list: readonly T[], rng: () => number): T =>
  list[Math.floor(rng() * list.length) % list.length];

export function generateGuestName(rng: () => number = Math.random): string {
  const number = 10 + Math.floor(rng() * 89);
  return `${pick(GUEST_ADJECTIVES, rng)}${pick(GUEST_NOUNS, rng)}_${number}`;
}

export function generateGuestId(rng: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(rng() * 36).toString(36);
  return `g_${id}`;
}

/** Short, memorable, pronounceable-ish: NEON-RAT, WET-DVD, CHROME-MOM. */
export function generateCrewCode(rng: () => number = Math.random): string {
  return `${pick(CREW_FIRST, rng)}-${pick(CREW_SECOND, rng)}`;
}

export function generateToken(rng: () => number = Math.random): string {
  let token = '';
  for (let i = 0; i < 24; i++) token += Math.floor(rng() * 36).toString(36);
  return token;
}

export const FAKE_SPONSORS = [
  'SLIMEWIRE',
  'VOLT JUICE',
  'AQUA CASH',
  'NEON NANNY',
  'PLASTIC PALMS',
  'TURBO TAN',
] as const;

export const ANNOUNCER_CALLOUTS = {
  bigSplat: 'BIG SPLAT',
  cleanCover: 'CLEAN COVER',
  lastTen: 'LAST TEN',
  totalRepaint: 'TOTAL REPAINT',
  cooked: 'VICE ESTATE IS COOKED',
} as const;
