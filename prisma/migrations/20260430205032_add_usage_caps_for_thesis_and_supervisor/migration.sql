-- AlterTable
ALTER TABLE "UsageLimit" ADD COLUMN     "supervisorSuggestionsLimit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "supervisorSuggestionsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "thesisGenerationsLimit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "thesisGenerationsUsed" INTEGER NOT NULL DEFAULT 0;
