-- Drop the self-referencing profiles_select_admin policy.
--
-- The policy attempted to widen SELECT to admins via:
--   exists (select 1 from public.profiles p
--           where p.id = auth.uid() and p.is_admin = true)
-- but the subquery re-triggers RLS on public.profiles, which re-evaluates
-- this same policy recursively. PostgreSQL 17 detects the cycle and raises
-- "infinite recursion detected in policy for relation profiles" on every
-- query against the table — including the admin guard's
--   select is_admin from profiles where id = auth.uid()
-- so the entire admin gate breaks under RLS.
--
-- profiles_select_self (auth.uid() = id) already covers every read site we
-- have today: the admin guard, the public verification page, and any
-- "fetch my profile" call. If a future admin UI needs to list ALL profiles
-- (or read someone else's), expose that via a SECURITY DEFINER function
-- — never via a policy that selects from the same table it's protecting.

drop policy if exists profiles_select_admin on public.profiles;
