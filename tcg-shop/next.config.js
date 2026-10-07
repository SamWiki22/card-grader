/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Set NEXT_PUBLIC_BASE_PATH (e.g. "/shop") to serve the shop under a path of an existing site,
  // e.g. illestcollect.com/shop, via a rewrite on the main site. Leave empty for a subdomain/own domain.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
};

export default nextConfig;
