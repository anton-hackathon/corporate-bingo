import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;
  const hint =
    error === "expired"
      ? "That link has expired or has already been used. If there is more than one sign-in email in your inbox, open the newest — each link lasts 15 minutes and works once. Otherwise ask for a fresh one below."
      : error === "no-token"
        ? "That link is incomplete. Request a new one."
        : null;
  return <LoginForm hint={hint} />;
}
