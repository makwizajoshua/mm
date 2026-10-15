BEGIN;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'MWK';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_currency_check'
          AND conrelid = 'public.tenants'::regclass
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_currency_check
            CHECK (currency ~ '^[A-Z]{3}$');
    END IF;
END
$$;

COMMIT;
