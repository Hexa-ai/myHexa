-- Photos des signalements / interventions : la lecture n'était permise qu'aux membres
-- de l'entreprise propriétaire de la box. Le staff Hexa-AI, les destinataires à qui la
-- box est partagée (shared_devices) n'y avaient pas accès : la photo restait en
-- « chargement… ». On aligne sur les documents de box : is_device_visible(box).
-- Les destinataires limités à certaines box (restrict_to_devices) ne voient plus que
-- les photos de leurs box.
drop policy if exists intervention_photos_tenant_read on storage.objects;
create policy intervention_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'intervention-photos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.is_device_visible(split_part(name, '/', 1)::uuid)
  );
