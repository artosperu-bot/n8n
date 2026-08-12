-- PREPARED ONLY — rollback for migration 001.
-- Safe because ia_renovar_turno is a new RPC in this design.

drop function if exists public.ia_renovar_turno(text, text, text, integer);
