-- Latency Optimization: Database Indexes
-- These indexes significantly speed up document queries for families with 100+ documents

-- Index on family_head_id with deleted filter for document listing
CREATE INDEX IF NOT EXISTS idx_documents_family_head_id_deleted 
ON documents(family_head_id, deleted)
WHERE deleted = false;

-- Index on family_head_id and category for filtered list queries
CREATE INDEX IF NOT EXISTS idx_documents_family_head_category
ON documents(family_head_id, category, deleted)
WHERE deleted = false;

-- Index on uploaded_at for sorting (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at
ON documents(family_head_id, uploaded_at DESC)
WHERE deleted = false;

-- Composite index for the most common query pattern (list + sort)
CREATE INDEX IF NOT EXISTS idx_documents_list_composite
ON documents(family_head_id, deleted, uploaded_at DESC)
INCLUDE (id, file_name, file_size, file_type, category, minio_key);
