/** @type {import('next').NextConfig} */

// Same routing/output settings as Lingsaa_Accounts (trailing slashes, standalone build),
// so PMS links behave the same after the merge.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
]

const nextConfig = {
  output: 'standalone',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets a production build be checked into another folder while `npm run dev` is using .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    optimizePackageImports: ['lucide-react', '@mui/icons-material']
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  }
}

module.exports = nextConfig
