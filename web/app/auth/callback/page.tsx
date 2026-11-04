import { redirect } from "next/navigation";
import { completeLoginAction } from "@/app/actions";
import { CatMascot } from "@/components/Mascots";

/**
 * The page a sign-in link opens. It spends nothing: the token is only handed
 * in when this form is submitted, which is the one thing the link-following
 * robots do not do. See completeLoginAction for what they were doing instead.
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/login?error=no-token");

  return (
    <div className="toon empty" style={{ marginTop: 40 }}>
      <CatMascot size={110} />
      <h2>One more tap</h2>
      <p>You are signing in to Corporate Bingo on this device.</p>
      <form action={completeLoginAction} style={{ marginTop: 18 }}>
        <input type="hidden" name="token" value={token} />
        <button className="btn primary">Sign me in</button>
      </form>
    </div>
  );
}
