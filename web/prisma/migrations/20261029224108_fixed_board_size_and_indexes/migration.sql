-- The board is fixed at 5×5: a larger board never made the game longer,
-- and 7×7 produced unbalanced layouts 81% of the time.
ALTER TABLE "Round" DROP COLUMN "boardSize";

-- Never used: nothing filters or sorts by department.
DROP INDEX IF EXISTS "User_department_idx";

-- Redundant: Reaction_pkey is (proofId, userId, emoji) and already leads with
-- proofId. Pure write overhead on the most frequently written table.
DROP INDEX IF EXISTS "Reaction_proofId_idx";

-- personalLeaderboard scanned Proof once per team member.
CREATE INDEX "Proof_userId_teamId_idx" ON "Proof"("userId", "teamId");

-- One reaction per person per proof, enforced by the database.
CREATE UNIQUE INDEX "Reaction_proofId_userId_key" ON "Reaction"("proofId", "userId");
