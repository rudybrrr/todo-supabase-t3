alter table public.todo_images
    add column if not exists original_name text,
    add column if not exists mime_type text,
    add column if not exists size_bytes bigint;

update public.todo_images
set original_name = regexp_replace(path, '^.*/', '')
where original_name is null;
