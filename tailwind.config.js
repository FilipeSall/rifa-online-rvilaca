/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'casino-bg': '#0f0c29',
        'casino-bg-light': '#302b63',
        'casino-purple': '#24243e',
        'neon-pink': '#ff00cc',
        'neon-blue': '#3333ff',
        'neon-cyan': '#00f2ff',
        'gold': '#ffd700',
        'gold-light': '#ffe066',
        'primary': '#ff00cc',
        'primary-hover': '#d600ab',
        'secondary': '#00f2ff',
        'secondary-hover': '#00c4cf',
        'text-main': '#ffffff',
        'text-muted': '#b3b3b3',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        casino: ['Orbitron', 'sans-serif'],
      },
      boxShadow: {
        'glow-pink': '0 0 15px #ff00cc, 0 0 30px #ff00cc',
        'glow-blue': '0 0 15px #3333ff, 0 0 30px #3333ff',
        'glow-cyan': '0 0 15px #00f2ff, 0 0 30px #00f2ff',
        'glow-gold': '0 0 15px #ffd700, 0 0 30px #ffd700',
        'card-pop': '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        flash: 'flash 1.5s infinite',
        'bounce-slow': 'bounce 3s infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-up': 'slideInUp 0.5s ease-out forwards',
        'spin-slow': 'spin 8s linear infinite',
        shimmer: 'shimmer 2.5s infinite linear',
      },
      keyframes: {
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        slideInUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'casino-gradient': 'linear-gradient(to right bottom, #0f0c29, #302b63, #24243e)',
        'gold-gradient': 'linear-gradient(to bottom, #ffd700, #b8860b, #ffd700)',
        'neon-gradient': 'linear-gradient(90deg, #ff00cc, #3333ff)',
        'slot-bar': 'repeating-linear-gradient(45deg, #222, #222 10px, #333 10px, #333 20px)',
      },
    },
  },
  plugins: [],
}
