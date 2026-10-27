/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./js/**/*.js",
        "./**/*.html"
    ],
    theme: {
        extend: {
            fontFamily: {
                'inter': ['Inter', 'sans-serif'],
            },
            colors: {
                'primary': {
                    50: '#f0f4ff',
                    100: '#e0e9ff',
                    200: '#c7d6fe',
                    300: '#a5b8fc',
                    400: '#8291f8',
                    500: '#6366f1',
                    600: '#4f46e5',
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                }
            },
            animation: {
                'bounce-slow': 'bounce 2s infinite',
                'pulse-slow': 'pulse 3s infinite',
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
