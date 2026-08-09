import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // 后端已迁移到 FastAPI（默认 http://localhost:8001），这里把 /api 反向代理过去。
  // 前端代码无需改动，依旧使用相对路径 /api/...
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
