-- HR can turn photos off the board on and off for a round.
ALTER TABLE "Round" ADD COLUMN "allowFreePosts" BOOLEAN NOT NULL DEFAULT true;
