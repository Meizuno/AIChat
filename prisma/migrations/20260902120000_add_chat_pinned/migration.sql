-- Add a `pinned` flag so chats can be pinned to the top of the list, and swap
-- the list index to order pinned-first then newest.
ALTER TABLE "Chat" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "Chat_user_id_updatedAt_idx";
CREATE INDEX "Chat_user_id_pinned_updatedAt_idx" ON "Chat"("user_id", "pinned", "updatedAt");
