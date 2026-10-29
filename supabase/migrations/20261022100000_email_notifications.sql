-- Spec 015 (T093; US6, RF-032 a RF-035; data-model.md): avisos por e-mail. Categorias liberadas pelo administrador da empresa,
-- preferência individual e fila de envio. Tudo começa desligado: sem linha, a categoria e a preferência valem como desligadas. A fila
-- guarda só referências e o estado do envio; o corpo mínimo é montado no momento do envio, sem coordenada nem endereço. Nada aqui é
-- acessível ao cliente: leitura e escrita só pelas RPCs.

create table public.email_notification_categories (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null,
  enabled boolean not null default false,
  version bigint not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, category),
  constraint email_notification_categories_category_check check (category in ('proximity_confirmed', 'seal_high_critical', 'seal_recovered'))
);

create table public.email_notification_preferences (
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, category),
  constraint email_notification_preferences_membership_fk foreign key (organization_id, user_id) references public.memberships (organization_id, user_id),
  constraint email_notification_preferences_category_fk foreign key (organization_id, category)
    references public.email_notification_categories (organization_id, category)
);

create table public.email_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null,
  occurrence_type text not null,
  occurrence_id uuid not null,
  transition text not null,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_ref text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_notification_outbox_unique unique (organization_id, occurrence_type, occurrence_id, transition, recipient_user_id),
  constraint email_notification_outbox_category_check check (category in ('proximity_confirmed', 'seal_high_critical', 'seal_recovered')),
  constraint email_notification_outbox_type_check check (occurrence_type in ('seal_alert', 'proximity_occurrence')),
  constraint email_notification_outbox_transition_check check (transition in ('opened', 'recovered')),
  constraint email_notification_outbox_status_check check (status in ('pending', 'processing', 'sent', 'retry', 'failed', 'cancelled')),
  constraint email_notification_outbox_error_check check (last_error_code is null or last_error_code ~ '^[A-Z_]{1,40}$'),
  constraint email_notification_outbox_ref_check check (provider_message_ref is null or char_length(provider_message_ref) <= 200)
);
create index email_notification_outbox_due_idx on public.email_notification_outbox (next_attempt_at, id) where status in ('pending', 'retry');
create index email_notification_outbox_processing_idx on public.email_notification_outbox (claimed_at) where status = 'processing';
create index email_notification_outbox_occurrence_idx on public.email_notification_outbox (organization_id, occurrence_id);

alter table public.email_notification_categories enable row level security;
alter table public.email_notification_preferences enable row level security;
alter table public.email_notification_outbox enable row level security;
revoke all on public.email_notification_categories, public.email_notification_preferences, public.email_notification_outbox from public, anon, authenticated;
