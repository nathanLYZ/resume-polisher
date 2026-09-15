/**
 * URL 安全守卫 —— 服务端抓取前的 SSRF 基线防护
 *
 * 拦截:非 http(s)、带凭证的 URL、私网/环回/链路本地地址、内网域名后缀。
 * 说明:这是主机名层面的基线拦截;DNS rebinding 级别的防护需要出网代理,
 * 对单用户工具属于过度设计,此处明确取舍。
 */

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[::1\]$/,
  /^\[fc|^fd/i, // IPv6 unique local (fc00::/7)
];

const PRIVATE_SUFFIXES = [".local", ".internal", ".lan", ".home.arpa"];

export function guardUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("链接格式不正确");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接");
  }
  if (url.username || url.password) {
    throw new Error("不支持携带凭证的链接");
  }

  const host = url.hostname;
  if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error("不允许访问内网地址");
  }
  const lower = host.toLowerCase();
  if (PRIVATE_SUFFIXES.some((s) => lower.endsWith(s))) {
    throw new Error("不允许访问内网地址");
  }

  return url;
}
