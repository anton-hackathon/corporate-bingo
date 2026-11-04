-- Free posts: a photo that belongs to no task and, before teams exist, to no team.
-- The round therefore has to live on the proof rather than be read off the team.

ALTER TABLE "Proof" ADD COLUMN "roundId" TEXT;
ALTER TABLE "Proof" ADD COLUMN "label" TEXT;

-- Every proof that exists today came through a cell, so its round is its team's.
UPDATE "Proof" p SET "roundId" = t."roundId" FROM "Team" t WHERE t.id = p."teamId";

-- Nothing can be left unmatched: teamId was NOT NULL until this migration.
ALTER TABLE "Proof" ALTER COLUMN "roundId" SET NOT NULL;

ALTER TABLE "Proof" ALTER COLUMN "cellId" DROP NOT NULL;
ALTER TABLE "Proof" ALTER COLUMN "teamId" DROP NOT NULL;

ALTER TABLE "Proof"
  ADD CONSTRAINT "Proof_roundId_fkey" FOREIGN KEY ("roundId")
  REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The feed now filters on the proof's own round instead of joining through Team.
CREATE INDEX "Proof_roundId_createdAt_idx" ON "Proof"("roundId", "createdAt");
