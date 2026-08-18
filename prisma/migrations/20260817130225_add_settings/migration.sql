-- CreateTable
CREATE TABLE "settings" (
    "user_id" TEXT NOT NULL,
    "profileUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("user_id")
);
