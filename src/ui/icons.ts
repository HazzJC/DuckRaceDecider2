/** Small inline SVG icon set (replaces emoji in the HUD). All use currentColor. */
const svg = (body: string, vb = "0 0 24 24") =>
  `<svg class="ico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON = {
  ice: svg(`<path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>`),
  fire: svg(`<path d="M12 22c4 0 7-2.7 7-6.8 0-4.6-4.4-6.6-4-12.2-3 1.6-5.4 4.6-5.4 7.6-1.3-.8-2-2.2-2-3.6C5.6 9 5 11.4 5 13.6 5 18.6 8 22 12 22Z"/><path d="M12 22c-1.8 0-3-1.3-3-3.1 0-2 2-3 2.6-5.4 1.5 1 3.4 2.8 3.4 5.2 0 2-1.2 3.3-3 3.3Z" fill="currentColor" stroke="none" opacity=".55"/>`),
  shield: svg(`<path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`),
  boost: svg(`<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" stroke="none"/>`),
  stumble: svg(`<path d="M5 12a7 7 0 1 0 7-7"/><path d="M12 5V2M12 5l-3 2"/>`),
  bread: svg(`<path d="M4 15c0-5 3.6-9 8-9s8 4 8 9c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3Z"/><path d="M9 9.5 8 12M12.5 8.5 11.5 12M16 9.5l-1 2.5"/>`),
  anchor: svg(`<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M4.5 14.5C5 18.5 8.3 21 12 21s7-2.5 7.5-6.5"/>`),
  portal: svg(`<ellipse cx="12" cy="12" rx="5.5" ry="9"/><path d="M12 6.5c1.8 1.4 2.7 3.3 2.7 5.5s-.9 4.1-2.7 5.5"/>`),
  sword: svg(`<path d="M14.5 3.5H20.5v6L10 20l-4-4L16.5 5.5"/><path d="m4 14 6 6M3 21l3-3"/>`),
  tower: svg(`<path d="M7 22V10l-2-3V3h3v2h2.5V3h3v2H16V3h3v4l-2 3v12"/><path d="M5 22h14M10.5 22v-4h3v4"/>`),
  dragon: svg(`<path d="M3 17c3-1 4-4 4-7 2 1 3 3 3 5 1-3 3-5 6-6-1 2-1 4 0 6 1-2 3-3 5-3-2 3-3 7-8 7H8c-2 0-4-1-5-2Z"/><circle cx="15.5" cy="13" r=".8" fill="currentColor"/>`),
  goose: svg(`<path d="M7 20c-2.5 0-4-1.8-4-4 0-3 3-5 7-5 1 0 2-.6 2-1.8V6.5C12 4.6 13.3 3 15.2 3c1.4 0 2.3.9 2.8 2l3 .8-3 1.4V12c0 4.6-3.6 8-8 8H7Z"/><circle cx="15.6" cy="5.4" r=".8" fill="currentColor"/>`),
  crown: svg(`<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/>`),
  jungle: svg(`<path d="M12 22V11M12 11c-4 0-7-3-7-7 4 0 7 3 7 7ZM12 14c3.5 0 6-2.5 6-6-3.5 0-6 2.5-6 6Z"/>`),
  comeback: svg(`<path d="M4 18 10 12l4 4 6-8"/><path d="M15 8h5v5"/>`),
  cheer: svg(`<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>`),
  flag: svg(`<path d="M5 22V3M5 4h12l-2 4 2 4H5"/>`),
  sound: svg(`<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12"/>`),
  mute: svg(`<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 5 6M22 9l-5 6"/>`),
  gear: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`),
  pause: svg(`<path d="M8 5v14M16 5v14"/>`),
  play: svg(`<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>`),
  dice: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>`),
  swap: svg(`<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>`),
  copy: svg(`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`),
  share: svg(`<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>`),
  replay: svg(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/>`),
  skip: svg(`<path d="m5 5 9 7-9 7V5ZM18 5v14"/>`),
  speed: svg(`<path d="M12 14l4-6"/><path d="M4 18a9 9 0 1 1 16 0"/>`),
  chat: svg(`<path d="M4 5h16v11H9l-5 4V5Z"/>`),
};

export type IconName = keyof typeof ICON;
