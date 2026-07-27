-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL DEFAULT 'New chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "parts" JSONB NOT NULL,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "mediaType" VARCHAR(100) NOT NULL,
    "filename" VARCHAR(300),
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chat_user_id_updatedAt_idx" ON "Chat"("user_id", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_chat_id_createdAt_idx" ON "Message"("chat_id", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_user_id_idx" ON "Attachment"("user_id");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
