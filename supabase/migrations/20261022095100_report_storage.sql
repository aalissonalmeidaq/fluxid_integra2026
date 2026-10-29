-- Spec 015 (T077; RF-031): bucket privado dos arquivos de exportação. Nenhuma política abre `storage.objects` deste bucket ao cliente: só a
-- Edge Function (chave de serviço) grava o arquivo completo e emite a URL assinada de vida curta, depois que o banco reautoriza o download.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-exports', 'report-exports', false, 52428800, array['text/csv'])
on conflict (id) do update set public = false;
