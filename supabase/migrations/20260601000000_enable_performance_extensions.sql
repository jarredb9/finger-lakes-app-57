-- Migration: Enable Performance Extensions (hypopg, index_advisor)
-- Track: places-v1-refactor-enrichment
-- Reason: Align local schema with remote project state discovered during CI audit.

CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";
