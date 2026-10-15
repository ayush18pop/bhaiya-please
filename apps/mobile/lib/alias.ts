import type { Address } from '@bhaiya-please/core';

const COLOURS = [
  'Saffron', 'Turmeric', 'Cardamom', 'Cumin', 'Clove', 'Pepper', 'Mango', 'Lotus',
  'Jasmine', 'Indigo', 'Coral', 'Amber', 'Jade', 'Maroon', 'Ivory', 'Copper',
  'Teal', 'Ruby', 'Marigold', 'Mint', 'Cinnamon', 'Ginger', 'Tamarind', 'Neem',
  'Peacock', 'Chilli', 'Sandal', 'Rose', 'Basil', 'Honey', 'Ember', 'Pearl',
];
const ANIMALS = [
  'Tiger', 'Elephant', 'Peacock', 'Parrot', 'Monkey', 'Lion', 'Camel', 'Otter',
  'Falcon', 'Deer', 'Fox', 'Panda', 'Heron', 'Mynah', 'Gecko', 'Koel',
  'Langur', 'Bison', 'Cobra', 'Sparrow', 'Dolphin', 'Crane', 'Rhino', 'Lynx',
  'Pigeon', 'Owl', 'Mongoose', 'Hare', 'Turtle', 'Yak', 'Ibis', 'Jackal',
];

/** Deterministic friendly alias from an address: "Saffron Tiger". */
export function aliasFor(address?: string | null): string {
  if (!address) return 'Unknown';
  const hex = address.replace(/^0x/i, '').padEnd(12, '0');
  const a = parseInt(hex.slice(0, 4), 16);
  const b = parseInt(hex.slice(4, 8), 16);
  return `${COLOURS[a % COLOURS.length]} ${ANIMALS[b % ANIMALS.length]}`;
}

export function shortAddr(address?: Address | string | null): string {
  if (!address) return '0x…';
  return `${address.slice(0, 4)}…${address.slice(-2)}`;
}

export function initials(alias: string) {
  return alias
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** Stable hue for avatar tint. */
export function hueFor(address?: string | null) {
  const hex = (address ?? '0').replace(/^0x/i, '').padEnd(8, '0');
  return parseInt(hex.slice(8, 12) || hex.slice(0, 4), 16) % 360;
}
