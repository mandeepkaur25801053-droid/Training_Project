/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: 'var(--bg-main)',
          card: 'var(--bg-card)',
          cardSubtle: 'var(--bg-card-subtle)',
          blue: 'var(--primary-blue)',
          text: 'var(--text-main)',
          textMuted: 'var(--text-secondary)',
          border: 'var(--border-subtle)',
          violet: '#8B6CF6',
          mint: '#DFF5EF',
        },
        navy: {
          950: 'var(--bg-main)',
          900: 'var(--bg-card)',
          850: 'var(--bg-card)',
          800: 'var(--bg-card-subtle)',
          750: 'var(--bg-hover)',
          700: 'var(--border-subtle)',
          600: 'var(--border-subtle)',
        },
        electric: {
          cyan: 'var(--primary-blue)',
          blue: 'var(--primary-blue)',
          indigo: 'var(--primary-blue)',
          purple: '#8B6CF6',
          fuchsia: '#8B6CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-blue': '0 10px 30px -6px rgba(52, 120, 246, 0.22)',
        'glow-purple': '0 10px 30px -6px rgba(139, 108, 246, 0.22)',
        'glow-cyan': '0 8px 24px -4px rgba(52, 120, 246, 0.18)',
        'glass-card': 'var(--shadow-card)',
        'soft-card': 'var(--shadow-card)',
        'soft-hover': 'var(--shadow-hover)',
      },
      animation: {
        'float-slow': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 4s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.03)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(circle at 50% 25%, rgba(52, 120, 246, 0.12) 0%, rgba(139, 108, 246, 0.08) 40%, transparent 75%)',
      },
    },
  },
  plugins: [],
};
