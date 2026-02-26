/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'luxury-bg': '#0f0c29',
        'luxury-card': '#24243e',
        'luxury-border': '#302b63',
        'gold': '#ffd700',
        'gold-hover': '#b8860b',
        'gold-light': '#ffe066',
        'text-main': '#ffffff',
        'text-muted': '#b3b3b3',
        'neon-pink': '#ff00cc',
        'neon-blue': '#3333ff',
        'neon-cyan': '#00f2ff',
        'primary': '#ff00cc',
        'primary-hover': '#d600ab',
        'secondary': '#00f2ff',
        'secondary-hover': '#00c4cf',
        'casino-bg': '#0f0c29',
        'casino-bg-light': '#302b63',
        'casino-purple': '#24243e',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        luxury: ['Cinzel', 'serif'],
        barber: ['Bebas Neue', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 15px #ffd700, 0 0 30px #ffd700',
        'glow-pink': '0 0 15px #ff00cc, 0 0 30px #ff00cc',
        'glow-blue': '0 0 15px #3333ff, 0 0 30px #3333ff',
        'glow-cyan': '0 0 15px #00f2ff, 0 0 30px #00f2ff',
        'card-hover': '0 10px 40px -10px rgba(0, 0, 0, 0.7)',
        'card-pop': '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-gold': 'pulseGold 2s infinite',
        shimmer: 'shimmer 1.4s infinite linear',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 0, 204, 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(255, 0, 204, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'luxury-gradient': 'linear-gradient(to right bottom, #0f0c29, #302b63, #24243e)',
        'gold-gradient': 'linear-gradient(to bottom, #ffd700, #b8860b, #ffd700)',
        'neon-gradient': 'linear-gradient(90deg, #ff00cc, #3333ff)',
        'casino-gradient': 'linear-gradient(to right bottom, #0f0c29, #302b63, #24243e)',
        'medal-gold': 'linear-gradient(135deg, #FFD700 0%, #FDB931 50%, #FFD700 100%)',
        'medal-silver': 'linear-gradient(135deg, #E0E0E0 0%, #BDBDBD 50%, #E0E0E0 100%)',
        'medal-bronze': 'linear-gradient(135deg, #CD7F32 0%, #A0522D 50%, #CD7F32 100%)',
      },
    },
  },
  plugins: [],
}
