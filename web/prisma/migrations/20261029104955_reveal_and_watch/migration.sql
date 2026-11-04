-- AlterTable
ALTER TABLE "BoardCell" ADD COLUMN     "revealedAt" TIMESTAMP(3),
ADD COLUMN     "revealedById" TEXT;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "revealsPerDay" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "dailyLimit" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "watchTeamIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "watchUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "BoardCell" ADD CONSTRAINT "BoardCell_revealedById_fkey" FOREIGN KEY ("revealedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
