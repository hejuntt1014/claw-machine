/** Gen-2 accent themes: white body + one bright accent, matching 2024–26 commercial cabinets. */
export type ThemeId = 'pink' | 'yellow' | 'cyan';
export interface Theme {
  id: ThemeId; name: string; accent: number; accentHex: string; accentSoft: number;
  led: number; ledHex: string; dark: number; title: string;
}
export const THEMES: Theme[] = [
  { id: 'pink', name: '粉', accent: 0xf47aa8, accentHex: '#f47aa8', accentSoft: 0xffd6e6, led: 0xff8eb8, ledHex: '#ff8eb8', dark: 0xc44a78, title: '粉' },
  { id: 'yellow', name: '黄', accent: 0xf5c52a, accentHex: '#f5c52a', accentSoft: 0xfff0a8, led: 0xffd84a, ledHex: '#ffd84a', dark: 0xc48a10, title: '黄' },
  { id: 'cyan', name: '青', accent: 0x3ec8d8, accentHex: '#3ec8d8', accentSoft: 0xb8f0f6, led: 0x5ee0ee, ledHex: '#5ee0ee', dark: 0x1a8a98, title: '青' },
];
export const BRAND = { cn: '爪爪乐', en: 'PAW PLAY', tag: 'HAPPY GAMES' };
