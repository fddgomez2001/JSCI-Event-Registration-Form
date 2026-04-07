/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid intermittent Windows filesystem cache rename issues in dev.
      config.cache = false;

      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          "**/node_modules/**",
          "C:/System Volume Information/**",
          "C:/hiberfil.sys",
          "C:/swapfile.sys",
          "C:/$RECYCLE.BIN/**",
        ],
      };
    }

    return config;
  },
};

export default nextConfig;
