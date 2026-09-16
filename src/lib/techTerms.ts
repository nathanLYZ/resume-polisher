/**
 * 技术名词词库(小写)—— 中英夹杂检查的豁免白名单 + ATS 模拟的关键词词库
 * 与 JD/原文中出现过的词动态合并后使用
 */
export const TECH_TERMS: ReadonlySet<string> = new Set([
  // 编程语言/技术栈
  "java", "python", "javascript", "typescript", "go", "golang", "rust", "php", "c++", "c#", "c",
  "sql", "nosql", "mysql", "postgresql", "oracle", "mongodb", "redis", "elasticsearch", "es",
  "html", "css", "scss", "vue", "react", "angular", "next.js", "nuxt", "node", "nodejs", "node.js", "deno",
  "spring", "springboot", "django", "flask", "fastapi", "gin", "grpc", "graphql",
  "k8s", "kubernetes", "docker", "containerd", "jenkins", "gitlab", "github", "git", "svn",
  "linux", "unix", "shell", "bash", "python3", "scala", "kotlin", "swift", "objective-c",
  "hadoop", "spark", "flink", "hive", "hbase", "kafka", "rabbitmq", "rocketmq", "zookeeper",
  "aws", "azure", "gcp", "aliyun", "oss", "ecs", "cdn", "dns", "vpc", "s3", "ec2",
  "api", "apis", "rest", "restful", "http", "https", "tcp", "udp", "ip", "websocket", "oauth",
  "ci", "cd", "cicd", "devops", "sre", "it", "saas", "paas", "iaas",
  "ai", "ml", "dl", "nlp", "cv", "llm", "gpt", "aigc", "rag", "agent", "prompt",
  "excel", "word", "powerpoint", "ppt", "office", "visio", "jira", "confluence", "figma",
  "pytest", "junit", "selenium", "jmeter", "postman", "charles", "fiddler",
  "4g", "5g", "lte", "nb-iot", "ims", "sip", "voip", "pbx",
  "ios", "android", "harmonyos", "windows", "macos", "centos", "ubuntu",
  "es6", "express", "koa", "webpack", "vite", "axios", "vue.js", "react.js", "nest.js",
  // 商务惯用缩写
  "hr", "jd", "cv", "ceo", "cto", "coo", "vp", "okr", "kpi", "roi", "bp", "pr", "gr",
  "app", "web", "h5", "ui", "ue", "ux", "logo", "bug", "demo", "case", "review",
  "dau", "mau", "pv", "uv", "gmv", "sku", "crm", "erp", "oa", "bi", "etl", "ab",
  "iso", "sap",
]);
