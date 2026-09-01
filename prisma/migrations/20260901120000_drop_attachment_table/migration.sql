-- Attachments moved off Postgres onto disk (BlobStorage). Bytes are no longer
-- stored in the database; message parts reference public `/media/{key}` URLs.
DROP TABLE "Attachment";
