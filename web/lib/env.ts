function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Environment variable ${name} is not set`);
  return v;
}

export const env = {
  appUrl: req("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  authSecret: req("AUTH_SECRET", "dev-secret-change-me-in-production"),
  sessionDays: Number(req("SESSION_DAYS", "90")),
  allowedDomains: req("ALLOWED_EMAIL_DOMAINS", "effective-soft.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  hrEmails: (process.env.HR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  timezone: req("ROUND_TIMEZONE", "Europe/Minsk"),
  /** Temporarily opens the HR area to everyone. Debug only; remove before production. */
  openHR: (process.env.DEBUG_OPEN_HR ?? "").toLowerCase() === "true",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? "587"),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "Bingo <bingo@example.com>",
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
    localDir: process.env.STORAGE_LOCAL_DIR ?? "./.uploads",
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
  },
};

export function isAllowedEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return Boolean(domain) && env.allowedDomains.includes(domain);
}
