-- Clean-project bootstrap only. Never run against an existing production schema.
-- Apply before migrations/0001. Transactional; rollback on failure. For a successful
-- disposable installation, discard the database rather than drop production tables.
BEGIN;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
CREATE TYPE public.staff_role AS ENUM ('owner', 'receptionist', 'supervisor');
CREATE TYPE public.room_inventory_state AS ENUM ('active', 'inactive');
CREATE TABLE public.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  time_zone text NOT NULL DEFAULT 'Africa/Lagos',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  role public.staff_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_profiles_hotel_id_idx ON public.staff_profiles(hotel_id);
CREATE INDEX staff_profiles_created_by_idx ON public.staff_profiles(created_by);
CREATE TABLE public.room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  current_rate_naira bigint NOT NULL CHECK (current_rate_naira >= 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (length(currency) = 3),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  daily_rate numeric(12,0),
  UNIQUE(property_id, name),
  UNIQUE(id, property_id)
);
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL,
  room_number text NOT NULL CHECK (length(btrim(room_number)) > 0),
  inventory_state public.room_inventory_state NOT NULL DEFAULT 'active',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(category_id, property_id) REFERENCES public.room_categories(id, property_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX rooms_property_number_key ON public.rooms(property_id, lower(btrim(room_number)));
CREATE INDEX rooms_property_id_idx ON public.rooms(property_id);
CREATE INDEX rooms_category_id_property_id_idx ON public.rooms(category_id, property_id);
CREATE FUNCTION private.current_hotel_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT hotel_id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid()) AND active $function$;
CREATE FUNCTION private.current_staff_role() RETURNS public.staff_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT role FROM public.staff_profiles WHERE user_id = (SELECT auth.uid()) AND active $function$;
REVOKE ALL ON FUNCTION private.current_hotel_id(), private.current_staff_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_hotel_id(), private.current_staff_role() TO authenticated, service_role;
CREATE FUNCTION private.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$function$;
CREATE TRIGGER hotels_updated_at BEFORE UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER staff_profiles_updated_at BEFORE UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER room_categories_updated_at BEFORE UPDATE ON public.room_categories FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read_hotel ON public.hotels FOR SELECT TO authenticated USING (id = (SELECT private.current_hotel_id()));
CREATE POLICY staff_read_profiles ON public.staff_profiles FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR
  (hotel_id = (SELECT private.current_hotel_id()) AND (SELECT private.current_staff_role()) = 'owner')
);
CREATE POLICY staff_read_categories ON public.room_categories FOR SELECT TO authenticated USING (property_id = (SELECT private.current_hotel_id()));
CREATE POLICY staff_read_rooms ON public.rooms FOR SELECT TO authenticated USING (property_id = (SELECT private.current_hotel_id()));
GRANT SELECT ON public.hotels, public.staff_profiles, public.room_categories, public.rooms TO authenticated, service_role;
COMMIT;
