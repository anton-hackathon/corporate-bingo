import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { env, isAllowedEmail } from "./env";
import { prisma } from "./prisma";

const SESSION_COOKIE = "bingo_session";
const HR_MODE_COOKIE = "bingo_hr_mode";
const LOGIN_TTL_MIN = 15;
const MAX_TOKENS_PER_15MIN = 5;

export function hashToken(raw: string): string {
  return createHmac("sha256", env.authSecret).update(raw).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export class AuthError extends Error {}

/**
 * Thrown when no link will be sent, for any reason. The caller reports the
 * same thing it reports on success, so nothing is leaked.
 */
export class NotSent extends Error {}

/**
 * Creates a single-use sign-in link. Only a corporate address is accepted,
 * and only for someone HR has added to the employee list.
 */
export async function createLoginLink(emailRaw: string): Promise<{ url: string; user: { email: string; name: string } }> {
  const email = emailRaw.trim().toLowerCase();

  // Deliberately uniform: a different answer for "wrong domain", "not an
  // employee" and "here is your link" lets anyone enumerate the staff list
  // from the public login page.
  const user = isAllowedEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !user.active) throw new NotSent();

  const since = new Date(Date.now() - 15 * 60_000);
  const recent = await prisma.loginToken.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (recent >= MAX_TOKENS_PER_15MIN) throw new NotSent();

  const raw = newToken();
  await prisma.loginToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId: user.id,
      expiresAt: new Date(Date.now() + LOGIN_TTL_MIN * 60_000),
    },
  });

  return { url: `${env.appUrl}/auth/callback?token=${raw}`, user: { email: user.email, name: user.name } };
}

export async function consumeLoginToken(raw: string): Promise<string> {
  const tokenHash = hashToken(raw);
  // A single conditional update, so two requests carrying the same link cannot
  // both pass the check and both get a session.
  const claimed = await prisma.loginToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new AuthError("This link has expired or has already been used");

  const token = await prisma.loginToken.findUniqueOrThrow({ where: { tokenHash } });
  return token.userId;
}

/** A long session: otherwise every visit from a phone means another email. */
export async function createSession(userId: string): Promise<void> {
  const raw = newToken();
  const expiresAt = new Date(Date.now() + env.sessionDays * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(raw), userId, expiresAt } });

  // Secure is decided by the address the request actually arrived on, not by
  // APP_URL. The app answers on two: the public HTTPS name and, inside the
  // network, a plain-http host. Marking the cookie Secure on the plain-http
  // one made the browser throw it away without a word — the sign-in link
  // worked, the token was spent, and the person landed back on the login page
  // with nothing to show for it. Tying it to the host keeps both usable and
  // still marks it Secure wherever the connection really is encrypted.
  const appHost = (() => {
    try {
      return new URL(env.appUrl).host;
    } catch {
      return "";
    }
  })();
  const host = (await headers()).get("host") ?? "";
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https") && host === appHost,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  department: string | null;
  office: string | null;
  role: "PLAYER" | "HR";
};

/**
 * Wrapped in React's cache(): the layout and the page both ask for the user on
 * every render, and every image request asked again. One query per request now.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  // Touch the activity stamp once a day at most, to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 86_400_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const { id, email, name, department, office, role } = session.user;
  return { id, email, name, department, office, role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("You need to sign in");
  return user;
}

/**
 * DEBUG: while DEBUG_OPEN_HR=true the HR area is open to everyone signed in.
 * Drop the flag before production and the role check comes back on its own.
 */
export function canOpenHR(user: { role: "PLAYER" | "HR" }): boolean {
  return user.role === "HR" || env.openHR;
}

/**
 * HR mode is a per-browser switch, so whoever has HR rights can turn the extra
 * controls off and see the app exactly as a player does. It only hides things:
 * every server action still checks the role on its own.
 */
export async function hrModeOn(): Promise<boolean> {
  const store = await cookies();
  return store.get(HR_MODE_COOKIE)?.value !== "off";
}

export async function setHRMode(on: boolean): Promise<void> {
  const store = await cookies();
  store.set(HR_MODE_COOKIE, on ? "on" : "off", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Does this viewer get the HR controls right now: has the rights and has them switched on. */
export async function hrControlsVisible(user: { role: "PLAYER" | "HR" }): Promise<boolean> {
  return canOpenHR(user) && (await hrModeOn());
}

export async function requireHR(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canOpenHR(user)) throw new AuthError("HR access only");
  return user;
}
