/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Make sure this covers all files where you use Tailwind classes
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
