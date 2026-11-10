-- MarketMesh serves Malawian markets only: all amounts are in Malawi Kwacha (MWK),
-- so the per-company currency and the extra location details are removed.
BEGIN;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_currency_check;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS currency;

ALTER TABLE public.locations
    DROP COLUMN IF EXISTS address_line2,
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS country_code,
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS longitude;

COMMIT;
