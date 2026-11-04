-- Tasks that can be satisfied by something already done.
ALTER TABLE "Task" ADD COLUMN "retro" BOOLEAN NOT NULL DEFAULT false;

-- What a proof finished off, recorded when it landed, so the feed can show it.
ALTER TABLE "Proof" ADD COLUMN "bingoLines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Proof" ADD COLUMN "bingoBlackout" BOOLEAN NOT NULL DEFAULT false;
