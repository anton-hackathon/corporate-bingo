-- The per-day cap on photos off the board was a constant in the code. HR has
-- a reason to move it (a quiet feed wants more, a noisy one fewer), so it
-- becomes a round setting alongside the switch that turns the feature on.
--
-- IF NOT EXISTS because this one was once applied by hand to bring a live
-- deployment back up before its migrate image had been rebuilt; without it
-- the replay fails on 42701 and blocks every later migration.
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "freePostsPerDay" INTEGER NOT NULL DEFAULT 2;
