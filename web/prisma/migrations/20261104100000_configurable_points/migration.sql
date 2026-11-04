-- Line, first-line and blackout awards were constants in the code. They are
-- the levers HR is most likely to want, so they move onto the round next to
-- the reaction bonus, which was already there.
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "pointsLine" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "pointsFirstLine" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "pointsBlackout" INTEGER NOT NULL DEFAULT 25;
