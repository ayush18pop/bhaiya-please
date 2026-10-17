const { hairlineWidth } = require('nativewind/theme');

/**
 * Auto Meter Brutalism (BhaiyaPlease-DesignSystem/tokens). Theme-aware colours are RGB triplet
 * CSS variables (global.css) so Sunlight mode can swap them; brand colours are fixed.
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // theme-aware (dark by default, paper in Sunlight mode)
        bg: v('bg'),
        fg: v('fg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        muted: v('muted'),
        edge: v('edge'),
        // fixed brand colours
        ink: '#141412',
        paper: '#F5F2EC',
        yellow: '#FFB400',
        cng: '#1F9D55',
        go: '#3DBE74',
        mirchi: '#FF6F61',
        water: '#1C2A2E',
      },
      // Families are applied by components/bp/Text (one family per weight); these keep the classes valid.
      fontFamily: { display: ['ArchivoBlack_400Regular'], meter: ['DSEG7'], hindi: ['Modak_400Regular'] },
      fontSize: {
        'display-xl': ['44px', { lineHeight: '44px' }],
        display: ['32px', { lineHeight: '34px' }],
        title: ['24px', { lineHeight: '28px' }],
        heading: ['19px', { lineHeight: '24px' }],
        body: ['16px', { lineHeight: '23px' }],
        label: ['14px', { lineHeight: '18px' }],
        caption: ['13px', { lineHeight: '17px' }],
        'meter-xl': ['56px', { lineHeight: '56px' }],
        meter: ['28px', { lineHeight: '28px' }],
      },
      borderWidth: { DEFAULT: '2px', 3: '3px', hairline: hairlineWidth() },
      borderRadius: { block: '12px', plate: '4px', sheet: '18px', pill: '999px' },
      spacing: { tap: '48px', 'tap-runner': '56px', 'runner-cta': '64px' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
