-- À lancer APRÈS avoir créé le compte via Dashboard → Authentication → Add user
-- (email fricacciamarketing@gmail.com, "Auto Confirm User" coché pour éviter la
-- vérification par email). Ce script lie ce compte au rôle admin (accès tous
-- restaurants, cf policies RLS déjà en place dans schema.sql).
insert into utilisateurs_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'fricacciamarketing@gmail.com'
on conflict (user_id) do update set role = 'admin';
