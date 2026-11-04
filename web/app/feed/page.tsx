import { redirect } from "next/navigation";

/** The feed moved to the home page; old links should keep working. */
export default function FeedRedirect() {
  redirect("/");
}
