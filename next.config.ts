import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这两个库在服务端按需动态 import（PDF / Word 解析），交给 Node 直接 require
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
