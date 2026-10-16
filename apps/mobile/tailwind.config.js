const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))', ink: 'hsl(var(--primary-ink))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '20px',
        sheet: '28px',
      },
      // Radius scale: cards 20, sheets 28, chips/pills full. `lg` stays the control radius (12).
      // (extend merges into the lg/md/sm above)
      boxShadow: {
        // Single-layer shadows so NativeWind maps them to RN shadow* props on Android too.
        card: '0 2px 12px rgba(26, 29, 36, 0.07)',
        lift: '0 6px 20px rgba(26, 29, 36, 0.12)',
        float: '0 8px 28px rgba(26, 29, 36, 0.18)',
        sheet: '0 -6px 28px rgba(26, 29, 36, 0.20)',
        cta: '0 4px 14px rgba(226, 89, 27, 0.35)',
      },
      fontSize: {
        display: ['34px', { lineHeight: '40px', letterSpacing: '-0.8px' }],
        title: ['22px', { lineHeight: '28px', letterSpacing: '-0.3px' }],
        eta: ['32px', { lineHeight: '36px', letterSpacing: '-0.6px' }],
      },
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
