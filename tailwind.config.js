/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'luxury-bg': '#0A0A0A',
        'luxury-card': '#141414',
        'luxury-border': '#262626',
        'gold': '#F5A800',
        'gold-hover': '#D48F00',
        'gold-light': '#FFCC4D',
        'text-main': '#ffffff',
        'text-muted': '#a3a3a3',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        luxury: ['Cinzel', 'serif'],
        barber: ['Bebas Neue', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(245, 168, 0, 0.3), 0 0 40px rgba(245, 168, 0, 0.1)',
        'card-hover': '0 10px 40px -10px rgba(0, 0, 0, 0.7)',
      },
      animation: {
        'pulse-gold': 'pulseGold 2s infinite',
        shimmer: 'shimmer 1.4s infinite linear',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(245, 168, 0, 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(245, 168, 0, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'luxury-gradient': 'linear-gradient(to right bottom, #0A0A0A, #111111, #050505)',
        'gold-gradient': 'linear-gradient(135deg, #F5A800 0%, #FFCC4D 50%, #F5A800 100%)',
        'medal-gold': 'linear-gradient(135deg, #FFD700 0%, #FDB931 50%, #FFD700 100%)',
        'medal-silver': 'linear-gradient(135deg, #E0E0E0 0%, #BDBDBD 50%, #E0E0E0 100%)',
        'medal-bronze': 'linear-gradient(135deg, #CD7F32 0%, #A0522D 50%, #CD7F32 100%)',
      },
    },
  },
  plugins: [],
}
