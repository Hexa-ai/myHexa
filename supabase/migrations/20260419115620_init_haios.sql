-- ================================================================
-- Init HaiOS schema (Companies, Recipients, Devices, Reports)
-- ================================================================

-- 1. ENUM
CREATE TYPE report_type AS ENUM ('status', 'daily', 'weekly');

-- 2. Helper function (partagée par les triggers updated_at)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TABLE companies
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contact_name    text,
  contact_email   text,
  phone           text,
  address         text,
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. TABLE recipients
CREATE TABLE recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  contact_email   text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON recipients (company_id);

CREATE TRIGGER recipients_updated_at BEFORE UPDATE ON recipients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. TABLE devices
CREATE TABLE devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  serial_number       text,
  mac_eth0            text,
  token               text UNIQUE,
  invoice_number      text,
  os_version          text,
  os_install_date     date,
  last_connection_at  timestamptz,
  address             text,
  latitude            numeric,
  longitude           numeric,
  has_battery         boolean NOT NULL DEFAULT false,
  has_supercap        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON devices (company_id);
CREATE INDEX ON devices (token);

CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. TABLE reports (append-only, pas de updated_at)
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type          report_type NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON reports (device_id, type, received_at DESC);

-- 7. RLS (activé partout, 0 policy → tout bloqué sauf service_role)
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports    ENABLE ROW LEVEL SECURITY;
