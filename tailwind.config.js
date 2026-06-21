/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // GreenPages brand palette: 2AA16C / 2A5746 / FFB221 / ECE1D6 / E76544
        leaf: {
          50: '#ECE1D6',
          100: '#dff1e9',
          200: '#bfe3d3',
          400: '#5fb891',
          500: '#2AA16C',
          600: '#2AA16C',
          700: '#2a7c59',
          800: '#2A5746',
          900: '#2A5746',
        },
        bark: {
          700: '#3f3f29',
          900: '#1f2417',
        },
        cream: '#ECE1D6',
        amber: {
          100: '#fff3de',
          300: '#ffc964',
          400: '#FFB221',
          500: '#FFB221',
          800: '#8c6212',
        },
        rose: {
          100: '#fcede9',
          300: '#f2aa98',
          500: '#E76544',
          600: '#E76544',
          800: '#8b3d29',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
