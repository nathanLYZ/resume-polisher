import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这几个库在服务端按需动态 import（PDF / Word 解析），交给 Node 直接 require
  // @napi-rs/canvas 必须保持 external：pdf-parse 靠它给 Node 补 DOMMatrix 等全局，打包后会 polyfill 失败
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "mammoth"],
};

export default nextConfig;
