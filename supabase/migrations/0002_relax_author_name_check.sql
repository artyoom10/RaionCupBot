begin;

create or replace function public.assert_public_author(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_first text;
begin
  select first_name into v_first from public.app_users where id = p_user_id;
  if nullif(trim(coalesce(v_first, '')), '') is null then
    raise exception 'Privileged user must have first_name filled in app_users';
  end if;
end;
$$;

comment on function public.assert_public_author is 'Ensures public result author has a displayable first_name. App code preserves manually edited names.';

commit;
