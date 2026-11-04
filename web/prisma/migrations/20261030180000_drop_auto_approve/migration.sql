-- The switch was never wired to anything: nothing read the column, so turning
-- it off changed a boolean and left the game identical. Proofs count the moment
-- they land, and HR takes one down afterwards if it does not belong.
ALTER TABLE "Round" DROP COLUMN "autoApprove";
