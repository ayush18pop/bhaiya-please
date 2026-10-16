import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom scale so `text-eta` isn't mistaken for a colour.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'title', 'eta'] }],
      shadow: [{ shadow: ['card', 'lift', 'float', 'sheet', 'cta'] }],
      rounded: [{ rounded: ['card', 'sheet'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
