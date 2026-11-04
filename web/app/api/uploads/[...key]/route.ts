import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readImage } from "@/lib/storage";

/** Proofs are served to signed-in users only: the link must not leak. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });

  const { key } = await ctx.params;
  // ?download=1 is what the "save this one" links in the profile use: same
  // bytes, but the browser offers a file instead of opening a tab.
  const download = _req.nextUrl.searchParams.get("download") === "1";
  try {
    const buf = await readImage(key.join("/"));
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/webp",
        ...(download
          ? { "Content-Disposition": `attachment; filename="bingo-${key[key.length - 1]}"` }
          : {}),
        // The key contains a UUID and never points at different bytes, so this
        // can be cached for the whole round instead of re-fetched every day.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}
