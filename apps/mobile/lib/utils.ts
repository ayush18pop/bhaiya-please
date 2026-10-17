import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the design-system scale so `text-title` isn't mistaken for a colour.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display-xl', 'display', 'title', 'heading', 'body', 'label', 'caption', 'meter-xl', 'meter'] }],
      'font-family': [{ font: ['display', 'meter', 'hindi'] }],
      rounded: [{ rounded: ['block', 'plate', 'sheet', 'pill'] }],
      'text-color': [{ text: ['bg', 'fg', 'surface', 'raised', 'line', 'muted', 'edge', 'ink', 'paper', 'yellow', 'cng', 'go', 'mirchi'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Brand colours as raw values (for SVG, maps, native props that can't take classes). */
export const C = {
  ink: '#141412',
  surface: '#1E1E1B',
  raised: '#292925',
  line: '#3A3A35',
  paper: '#F5F2EC',
  muted: '#B5B1A8',
  yellow: '#FFB400',
  cng: '#1F9D55',
  go: '#3DBE74',
  mirchi: '#FF6F61',
  white: '#FFFFFF',
  water: '#1C2A2E',
  minorRoad: '#2A2A26',
} as const;

/** Mela lights: festive bulbs in yellow, coral, green, paper on black (web CSS). */
export const LIGHTS_CSS =
  'radial-gradient(circle at 7px 7px, #FFB400 3.5px, transparent 4px) 0 0 / 28px 28px, radial-gradient(circle at 21px 7px, #FF6F61 3.5px, transparent 4px) 0 0 / 28px 28px, radial-gradient(circle at 7px 21px, #3DBE74 3.5px, transparent 4px) 0 0 / 28px 28px, radial-gradient(circle at 21px 21px, #F5F2EC 3.5px, transparent 4px) 0 0 / 28px 28px, #141412';
