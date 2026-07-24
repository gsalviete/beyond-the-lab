/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#022D57',
        body: '#345372',
        muted: '#6B7C93',
        brand: {
          light: '#FF7EA1',
          DEFAULT: '#F75883',
          deep: '#FF487A',
          line: '#FF5986',      // borda do card (Figma)
        },
        cobalt: '#114883',
        rose: {
          50: '#FFF5F8',
          100: '#FFE8EF',
          200: '#FFD3E0',
          300: '#FFBCD0',
        },
      },
      fontFamily: {
        display: ['Geist', 'system-ui', 'sans-serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 20px 45px -25px rgba(2, 45, 87, 0.18)',
        soft: '0 12px 30px -18px rgba(2, 45, 87, 0.15)',
        pill: '0 14px 30px -12px rgba(247, 88, 131, 0.45)',
        badge: '0 18px 40px -18px rgba(2, 45, 87, 0.45)',
      },
      backgroundImage: {
        // gradiente oficial do Figma
        'badge-grad': 'linear-gradient(87deg, #115CA4 0.82%, #102449 130.57%)',
        'brand-grad': 'linear-gradient(85deg, #F75883 1.14%, #FF7EA1 53.3%, #FF487A 102.41%)',
        'brand-card': 'linear-gradient(160deg, #FF9FBB 0%, #FB6C97 55%, #F0477C 100%)',
        'rose-grad': 'linear-gradient(160deg, #FFE3EC 0%, #FFCFDE 45%, #FFC0D4 100%)',
        'cta-grad': 'linear-gradient(135deg, #FFEBF1 0%, #FFD6E2 48%, #FFC3D6 100%)',
        'price-grad': 'linear-gradient(172deg, #FFF7FA 0%, #FFD9E5 26%, #FC7BA4 58%, #F35684 100%)',
      },
    },
  },
  plugins: [],
}