-- Tableaux de bord : nouveau type de bloc « interventions » (signalements avec photos).
alter table public.dashboard_widgets drop constraint if exists dashboard_widgets_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_type_check check (type in
  ('curve', 'bars', 'value', 'gauge', 'indicator', 'map', 'status', 'image', 'states', 'table', 'text', 'document', 'alarm_history', 'alarm_stats', 'interventions'));
