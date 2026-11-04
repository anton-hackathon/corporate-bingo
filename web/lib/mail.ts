import nodemailer from "nodemailer";
import { env } from "./env";

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    })
  : null;

async function send(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    // Development without SMTP: the message is printed so you can still sign in.
    console.log(`\n── email for ${to} ──\n${subject}\n${text}\n──\n`);
    return;
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, html, text });
}

/** 1st, 2nd, 3rd, 4th — plain English ordinal suffix. */
function ordinal(n: number): string {
  const two = n % 100;
  if (two >= 11 && two <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
}

function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f5f7fc;padding:28px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:3px solid #121212;border-radius:16px;box-shadow:5px 5px 0 #121212;overflow:hidden">
    <div style="background:#2258e7;color:#fff;padding:18px 22px;font-size:20px;font-weight:800">${title}</div>
    <div style="padding:22px;color:#3d4c65;font-size:15px;line-height:1.55">${body}
    ${cta ? `<p style="margin:22px 0 0"><a href="${cta.href}" style="display:inline-block;background:#ffc93c;color:#121212;border:3px solid #121212;border-radius:12px;padding:12px 22px;font-weight:800;text-decoration:none">${cta.label}</a></p>` : ""}
    </div>
  </div>
</div>`;
}

export async function sendMagicLink(to: string, name: string, url: string) {
  // Asking twice is the normal thing to do when mail is slow, so an inbox ends
  // up holding several of these and they are otherwise identical. The time
  // tells them apart; without it people click the one nearest the top and get
  // told their link expired.
  const at = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  await send(
    to,
    `Sign in to Bingo (${at})`,
    layout(
      "Sign in to Bingo",
      `<p>Hi ${name}, click the button below to sign in. The link expires in 15 minutes and can only be used once.</p>
       <p><b>Requested at ${at}.</b> If you asked more than once, the newest email is the one to use.</p>
       <p style="font-size:13px;color:#8e97ab">If you did not request this, you can safely ignore this email.</p>`,
      { href: url, label: "Sign in" },
    ),
    `Hi ${name}, here is your sign-in link, requested at ${at} (15 minutes, single use): ${url}`,
  );
}

export async function sendSignupInvite(to: string, name: string, roundTitle: string, url: string) {
  await send(
    to,
    `${roundTitle}: are you in?`,
    layout(
      "Teams are forming",
      `<p>Hi ${name}, we are launching ${roundTitle}: corporate bingo: a board of silly tasks, randomly drawn teams, and a leaderboard.</p>
       <p>Taking part is entirely up to you. Click the button if you are playing. In a few days we will put the teams together from everyone who said yes.</p>`,
      { href: url, label: "I’m in" },
    ),
    `Hi ${name}, we are launching ${roundTitle}. Join here: ${url}`,
  );
}

export async function sendDigest(
  to: string,
  name: string,
  data: { teamName: string; place: number; total: number; points: number; toLine: number; url: string },
) {
  await send(
    to,
    `${data.teamName} is in ${data.place}${ordinal(data.place)} place`,
    layout(
      "How your team is doing",
      `<p>Hi ${name}, ${data.teamName} has <b>${data.points}</b> ${data.points === 1 ? "point" : "points"} and sits <b>${data.place}${ordinal(data.place)} out of ${data.total}</b>.</p>
       <p>${data.toLine > 0 ? `You are <b>${data.toLine}</b> ${data.toLine === 1 ? "cell" : "cells"} away from completing a line.` : "A line is complete. Time to go for the next one."}</p>`,
      { href: data.url, label: "Open the board" },
    ),
    `${data.teamName}: ${data.points} points, ${data.place}${ordinal(data.place)} out of ${data.total}. ${data.url}`,
  );
}
