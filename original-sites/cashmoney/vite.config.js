import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Static hosts normally use /. Set VITE_BASE_PATH only when a host serves
  // the site below a subpath.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
