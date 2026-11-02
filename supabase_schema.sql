create extension if not exists "uuid-ossp";

create table applications (
  id            uuid primary key default uuid_generate_v4(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  company       text not null,
  role          text not null,
  location      text,
  jd_url        text,
  source        text,
  applied_date  date not null default current_date,
  status        text not null default 'Applied' check (status in ('Applied','Screening','Technical','Final','Offer','Rejected','Withdrawn')),
  opt_verified  boolean default false,
  resume_name   text,
  resume_url    text,
  salary_range  text,
  notes         text
);

create table contacts (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  application_id  uuid references applications(id) on delete cascade,
  name            text not null,
  title           text,
  email           text,
  linkedin_url    text,
  outreach_status text default 'Not contacted' check (outreach_status in ('Not contacted','DM sent','Email sent','Replied','Call scheduled','No response')),
  outreach_date   date,
  notes           text
);

create table timeline_events (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  application_id  uuid references applications(id) on delete cascade,
  event_type      text not null,
  event_date      date not null default current_date,
  title           text not null,
  description     text
);

create or replace function update_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger trg_updated_at before update on applications for each row execute procedure update_updated_at();

create or replace function log_status_change() returns trigger as $$ begin if old.status is distinct from new.status then insert into timeline_events(application_id,event_type,event_date,title) values(new.id,'status_change',current_date,'Status → '||new.status); end if; return new; end; $$ language plpgsql;
create trigger trg_status_change after update on applications for each row execute procedure log_status_change();
