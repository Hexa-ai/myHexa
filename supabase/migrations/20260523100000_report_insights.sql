-- Rapports intelligents — V1
-- 3 nouvelles tables :
--   - report_insights        : constats structurés tirés d'un rapport daily/weekly
--   - device_period_stats    : agrégat permanent (survit au trim des rapports)
--                              pour comparaisons mois-sur-mois et saisonnalité
--   - recipient_device_views : tracking visite (popup smart sur fiche device)

-- ============================================================================
-- 1. report_insights
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.report_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('daily','weekly')),
  variable_name text,
  kind text NOT NULL,
  severity smallint NOT NULL CHECK (severity BETWEEN 1 AND 5),
  score numeric,
  title text NOT NULL,
  body text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_insights_device_created
  ON public.report_insights (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_insights_device_severity
  ON public.report_insights (device_id, severity DESC, created_at DESC);

ALTER TABLE public.report_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_insights_select_visible ON public.report_insights;
CREATE POLICY report_insights_select_visible
  ON public.report_insights
  FOR SELECT
  TO authenticated
  USING (public.is_device_visible(device_id));

COMMENT ON TABLE public.report_insights IS
  'Insights structurés (anomalies, tendances, dérives) tirés d''un rapport daily/weekly via la edge function analyze-report.';

-- ============================================================================
-- 2. device_period_stats
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_period_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  variable_name text NOT NULL,
  period_kind text NOT NULL CHECK (period_kind IN ('daily','weekly')),
  period_start date NOT NULL,
  mean numeric,
  min numeric,
  max numeric,
  median numeric,
  stddev numeric,
  count_points integer,
  alarm_event_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, variable_name, period_kind, period_start)
);

CREATE INDEX IF NOT EXISTS idx_device_period_stats_lookup
  ON public.device_period_stats (device_id, variable_name, period_kind, period_start DESC);

ALTER TABLE public.device_period_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_period_stats_select_visible ON public.device_period_stats;
CREATE POLICY device_period_stats_select_visible
  ON public.device_period_stats
  FOR SELECT
  TO authenticated
  USING (public.is_device_visible(device_id));

COMMENT ON TABLE public.device_period_stats IS
  'Agrégat permanent (mean/std/min/max/median/count/alarm_events) par device/variable/période. Conservé indépendamment du trim des rapports pour permettre comparaisons long terme et détection de saisonnalité.';

-- ============================================================================
-- 3. recipient_device_views
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recipient_device_views (
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_acknowledged_insight_at timestamptz,
  PRIMARY KEY (recipient_id, device_id)
);

ALTER TABLE public.recipient_device_views ENABLE ROW LEVEL SECURITY;

-- Le user n'agit que sur ses propres lignes (recipient associé à son auth.uid).
DROP POLICY IF EXISTS recipient_device_views_select_own ON public.recipient_device_views;
CREATE POLICY recipient_device_views_select_own
  ON public.recipient_device_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipients r
      WHERE r.id = recipient_device_views.recipient_id
        AND r.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS recipient_device_views_insert_own ON public.recipient_device_views;
CREATE POLICY recipient_device_views_insert_own
  ON public.recipient_device_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipients r
      WHERE r.id = recipient_device_views.recipient_id
        AND r.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS recipient_device_views_update_own ON public.recipient_device_views;
CREATE POLICY recipient_device_views_update_own
  ON public.recipient_device_views
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipients r
      WHERE r.id = recipient_device_views.recipient_id
        AND r.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipients r
      WHERE r.id = recipient_device_views.recipient_id
        AND r.auth_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.recipient_device_views IS
  'Tracking visite par (recipient, device). last_viewed_at upserté au mount de DeviceDetailView ; last_acknowledged_insight_at marqué quand l''utilisateur clique "Compris" dans le popup.';
