-- Flame Chick Production — operational schema V1 (source candidate).
-- Additive only. This migration is NOT approved for Production application.
-- It does not seed restaurant/branch/staff/order rows, alter catalog publications,
-- enable customer ordering, deploy Functions, or register Realtime tables.
--
-- Design rules:
--   * Existing V3 catalog tables/publication #2 remain authoritative and untouched.
--   * Order reads retain current POS/Rider legacy-compatible field names.
--   * No tax/GST, service-charge or tip columns are introduced.
--   * Order writes and all lifecycle mutations are reserved for server RPCs.
--   * app_private has no Data API schema USAGE; private tables are server-only.
--   * Push subscription credentials are ciphertext only, never cleartext.
--
-- Intended isolated QA: supabase/tests/flame_chick_operational_schema_v1.sql
-- Apply only after isolated migration replay, contract tests, security review,
-- backup/restore verification, and separate explicit Production approval.

BEGIN;

DO $preflight$
DECLARE
  v_name text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_SCHEMA_REQUIRES_POSTGRES';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
    WHERE n.nspname='app_private' AND r.rolname='postgres'
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_PRIVATE_SCHEMA_MISSING';
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    'restaurants','branches','user_profiles','user_roles',
    'catalog_publications','catalog_current_publication',
    'categories','subcategories','products','product_variants',
    'modifier_groups','modifiers','modifier_group_assignments','modifier_price_rules',
    'drink_options','deal_collections','deals','deal_variants',
    'deal_component_groups','deal_component_options','deal_variant_component_options',
    'catalog_schedule_sets','catalog_schedule_windows','deal_schedule_assignments',
    'branch_product_availability','branch_variant_availability','branch_deal_availability'
  ]
  LOOP
    IF pg_catalog.to_regclass('public.'||v_name) IS NULL THEN
      RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_REQUIRED_PARENT_MISSING: %',v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'delivery_areas','branch_delivery_settings','orders','order_items',
    'order_item_components','order_item_modifiers','order_status_history','payments',
    'delivery_tasks','rider_profiles','delivery_task_offers','delivery_assignments',
    'delivery_task_events','rider_push_subscriptions'
  ]
  LOOP
    IF pg_catalog.to_regclass('public.'||v_name) IS NOT NULL THEN
      RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_RELATION_ALREADY_EXISTS: public.%',v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'website_order_success_events','order_number_counters',
    'notification_outbox','api_rate_limit_buckets'
  ]
  LOOP
    IF pg_catalog.to_regclass('app_private.'||v_name) IS NOT NULL THEN
      RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_RELATION_ALREADY_EXISTS: app_private.%',v_name;
    END IF;
  END LOOP;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- Delivery pricing configuration. NULL means "Not Listed" is not configured;
-- an explicit numeric zero is a valid, intentionally configured fee.
-- ---------------------------------------------------------------------------

CREATE TABLE public.delivery_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  name_ur text,
  delivery_fee numeric(12,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT delivery_areas_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_areas_id_branch_restaurant_key UNIQUE (id,branch_id,restaurant_id),
  CONSTRAINT delivery_areas_branch_restaurant_fkey
    FOREIGN KEY (branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_areas_delivery_fee_check CHECK (delivery_fee >= 0),
  CONSTRAINT delivery_areas_name_check
    CHECK (name=btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT delivery_areas_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur=btrim(name_ur) AND char_length(name_ur)<=120)),
  CONSTRAINT delivery_areas_sort_order_check CHECK (sort_order>=0),
  CONSTRAINT delivery_areas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT delivery_areas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX delivery_areas_branch_normalized_name_key
  ON public.delivery_areas (
    branch_id,
    lower(pg_catalog.regexp_replace(pg_catalog.btrim(name),'\s+',' ','g'))
  );

CREATE INDEX delivery_areas_branch_active_sort_idx
  ON public.delivery_areas(branch_id,is_active,sort_order,id);

COMMENT ON TABLE public.delivery_areas IS
  'Explicit branch delivery areas and fees. Fee has no default; 0 is valid only when intentionally entered.';
COMMENT ON COLUMN public.delivery_areas.delivery_fee IS
  'Explicit amount in restaurant currency. Never inferred from distance or customer input.';

CREATE TABLE public.branch_delivery_settings (
  branch_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  not_listed_delivery_fee numeric(12,2),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT branch_delivery_settings_pkey PRIMARY KEY (branch_id),
  CONSTRAINT branch_delivery_settings_branch_restaurant_key UNIQUE(branch_id,restaurant_id),
  CONSTRAINT branch_delivery_settings_branch_restaurant_fkey
    FOREIGN KEY (branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT branch_delivery_settings_fee_check
    CHECK (not_listed_delivery_fee IS NULL OR not_listed_delivery_fee>=0),
  CONSTRAINT branch_delivery_settings_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.branch_delivery_settings IS
  'Branch-specific Not Listed / Other delivery fee. NULL means unconfigured; explicit 0 means configured free delivery.';

-- ---------------------------------------------------------------------------
-- Orders and immutable item/financial snapshots. These names intentionally
-- match the existing POS, Order API and Rider read projections.
-- ---------------------------------------------------------------------------

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_number text NOT NULL,
  local_order_id text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  source text NOT NULL,
  source_reference text,
  fulfillment_type text NOT NULL,
  status text NOT NULL DEFAULT 'new',

  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  delivery_address text,
  delivery_area_id uuid,
  delivery_area_name_snapshot text,
  delivery_area_fee_snapshot numeric(12,2) NOT NULL,
  delivery_selection_type text,
  delivery_other_locality_snapshot text,
  delivery_instructions text,

  catalog_publication_id uuid,
  catalog_version bigint,

  subtotal numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2)
    GENERATED ALWAYS AS (greatest(total-paid_amount,0::numeric)) STORED,
  currency_code char(3) NOT NULL DEFAULT 'PKR',
  payment_status text NOT NULL DEFAULT 'unpaid',
  payment_method_summary text,

  notes text,
  internal_notes text,
  cashier_id uuid,
  created_by_user_id uuid,
  pos_device_id uuid,
  register_session_id uuid,

  accepted_by uuid,
  rejected_by uuid,
  rejection_reason text,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_type text,
  cancelled_by_user_id uuid,
  cancellation_reason text,
  returned_at timestamptz,

  placed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  collected_at timestamptz,
  served_at timestamptz,
  completed_at timestamptz,
  last_status_changed_by uuid,
  last_status_actor_type text,
  last_status_change_reason text,

  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_id_branch_restaurant_key UNIQUE(id,branch_id,restaurant_id),
  CONSTRAINT orders_branch_order_number_key UNIQUE(branch_id,order_number),
  CONSTRAINT orders_idempotency_key
    UNIQUE(restaurant_id,branch_id,source,idempotency_key),
  CONSTRAINT orders_branch_restaurant_fkey
    FOREIGN KEY (branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT orders_catalog_publication_fkey
    FOREIGN KEY (catalog_publication_id,restaurant_id)
    REFERENCES public.catalog_publications(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT orders_delivery_area_fkey
    FOREIGN KEY (delivery_area_id,branch_id,restaurant_id)
    REFERENCES public.delivery_areas(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT orders_source_check
    CHECK (source IN ('website','pos','whatsapp','phone','third_party','manual','other')),
  CONSTRAINT orders_fulfillment_type_check
    CHECK (fulfillment_type IN ('delivery','pickup','dine_in')),
  CONSTRAINT orders_status_check
    CHECK (status IN (
      'new','needs_confirmation','accepted','preparing','ready','out_for_delivery',
      'delivered','collected','served','completed','rejected','cancelled','returned'
    )),
  CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN (
      'unpaid','partially_paid','paid','not_collected','closed_uncollected',
      'refund_due','partially_refunded','refunded'
    )),
  CONSTRAINT orders_order_number_check
    CHECK (order_number=btrim(order_number) AND char_length(order_number) BETWEEN 1 AND 40),
  CONSTRAINT orders_idempotency_key_check
    CHECK (idempotency_key=btrim(idempotency_key) AND char_length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT orders_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT orders_customer_name_check
    CHECK (customer_name=btrim(customer_name) AND char_length(customer_name) BETWEEN 1 AND 160),
  CONSTRAINT orders_customer_phone_check
    CHECK (customer_phone=btrim(customer_phone) AND char_length(customer_phone) BETWEEN 3 AND 32),
  CONSTRAINT orders_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT orders_amounts_check
    CHECK (
      subtotal>=0 AND discount_amount>=0 AND discount_amount<=subtotal
      AND delivery_fee>=0 AND delivery_area_fee_snapshot>=0
      AND total>=0 AND paid_amount>=0 AND paid_amount<=total
      AND total=subtotal-discount_amount+delivery_fee
      AND delivery_area_fee_snapshot=delivery_fee
    ),
  CONSTRAINT orders_delivery_snapshot_check CHECK (
    (
      fulfillment_type='delivery'
      AND delivery_address IS NOT NULL
      AND char_length(btrim(delivery_address)) BETWEEN 5 AND 1000
      AND delivery_selection_type IN ('listed_area','not_listed')
      AND (
        (delivery_selection_type='listed_area' AND delivery_area_id IS NOT NULL
          AND delivery_area_name_snapshot IS NOT NULL)
        OR
        (delivery_selection_type='not_listed' AND delivery_area_id IS NULL
          AND delivery_area_name_snapshot='Not Listed / Other')
      )
    )
    OR
    (
      fulfillment_type<>'delivery'
      AND delivery_area_id IS NULL
      AND delivery_area_name_snapshot IS NULL
      AND delivery_selection_type IS NULL
      AND delivery_other_locality_snapshot IS NULL
      AND delivery_address IS NULL
      AND delivery_instructions IS NULL
      AND delivery_fee=0
      AND delivery_area_fee_snapshot=0
    )
  ),
  CONSTRAINT orders_cancel_audit_check CHECK (
    (cancelled_at IS NULL AND cancelled_by_type IS NULL AND cancelled_by_user_id IS NULL AND cancellation_reason IS NULL)
    OR
    (cancelled_at IS NOT NULL AND cancelled_by_type IS NOT NULL
      AND cancelled_by_type IN ('admin','owner','system')
      AND cancelled_by_user_id IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND char_length(btrim(cancellation_reason)) BETWEEN 1 AND 500)
  ),
  CONSTRAINT orders_reject_audit_check CHECK (
    (rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL)
    OR
    (rejected_at IS NOT NULL AND rejected_by IS NOT NULL
      AND rejection_reason IS NOT NULL
      AND char_length(btrim(rejection_reason)) BETWEEN 1 AND 500)
  )
);

CREATE INDEX orders_branch_status_created_idx
  ON public.orders(branch_id,status,created_at DESC);
CREATE INDEX orders_branch_created_idx
  ON public.orders(branch_id,created_at DESC);
CREATE INDEX orders_source_created_idx
  ON public.orders(restaurant_id,source,created_at DESC);
CREATE INDEX orders_publication_idx
  ON public.orders(catalog_publication_id)
  WHERE catalog_publication_id IS NOT NULL;

COMMENT ON TABLE public.orders IS
  'Operational order header. All writes occur through authenticated server-side transactional commands; no tax/GST fields in V1.';
COMMENT ON COLUMN public.orders.status IS
  'Includes needs_confirmation for stale offline POS quotes and returned for physically received failed deliveries.';

CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_number integer NOT NULL,
  line_kind text NOT NULL,
  product_id uuid,
  product_variant_id uuid,
  deal_id uuid,
  quantity integer NOT NULL,
  product_name_snapshot text,
  variant_label_snapshot text,
  deal_title_snapshot text,
  unit_price_snapshot numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL,
  item_notes text,
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalog_publication_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT order_items_pkey PRIMARY KEY(id),
  CONSTRAINT order_items_id_order_branch_restaurant_key UNIQUE(id,order_id,branch_id,restaurant_id),
  CONSTRAINT order_items_order_line_key UNIQUE(order_id,line_number),
  CONSTRAINT order_items_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_items_product_fkey
    FOREIGN KEY(product_id,restaurant_id)
    REFERENCES public.products(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_items_variant_fkey
    FOREIGN KEY(product_variant_id,restaurant_id,product_id)
    REFERENCES public.product_variants(id,restaurant_id,product_id) ON DELETE RESTRICT,
  CONSTRAINT order_items_deal_fkey
    FOREIGN KEY(deal_id,restaurant_id)
    REFERENCES public.deals(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_items_publication_fkey
    FOREIGN KEY(catalog_publication_id,restaurant_id)
    REFERENCES public.catalog_publications(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_items_line_kind_check CHECK (
    (line_kind='product' AND product_id IS NOT NULL AND product_variant_id IS NOT NULL AND deal_id IS NULL)
    OR (line_kind='deal' AND deal_id IS NOT NULL AND product_id IS NULL AND product_variant_id IS NULL)
  ),
  CONSTRAINT order_items_quantity_check CHECK(quantity BETWEEN 1 AND 99),
  CONSTRAINT order_items_line_number_check CHECK(line_number BETWEEN 1 AND 100),
  CONSTRAINT order_items_amounts_check
    CHECK(unit_price_snapshot>=0 AND discount_amount>=0 AND line_total>=0),
  CONSTRAINT order_items_snapshot_check CHECK(jsonb_typeof(item_snapshot)='object')
);

CREATE INDEX order_items_order_idx ON public.order_items(order_id,line_number);

CREATE TABLE public.order_item_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  deal_component_id uuid,
  component_type text NOT NULL,
  selected_product_id uuid,
  selected_variant_id uuid,
  selected_drink_option_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  name_snapshot text NOT NULL,
  variant_snapshot text,
  volume_snapshot text,
  unit_price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  component_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT order_item_components_pkey PRIMARY KEY(id),
  CONSTRAINT order_item_components_id_order_branch_restaurant_key
    UNIQUE(id,order_id,branch_id,restaurant_id),
  CONSTRAINT order_item_components_item_fkey
    FOREIGN KEY(order_item_id,order_id,branch_id,restaurant_id)
    REFERENCES public.order_items(id,order_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_item_components_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_item_components_quantity_check CHECK(quantity BETWEEN 1 AND 99),
  CONSTRAINT order_item_components_price_check CHECK(unit_price_snapshot>=0),
  CONSTRAINT order_item_components_snapshot_check
    CHECK(jsonb_typeof(component_snapshot)='object')
);

CREATE INDEX order_item_components_item_idx ON public.order_item_components(order_item_id);

CREATE TABLE public.order_item_modifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  order_item_component_id uuid,
  modifier_group_id uuid,
  modifier_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  modifier_group_name_snapshot text,
  modifier_name_snapshot text NOT NULL,
  unit_price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  total_price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  modifier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT order_item_modifiers_pkey PRIMARY KEY(id),
  CONSTRAINT order_item_modifiers_item_fkey
    FOREIGN KEY(order_item_id,order_id,branch_id,restaurant_id)
    REFERENCES public.order_items(id,order_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_item_modifiers_component_fkey
    FOREIGN KEY(order_item_component_id,order_id,branch_id,restaurant_id)
    REFERENCES public.order_item_components(id,order_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_item_modifiers_quantity_check CHECK(quantity BETWEEN 1 AND 99),
  CONSTRAINT order_item_modifiers_amounts_check
    CHECK(unit_price_snapshot>=0 AND total_price_snapshot>=0),
  CONSTRAINT order_item_modifiers_snapshot_check
    CHECK(jsonb_typeof(modifier_snapshot)='object')
);

CREATE INDEX order_item_modifiers_item_idx ON public.order_item_modifiers(order_item_id);

CREATE TABLE public.order_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  actor_type text NOT NULL,
  actor_role text,
  reason_code text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id uuid,
  changed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT order_status_history_pkey PRIMARY KEY(id),
  CONSTRAINT order_status_history_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_status_history_actor_fkey
    FOREIGN KEY(actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT order_status_history_metadata_check CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT order_status_history_reason_check
    CHECK(reason IS NULL OR char_length(reason)<=500)
);

CREATE INDEX order_status_history_order_changed_idx
  ON public.order_status_history(order_id,changed_at DESC);

-- Actual money movements only; a refund is a separate positive ledger entry.
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  entry_type text NOT NULL,
  payment_method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'PKR',
  status text NOT NULL DEFAULT 'succeeded',
  original_collection_id uuid,
  provider text,
  provider_reference text,
  idempotency_key text NOT NULL,
  received_by_user_id uuid,
  refunded_by_user_id uuid,
  reason_code text,
  reason_note text,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT payments_pkey PRIMARY KEY(id),
  CONSTRAINT payments_id_order_branch_restaurant_key UNIQUE(id,order_id,branch_id,restaurant_id),
  CONSTRAINT payments_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT payments_original_collection_fkey
    FOREIGN KEY(original_collection_id,order_id,branch_id,restaurant_id)
    REFERENCES public.payments(id,order_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT payments_received_by_fkey
    FOREIGN KEY(received_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT payments_refunded_by_fkey
    FOREIGN KEY(refunded_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT payments_entry_type_check CHECK(entry_type IN ('collection','refund')),
  CONSTRAINT payments_method_check
    CHECK(payment_method IN ('cash','card','bank','wallet','other')),
  CONSTRAINT payments_status_check CHECK(status IN ('succeeded','failed','voided')),
  CONSTRAINT payments_amount_check CHECK(amount>0),
  CONSTRAINT payments_currency_check CHECK(currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payments_idempotency_check
    CHECK(idempotency_key=btrim(idempotency_key) AND char_length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT payments_type_reference_check CHECK (
    (entry_type='collection' AND original_collection_id IS NULL AND refunded_by_user_id IS NULL)
    OR
    (entry_type='refund' AND original_collection_id IS NOT NULL AND refunded_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX payments_order_idempotency_key
  ON public.payments(restaurant_id,branch_id,order_id,idempotency_key);
CREATE UNIQUE INDEX payments_provider_reference_key
  ON public.payments(restaurant_id,provider,provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;
CREATE INDEX payments_order_occurred_idx ON public.payments(order_id,occurred_at DESC);

COMMENT ON TABLE public.payments IS
  'Append-only ledger of actual collections/refunds. No gateway, tax/GST, automatic refund, or raw card data in V1.';

-- ---------------------------------------------------------------------------
-- Delivery tasks, rider identities, offers, assignments and audit events.
-- Current Edge Function field/status names are retained for compatibility.
-- ---------------------------------------------------------------------------

CREATE TABLE public.rider_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rider_code text NOT NULL,
  display_name text NOT NULL,
  phone text,
  availability_status text NOT NULL DEFAULT 'offline',
  accepting_jobs boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT rider_profiles_pkey PRIMARY KEY(id),
  CONSTRAINT rider_profiles_user_branch_key UNIQUE(user_id,branch_id),
  CONSTRAINT rider_profiles_user_branch_restaurant_key UNIQUE(user_id,branch_id,restaurant_id),
  CONSTRAINT rider_profiles_id_branch_restaurant_key UNIQUE(id,branch_id,restaurant_id),
  CONSTRAINT rider_profiles_branch_restaurant_fkey
    FOREIGN KEY(branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT rider_profiles_user_fkey
    FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT rider_profiles_code_check
    CHECK(rider_code=btrim(rider_code) AND char_length(rider_code) BETWEEN 1 AND 32),
  CONSTRAINT rider_profiles_name_check
    CHECK(display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT rider_profiles_phone_check
    CHECK(phone IS NULL OR (phone=btrim(phone) AND char_length(phone) BETWEEN 3 AND 32)),
  CONSTRAINT rider_profiles_availability_check
    CHECK(availability_status IN ('offline','available','busy','suspended'))
);

CREATE INDEX rider_profiles_branch_active_idx
  ON public.rider_profiles(branch_id,is_active,display_name);

CREATE TABLE public.delivery_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'dispatch_pending',
  recipient_name_snapshot text NOT NULL,
  recipient_phone_snapshot text NOT NULL,
  address_snapshot text NOT NULL,
  area_name_snapshot text NOT NULL,
  area_id_snapshot uuid,
  delivery_selection_type_snapshot text NOT NULL,
  delivery_fee_snapshot numeric(12,2) NOT NULL,
  delivery_instructions_snapshot text,

  dispatch_started_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  return_reported_at timestamptz,
  return_reported_by uuid,
  return_confirmed_at timestamptz,
  return_confirmed_by uuid,
  return_confirm_reason text,

  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT delivery_tasks_pkey PRIMARY KEY(id),
  CONSTRAINT delivery_tasks_order_key UNIQUE(order_id),
  CONSTRAINT delivery_tasks_id_branch_restaurant_key UNIQUE(id,branch_id,restaurant_id),
  CONSTRAINT delivery_tasks_id_order_branch_restaurant_key UNIQUE(id,order_id,branch_id,restaurant_id),
  CONSTRAINT delivery_tasks_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_branch_restaurant_fkey
    FOREIGN KEY(branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_status_check CHECK(status IN (
    'dispatch_pending','offering','accepted','out_for_delivery','failed','delivered','returned','cancelled'
  )),
  CONSTRAINT delivery_tasks_selection_check
    CHECK(delivery_selection_type_snapshot IN ('listed_area','not_listed')),
  CONSTRAINT delivery_tasks_fee_check CHECK(delivery_fee_snapshot>=0),
  CONSTRAINT delivery_tasks_snapshot_check CHECK(
    char_length(btrim(recipient_name_snapshot)) BETWEEN 1 AND 160
    AND char_length(btrim(recipient_phone_snapshot)) BETWEEN 3 AND 32
    AND char_length(btrim(address_snapshot)) BETWEEN 5 AND 1000
    AND char_length(btrim(area_name_snapshot)) BETWEEN 1 AND 120
  ),
  CONSTRAINT delivery_tasks_return_audit_check CHECK(
    (return_confirmed_at IS NULL AND return_confirmed_by IS NULL AND return_confirm_reason IS NULL)
    OR
    (return_confirmed_at IS NOT NULL AND return_confirmed_by IS NOT NULL
      AND return_reported_at IS NOT NULL
      AND return_confirm_reason IS NOT NULL
      AND char_length(btrim(return_confirm_reason)) BETWEEN 1 AND 500)
  ),
  CONSTRAINT delivery_tasks_return_report_actor_check
    CHECK(return_reported_by IS NULL OR return_reported_at IS NOT NULL)
);

CREATE INDEX delivery_tasks_branch_status_created_idx
  ON public.delivery_tasks(branch_id,status,created_at);
CREATE INDEX delivery_tasks_branch_created_idx
  ON public.delivery_tasks(branch_id,created_at DESC);

CREATE TABLE public.delivery_task_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  delivery_task_id uuid NOT NULL,
  rider_user_id uuid NOT NULL,
  offer_round integer NOT NULL,
  status text NOT NULL DEFAULT 'offered',
  offered_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  response_reason text,
  created_by uuid,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT delivery_task_offers_pkey PRIMARY KEY(id),
  CONSTRAINT delivery_task_offers_id_task_branch_restaurant_key
    UNIQUE(id,delivery_task_id,branch_id,restaurant_id),
  CONSTRAINT delivery_task_offers_task_round_key UNIQUE(delivery_task_id,offer_round),
  CONSTRAINT delivery_task_offers_task_fkey
    FOREIGN KEY(delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_tasks(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_offers_rider_fkey
    FOREIGN KEY(rider_user_id,branch_id,restaurant_id)
    REFERENCES public.rider_profiles(user_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_offers_created_by_fkey
    FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_offers_round_check CHECK(offer_round BETWEEN 1 AND 1000),
  CONSTRAINT delivery_task_offers_status_check
    CHECK(status IN ('offered','accepted','rejected','expired','withdrawn','reassigned')),
  CONSTRAINT delivery_task_offers_deadline_check
    CHECK(expires_at=offered_at+interval '60 seconds'),
  CONSTRAINT delivery_task_offers_response_check CHECK(
    (status='offered' AND responded_at IS NULL)
    OR
    (status<>'offered' AND responded_at IS NOT NULL)
  ),
  CONSTRAINT delivery_task_offers_reason_check
    CHECK(response_reason IS NULL OR char_length(response_reason)<=500)
);

CREATE UNIQUE INDEX delivery_task_offers_one_pending_per_task
  ON public.delivery_task_offers(delivery_task_id) WHERE status='offered';
CREATE INDEX delivery_task_offers_rider_status_expiry_idx
  ON public.delivery_task_offers(rider_user_id,status,expires_at);
CREATE INDEX delivery_task_offers_branch_status_expiry_idx
  ON public.delivery_task_offers(branch_id,status,expires_at);

CREATE TABLE public.delivery_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  delivery_task_id uuid NOT NULL,
  rider_user_id uuid NOT NULL,
  offer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  is_current boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT delivery_assignments_pkey PRIMARY KEY(id),
  CONSTRAINT delivery_assignments_id_task_branch_restaurant_key
    UNIQUE(id,delivery_task_id,branch_id,restaurant_id),
  CONSTRAINT delivery_assignments_offer_key UNIQUE(offer_id),
  CONSTRAINT delivery_assignments_task_fkey
    FOREIGN KEY(delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_tasks(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_assignments_rider_fkey
    FOREIGN KEY(rider_user_id,branch_id,restaurant_id)
    REFERENCES public.rider_profiles(user_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_assignments_offer_fkey
    FOREIGN KEY(offer_id,delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_task_offers(id,delivery_task_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_assignments_status_check
    CHECK(status IN ('accepted','out_for_delivery','failed','delivered','rejected','reassigned','returned')),
  CONSTRAINT delivery_assignments_current_check
    CHECK((is_current AND ended_at IS NULL) OR (NOT is_current AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX delivery_assignments_one_current_per_task
  ON public.delivery_assignments(delivery_task_id) WHERE is_current;
CREATE INDEX delivery_assignments_rider_current_idx
  ON public.delivery_assignments(rider_user_id,status) WHERE is_current;
CREATE INDEX delivery_assignments_branch_current_idx
  ON public.delivery_assignments(branch_id,status) WHERE is_current;

CREATE TABLE public.delivery_task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  delivery_task_id uuid NOT NULL,
  offer_id uuid,
  assignment_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_user_id uuid,
  actor_type text NOT NULL,
  actor_role text,
  reason_code text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT delivery_task_events_pkey PRIMARY KEY(id),
  CONSTRAINT delivery_task_events_task_fkey
    FOREIGN KEY(delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_tasks(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_events_offer_fkey
    FOREIGN KEY(offer_id,delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_task_offers(id,delivery_task_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_events_assignment_fkey
    FOREIGN KEY(assignment_id,delivery_task_id,branch_id,restaurant_id)
    REFERENCES public.delivery_assignments(id,delivery_task_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_events_actor_fkey
    FOREIGN KEY(actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_events_metadata_check
    CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT delivery_task_events_reason_check CHECK(reason IS NULL OR char_length(reason)<=500)
);

CREATE INDEX delivery_task_events_task_time_idx
  ON public.delivery_task_events(delivery_task_id,occurred_at DESC);

-- The Rider push table intentionally stores encrypted payload fields only.
-- The API must encrypt/decrypt with a server-only FLAME_CHICK_PUSH_ENCRYPTION_KEY.
CREATE TABLE public.rider_push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  rider_user_id uuid NOT NULL,
  endpoint_hash bytea NOT NULL,
  endpoint_ciphertext bytea NOT NULL,
  p256dh_ciphertext bytea NOT NULL,
  auth_ciphertext bytea NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT rider_push_subscriptions_pkey PRIMARY KEY(id),
  CONSTRAINT rider_push_subscriptions_rider_endpoint_key UNIQUE(rider_user_id,endpoint_hash),
  CONSTRAINT rider_push_subscriptions_id_rider_branch_restaurant_key
    UNIQUE(id,rider_user_id,branch_id,restaurant_id),
  CONSTRAINT rider_push_subscriptions_rider_fkey
    FOREIGN KEY(rider_user_id,branch_id,restaurant_id)
    REFERENCES public.rider_profiles(user_id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT rider_push_subscriptions_endpoint_hash_check
    CHECK(octet_length(endpoint_hash)=32),
  CONSTRAINT rider_push_subscriptions_ciphertext_check
    CHECK(
      octet_length(endpoint_ciphertext) BETWEEN 16 AND 4096
      AND octet_length(p256dh_ciphertext) BETWEEN 16 AND 1024
      AND octet_length(auth_ciphertext) BETWEEN 16 AND 1024
    ),
  CONSTRAINT rider_push_subscriptions_user_agent_check
    CHECK(user_agent IS NULL OR char_length(user_agent)<=500)
);

CREATE INDEX rider_push_subscriptions_rider_active_idx
  ON public.rider_push_subscriptions(rider_user_id,is_active);

-- ---------------------------------------------------------------------------
-- app_private: no browser schema access. RPCs in a later reviewed batch will
-- write these tables inside the same transaction as the order/task state.
-- ---------------------------------------------------------------------------

CREATE TABLE app_private.website_order_success_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'website',
  phone_digest bytea NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT website_order_success_events_pkey PRIMARY KEY(id),
  CONSTRAINT website_order_success_events_order_key UNIQUE(order_id),
  CONSTRAINT website_order_success_events_idempotency_key
    UNIQUE(restaurant_id,branch_id,idempotency_key),
  CONSTRAINT website_order_success_events_order_fkey
    FOREIGN KEY(order_id,branch_id,restaurant_id)
    REFERENCES public.orders(id,branch_id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT website_order_success_events_source_check CHECK(source='website'),
  CONSTRAINT website_order_success_events_digest_check CHECK(octet_length(phone_digest)=32),
  CONSTRAINT website_order_success_events_hash_check CHECK(request_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX website_order_success_events_phone_window_idx
  ON app_private.website_order_success_events(restaurant_id,branch_id,phone_digest,committed_at DESC);

CREATE TABLE app_private.order_number_counters (
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  business_date date NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT order_number_counters_pkey PRIMARY KEY(branch_id,business_date),
  CONSTRAINT order_number_counters_branch_fkey
    FOREIGN KEY(branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT order_number_counters_value_check CHECK(last_value>=0)
);

CREATE TABLE app_private.notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  recipient_user_id uuid,
  payload_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT notification_outbox_pkey PRIMARY KEY(id),
  CONSTRAINT notification_outbox_event_key UNIQUE(restaurant_id,event_key),
  CONSTRAINT notification_outbox_branch_fkey
    FOREIGN KEY(branch_id,restaurant_id)
    REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT notification_outbox_payload_check CHECK(jsonb_typeof(payload_safe)='object'),
  CONSTRAINT notification_outbox_status_check
    CHECK(status IN ('pending','processing','delivered','retry','dead_letter')),
  CONSTRAINT notification_outbox_attempts_check CHECK(attempts BETWEEN 0 AND 100),
  CONSTRAINT notification_outbox_error_check
    CHECK(last_error_code IS NULL OR char_length(last_error_code)<=80)
);

CREATE INDEX notification_outbox_pending_idx
  ON app_private.notification_outbox(status,next_attempt_at)
  WHERE status IN ('pending','retry');

CREATE TABLE app_private.api_rate_limit_buckets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  policy_code text NOT NULL,
  subject_digest bytea NOT NULL,
  tokens_remaining numeric(12,4) NOT NULL,
  last_refill_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT api_rate_limit_buckets_pkey PRIMARY KEY(id),
  CONSTRAINT api_rate_limit_buckets_policy_subject_key UNIQUE(policy_code,subject_digest),
  CONSTRAINT api_rate_limit_buckets_digest_check CHECK(octet_length(subject_digest)=32),
  CONSTRAINT api_rate_limit_buckets_policy_check
    CHECK(policy_code=btrim(policy_code) AND char_length(policy_code) BETWEEN 1 AND 80),
  CONSTRAINT api_rate_limit_buckets_tokens_check CHECK(tokens_remaining>=0)
);

CREATE INDEX api_rate_limit_buckets_last_seen_idx
  ON app_private.api_rate_limit_buckets(last_seen_at);

-- ---------------------------------------------------------------------------
-- Trigger helpers. Append-only records reject UPDATE/DELETE even if a later
-- server command accidentally receives broader privileges.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.transaction_timestamp();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD_CANNOT_BE_CHANGED: %.%',TG_TABLE_SCHEMA,TG_TABLE_NAME
    USING ERRCODE='55000';
END;
$function$;

REVOKE ALL ON FUNCTION app_private.touch_updated_at() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.reject_immutable_mutation() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER delivery_areas_touch_updated_at
  BEFORE UPDATE ON public.delivery_areas
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER branch_delivery_settings_touch_updated_at
  BEFORE UPDATE ON public.branch_delivery_settings
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER delivery_tasks_touch_updated_at
  BEFORE UPDATE ON public.delivery_tasks
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER rider_profiles_touch_updated_at
  BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER rider_push_subscriptions_touch_updated_at
  BEFORE UPDATE ON public.rider_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER notification_outbox_touch_updated_at
  BEFORE UPDATE ON app_private.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER api_rate_limit_buckets_touch_updated_at
  BEFORE UPDATE ON app_private.api_rate_limit_buckets
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

CREATE TRIGGER order_status_history_immutable
  BEFORE UPDATE OR DELETE ON public.order_status_history
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_immutable_mutation();
CREATE TRIGGER payments_immutable
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_immutable_mutation();
CREATE TRIGGER delivery_task_events_immutable
  BEFORE UPDATE OR DELETE ON public.delivery_task_events
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_immutable_mutation();
CREATE TRIGGER website_order_success_events_immutable
  BEFORE UPDATE OR DELETE ON app_private.website_order_success_events
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_immutable_mutation();

-- ---------------------------------------------------------------------------
-- RLS and grants. No anon/authenticated direct reads or writes. service_role
-- uses narrowly granted REST reads for the existing Edge Function projections;
-- all order/payment/delivery writes are intended to move through RPCs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branch_delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_delivery_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_task_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_task_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_task_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rider_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_push_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE app_private.website_order_success_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.website_order_success_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.order_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.order_number_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.api_rate_limit_buckets FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.delivery_areas,public.branch_delivery_settings,
  public.orders,public.order_items,public.order_item_components,public.order_item_modifiers,
  public.order_status_history,public.payments,public.rider_profiles,
  public.delivery_tasks,public.delivery_task_offers,public.delivery_assignments,
  public.delivery_task_events,public.rider_push_subscriptions
FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL PRIVILEGES ON TABLE
  app_private.website_order_success_events,app_private.order_number_counters,
  app_private.notification_outbox,app_private.api_rate_limit_buckets
FROM PUBLIC,anon,authenticated,service_role;

-- Existing API identity/branch lookups and catalog endpoint. These SELECTs are
-- server-only because anon/authenticated retain no table privileges.
GRANT SELECT ON TABLE
  public.restaurants,public.branches,public.user_profiles,public.user_roles,
  public.catalog_publications,public.catalog_current_publication,
  public.categories,public.subcategories,public.products,public.product_variants,
  public.modifier_groups,public.modifiers,public.modifier_group_assignments,
  public.modifier_price_rules,public.drink_options,public.deal_collections,
  public.deals,public.deal_variants,public.deal_component_groups,
  public.deal_component_options,public.deal_variant_component_options,
  public.catalog_schedule_sets,public.catalog_schedule_windows,
  public.deal_schedule_assignments,public.branch_product_availability,
  public.branch_variant_availability,public.branch_deal_availability,
  public.delivery_areas,public.branch_delivery_settings
TO service_role;

-- Current service-role Edge Function REST reads for POS dispatch and Rider jobs.
GRANT SELECT ON TABLE
  public.orders,public.order_items,public.order_item_components,public.order_item_modifiers,
  public.order_status_history,public.payments,public.rider_profiles,
  public.delivery_tasks,public.delivery_task_offers,public.delivery_assignments,
  public.delivery_task_events
TO service_role;

-- The current Rider presence endpoint PATCHes only these presence fields.
GRANT UPDATE(availability_status,accepting_jobs,last_seen_at,updated_at)
  ON TABLE public.rider_profiles TO service_role;

-- Push subscriptions will only become usable after the Edge Function is updated
-- to encrypt/decrypt these bytea ciphertext columns. No cleartext secret fields
-- exist in this table.
GRANT SELECT ON TABLE public.rider_push_subscriptions TO service_role;
GRANT INSERT(
  restaurant_id,branch_id,rider_user_id,endpoint_hash,endpoint_ciphertext,
  p256dh_ciphertext,auth_ciphertext,user_agent,is_active,last_seen_at,last_success_at,updated_at
) ON TABLE public.rider_push_subscriptions TO service_role;
GRANT UPDATE(
  endpoint_hash,endpoint_ciphertext,p256dh_ciphertext,auth_ciphertext,user_agent,
  is_active,last_seen_at,last_success_at,updated_at
) ON TABLE public.rider_push_subscriptions TO service_role;

ALTER TABLE public.delivery_areas OWNER TO postgres;
ALTER TABLE public.branch_delivery_settings OWNER TO postgres;
ALTER TABLE public.orders OWNER TO postgres;
ALTER TABLE public.order_items OWNER TO postgres;
ALTER TABLE public.order_item_components OWNER TO postgres;
ALTER TABLE public.order_item_modifiers OWNER TO postgres;
ALTER TABLE public.order_status_history OWNER TO postgres;
ALTER TABLE public.payments OWNER TO postgres;
ALTER TABLE public.rider_profiles OWNER TO postgres;
ALTER TABLE public.delivery_tasks OWNER TO postgres;
ALTER TABLE public.delivery_task_offers OWNER TO postgres;
ALTER TABLE public.delivery_assignments OWNER TO postgres;
ALTER TABLE public.delivery_task_events OWNER TO postgres;
ALTER TABLE public.rider_push_subscriptions OWNER TO postgres;

ALTER TABLE app_private.website_order_success_events OWNER TO postgres;
ALTER TABLE app_private.order_number_counters OWNER TO postgres;
ALTER TABLE app_private.notification_outbox OWNER TO postgres;
ALTER TABLE app_private.api_rate_limit_buckets OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- Final fail-closed verification. This deliberately does not add Realtime
-- tables or any business seed rows.
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  v_table text;
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.delivery_areas','public.branch_delivery_settings','public.orders',
    'public.order_items','public.order_item_components','public.order_item_modifiers',
    'public.order_status_history','public.payments','public.rider_profiles',
    'public.delivery_tasks','public.delivery_task_offers','public.delivery_assignments',
    'public.delivery_task_events','public.rider_push_subscriptions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname||'.'||c.relname=v_table
        AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(c.relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_RLS_OWNER_VERIFY_FAILED: %',v_table;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon','authenticated']
    LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
      LOOP
        IF pg_catalog.has_table_privilege(v_role,v_table,v_priv) THEN
          RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_BROWSER_PRIVILEGE_PRESENT: % % %',v_role,v_priv,v_table;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'app_private.website_order_success_events','app_private.order_number_counters',
    'app_private.notification_outbox','app_private.api_rate_limit_buckets'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname||'.'||c.relname=v_table
        AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(c.relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'FLAME_CHICK_PRIVATE_RLS_OWNER_VERIFY_FAILED: %',v_table;
    END IF;
  END LOOP;

  IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
     OR pg_catalog.has_schema_privilege('authenticated','app_private','USAGE')
     OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_PRIVATE_SCHEMA_EXPOSED';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.orders','DELETE')
     OR pg_catalog.has_table_privilege('service_role','public.payments','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.delivery_tasks','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.delivery_task_offers','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.delivery_assignments','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_SERVICE_ROLE_DML_TOO_BROAD';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.rider_profiles','UPDATE')
     OR NOT pg_catalog.has_column_privilege('service_role','public.rider_profiles','availability_status','UPDATE')
     OR NOT pg_catalog.has_column_privilege('service_role','public.rider_profiles','accepting_jobs','UPDATE')
     OR NOT pg_catalog.has_column_privilege('service_role','public.rider_profiles','last_seen_at','UPDATE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_RIDER_PRESENCE_GRANT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables p
    WHERE p.pubname='supabase_realtime'
      AND p.schemaname='public'
      AND p.tablename IN (
        'orders','delivery_tasks','delivery_task_offers',
        'delivery_assignments','rider_profiles','delivery_task_events'
      )
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_TABLE_ADDED_TO_REALTIME_TOO_EARLY';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders)
     OR EXISTS (SELECT 1 FROM public.delivery_tasks)
     OR EXISTS (SELECT 1 FROM public.delivery_areas)
     OR EXISTS (SELECT 1 FROM public.rider_profiles) THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_MIGRATION_MUST_NOT_SEED_ROWS';
  END IF;

  IF pg_catalog.to_regprocedure('public.flame_chick_create_order(jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.flame_chick_manage_delivery(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_OPERATIONAL_SCHEMA_RPC_NAME_COLLISION';
  END IF;
END;
$verify$;

COMMIT;
