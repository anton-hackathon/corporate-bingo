import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getActiveRound } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { readImage } from "@/lib/storage";
import { zipStore, type ZipEntry } from "@/lib/zip";

/** A round's worth of photos is well under a hundred; the cap is a guard, not a rule. */
const MAX = 120;

/** Your own pictures, in one file. Nobody else's: the query is pinned to the session. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });

  const round = await getActiveRound();
  const proofs = await prisma.proof.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      imageKey: { not: null },
      ...(round ? { roundId: round.id } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: MAX,
    select: { imageKey: true, createdAt: true },
  });

  if (proofs.length === 0) return new NextResponse("No photos yet", { status: 404 });

  const entries: ZipEntry[] = [];
  for (const [i, p] of proofs.entries()) {
    try {
      entries.push({
        name: `bingo-${String(i + 1).padStart(2, "0")}-${p.createdAt.toISOString().slice(0, 10)}.webp`,
        data: await readImage(p.imageKey as string),
        date: p.createdAt,
      });
    } catch {
      // A file that has gone missing should not cost someone the other 20.
    }
  }
  if (entries.length === 0) return new NextResponse("No photos yet", { status: 404 });

  const zip = zipStore(entries);
  return new NextResponse(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="bingo-photos.zip"',
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store",
    },
  });
}
