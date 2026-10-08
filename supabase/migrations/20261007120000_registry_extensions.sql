-- Spec 007: PostGIS para as geocercas (research.md, decisão 1). Nenhum dado, só a extensão, no schema `extensions`
-- (as funções do FluxID usam `search_path = ''` e a qualificam como `extensions.ST_...`).
create extension if not exists postgis with schema extensions;
