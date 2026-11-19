CREATE OR REPLACE FUNCTION public.hfp_create_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_source text;
  v_fulfillment text;
  v_idempotency_key text;
  v_request_hash text;
  v_existing public.orders%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_actor_user_id uuid;
  v_actor_role text;
  v_customer jsonb;
  v_delivery jsonb;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_address text;
  v_delivery_instructions text;
  v_delivery_area_id uuid;
  v_delivery_area_name text;
  v_delivery_fee numeric(12,2) := 0;
  v_delivery_lat numeric(10,7);
  v_delivery_lng numeric(10,7);
  v_table_id uuid;
  v_table_number text;
  v_payment_method text;
  v_notes text;
  v_items jsonb;
  v_item jsonb;
  v_modifiers jsonb;
  v_modifier jsonb;
  v_choices jsonb;
  v_item_id uuid;
  v_line_number integer := 0;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_base_price numeric(12,2);
  v_modifier_total numeric(12,2);
  v_modifier_price numeric(12,2);
  v_line_total numeric(12,2);
  v_product_id uuid;
  v_variant_id uuid;
  v_deal_id uuid;
  v_group_id uuid;
  v_modifier_id uuid;
  v_selected_count integer;
  v_group record;
  v_mod record;
  v_product record;
  v_variant public.product_variants%rowtype;
  v_deal public.deals%rowtype;
  v_component record;
  v_selected_product_id uuid;
  v_selected_variant_id uuid;
  v_selected_product_name text;
  v_selected_variant_label text;
  v_component_name text;
  v_component_volume text;
  v_component_snapshot jsonb;
  v_component_qty integer;
  v_currency text := 'PKR';
  v_line_kind text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST: Request body must be a JSON object.';
  end if;

  v_source := lower(coalesce(p_payload->>'source', ''));
  if v_source not in ('website','pos','whatsapp','phone','third_party','manual','other') then
    raise exception using errcode = '22023', message = 'INVALID_SOURCE: Unsupported order source.';
  end if;

  v_fulfillment := lower(coalesce(p_payload->>'fulfillment_type', ''));
  if v_fulfillment not in ('delivery','pickup','dine_in') then
    raise exception using errcode = '22023', message = 'INVALID_FULFILLMENT: Fulfilment must be delivery, pickup, or dine_in.';
  end if;

  v_idempotency_key := nullif(btrim(p_payload->>'idempotency_key'), '');
  if v_idempotency_key is null or length(v_idempotency_key) < 16 or length(v_idempotency_key) > 160 then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_REQUIRED: A 16-160 character idempotency_key is required.';
  end if;
  v_request_hash := md5(p_payload::text);

  select r.id, b.id, r.currency_code
    into v_restaurant_id, v_branch_id, v_currency
  from public.restaurants r
  join public.branches b on b.restaurant_id = r.id
  where r.slug = 'flame-chick'
    and r.is_active = true
    and b.branch_code = 'MAIN'
    and b.is_active = true
  order by b.created_at
  limit 1;

  if v_branch_id is null then
    raise exception using errcode = 'P0002', message = 'FLAME_CHICK_BRANCH_NOT_FOUND: Active Flame Chick main branch was not found.';
  end if;

  -- Serialize requests sharing the same branch/source/key so concurrent retries cannot duplicate an order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_branch_id::text || '|' || v_source || '|' || v_idempotency_key, 0)
  );

  select * into v_existing
  from public.orders
  where branch_id = v_branch_id
    and source = v_source
    and idempotency_key = v_idempotency_key;

  if found then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED: This idempotency key was already used with a different request.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'order', jsonb_build_object(
        'id', v_existing.id,
        'order_number', v_existing.order_number,
        'status', v_existing.status,
        'fulfillment_type', v_existing.fulfillment_type,
        'subtotal', v_existing.subtotal,
        'delivery_fee', v_existing.delivery_fee,
        'total', v_existing.total,
        'currency_code', v_existing.currency_code,
        'payment_status', v_existing.payment_status
      )
    );
  end if;

  v_customer := coalesce(p_payload->'customer', '{}'::jsonb);
  v_delivery := coalesce(p_payload->'delivery', '{}'::jsonb);
  if jsonb_typeof(v_customer) <> 'object' or jsonb_typeof(v_delivery) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER: Customer and delivery details must be JSON objects.';
  end if;

  v_customer_name := nullif(btrim(v_customer->>'name'), '');
  v_customer_phone := nullif(btrim(v_customer->>'phone'), '');
  v_customer_email := nullif(btrim(v_customer->>'email'), '');
  if v_customer_name is null or length(v_customer_name) > 120 then
    raise exception using errcode = '22023', message = 'CUSTOMER_NAME_REQUIRED: Customer name is required and must be 120 characters or fewer.';
  end if;
  if v_customer_phone is null or length(v_customer_phone) > 30 then
    raise exception using errcode = '22023', message = 'CUSTOMER_PHONE_REQUIRED: A valid customer phone number is required.';
  end if;
  if v_customer_email is not null and length(v_customer_email) > 254 then
    raise exception using errcode = '22023', message = 'CUSTOMER_EMAIL_INVALID: Customer email is too long.';
  end if;

  v_payment_method := lower(coalesce(p_payload->>'payment_method', case when v_source = 'website' then 'cod' else 'cash' end));
  if v_payment_method not in ('cash','card','bank_transfer','wallet','online','cod','other') then
    raise exception using errcode = '22023', message = 'PAYMENT_METHOD_INVALID: Unsupported payment method.';
  end if;

  v_notes := nullif(btrim(p_payload->>'notes'), '');
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception using errcode = '22023', message = 'ORDER_NOTES_TOO_LONG: Order notes must be 1000 characters or fewer.';
  end if;

  if v_fulfillment = 'delivery' then
    v_address := nullif(btrim(v_delivery->>'address'), '');
    if v_address is null or length(v_address) > 600 then
      raise exception using errcode = '22023', message = 'DELIVERY_ADDRESS_REQUIRED: Delivery address is required and must be 600 characters or fewer.';
    end if;
    v_delivery_area_id := nullif(v_delivery->>'area_id','')::uuid;
    if v_delivery_area_id is null then
      -- Flame Chick demo: accept a manually entered address without a configured zone.
      v_delivery_area_name := 'Manual address (demo)';
      v_delivery_fee := 0;
    else
      select da.name, da.delivery_fee
        into v_delivery_area_name, v_delivery_fee
      from public.delivery_areas da
      where da.id = v_delivery_area_id
        and da.restaurant_id = v_restaurant_id
        and da.branch_id = v_branch_id
        and da.is_active = true;

      if not found then
        raise exception using errcode = '22023', message = 'DELIVERY_AREA_UNAVAILABLE: Selected delivery area is unavailable.';
      end if;
    end if;

    v_delivery_instructions := nullif(btrim(v_delivery->>'instructions'), '');
    if v_delivery_instructions is not null and length(v_delivery_instructions) > 600 then
      raise exception using errcode = '22023', message = 'DELIVERY_INSTRUCTIONS_TOO_LONG: Delivery instructions must be 600 characters or fewer.';
    end if;
    if nullif(v_delivery->>'latitude','') is not null then
      v_delivery_lat := (v_delivery->>'latitude')::numeric;
      if v_delivery_lat < -90 or v_delivery_lat > 90 then
        raise exception using errcode = '22023', message = 'DELIVERY_COORDINATES_INVALID: Latitude is outside its valid range.';
      end if;
    end if;
    if nullif(v_delivery->>'longitude','') is not null then
      v_delivery_lng := (v_delivery->>'longitude')::numeric;
      if v_delivery_lng < -180 or v_delivery_lng > 180 then
        raise exception using errcode = '22023', message = 'DELIVERY_COORDINATES_INVALID: Longitude is outside its valid range.';
      end if;
    end if;
  elsif v_fulfillment = 'dine_in' then
    v_table_id := nullif(p_payload->>'table_id','')::uuid;
    if v_table_id is null then
      raise exception using errcode = '22023', message = 'TABLE_REQUIRED: Select a restaurant table for dine-in.';
    end if;
    select rt.table_number into v_table_number
    from public.restaurant_tables rt
    where rt.id = v_table_id and rt.branch_id = v_branch_id and rt.is_active = true;
    if not found then
      raise exception using errcode = '22023', message = 'TABLE_UNAVAILABLE: Selected table is unavailable.';
    end if;
  end if;

  v_items := p_payload->'items';
  if v_items is null or jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 40 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_INVALID: Order must contain between 1 and 40 line items.';
  end if;

  v_actor_user_id := nullif(p_payload->>'actor_user_id','')::uuid;
  if v_source in ('pos','whatsapp','phone','third_party','manual','other') then
    if v_actor_user_id is null then
      raise exception using errcode = '42501', message = 'STAFF_AUTH_REQUIRED: A signed-in staff member is required for this order source.';
    end if;
    select ur.role into v_actor_role
    from public.user_roles ur
    where ur.user_id = v_actor_user_id
      and ur.is_active = true
      and ur.role in ('owner','admin','manager','cashier')
      and (ur.branch_id is null or ur.branch_id = v_branch_id)
    order by case ur.role when 'owner' then 1 when 'admin' then 2 when 'manager' then 3 else 4 end
    limit 1;
    if v_actor_role is null then
      raise exception using errcode = '42501', message = 'STAFF_ROLE_REQUIRED: This staff account cannot create orders.';
    end if;
  end if;

  v_order_number := 'PB-' ||
    pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Karachi', 'YYMMDD') || '-' ||
    pg_catalog.lpad(pg_catalog.nextval('public.hfp_order_number_seq')::text, 5, '0');

  insert into public.orders (
    branch_id, order_number, local_order_id, idempotency_key, request_hash,
    source, source_reference, fulfillment_type, status,
    customer_name, customer_phone, customer_email,
    delivery_address, delivery_area_id, delivery_area_name_snapshot,
    delivery_area_fee_snapshot, delivery_latitude, delivery_longitude, delivery_instructions,
    table_id, table_number_snapshot,
    subtotal, discount_amount, tax_amount, service_charge, delivery_fee, tip_amount,
    total, paid_amount, balance_due, currency_code, payment_status, payment_method_summary,
    notes, promo_snapshot, address_snapshot, source_payload_snapshot,
    cashier_id, last_status_changed_by, last_status_actor_type
  ) values (
    v_branch_id, v_order_number, nullif(p_payload->>'local_order_id',''), v_idempotency_key, v_request_hash,
    v_source, nullif(p_payload->>'source_reference',''), v_fulfillment, 'new',
    v_customer_name, v_customer_phone, v_customer_email,
    v_address, v_delivery_area_id, v_delivery_area_name,
    v_delivery_fee, v_delivery_lat, v_delivery_lng, v_delivery_instructions,
    v_table_id, v_table_number,
    0, 0, 0, 0, v_delivery_fee, 0,
    v_delivery_fee, 0, v_delivery_fee, v_currency, 'unpaid', v_payment_method,
    v_notes, '{}'::jsonb,
    jsonb_build_object('address', v_address, 'area_name', v_delivery_area_name, 'area_fee', v_delivery_fee, 'table_number', v_table_number),
    jsonb_build_object('client_schema', 'hfp-order-v1', 'local_order_id', nullif(p_payload->>'local_order_id','')),
    case when v_source = 'pos' then v_actor_user_id else null end,
    null, null
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_line_number := v_line_number + 1;
    v_qty := coalesce(nullif(v_item->>'quantity','')::integer, 1);
    if v_qty < 1 or v_qty > 40 then
      raise exception using errcode = '22023', message = 'ITEM_QUANTITY_INVALID: Each line quantity must be between 1 and 40.';
    end if;

    v_line_kind := lower(coalesce(v_item->>'kind','product'));

    if v_line_kind = 'product' then
      v_product_id := nullif(v_item->>'product_id','')::uuid;
      v_variant_id := nullif(v_item->>'variant_id','')::uuid;
      if v_product_id is null or v_variant_id is null then
        raise exception using errcode = '22023', message = 'PRODUCT_VARIANT_REQUIRED: Product and selected variant are required.';
      end if;

      select p.*, v.id as selected_variant_id, v.size_key as selected_size_key,
             v.size_label as selected_size_label, v.price as selected_price
      into v_product
      from public.products p
      join public.product_variants v on v.product_id = p.id
      where p.id = v_product_id
        and v.id = v_variant_id
        and p.restaurant_id = v_restaurant_id
        and p.is_active = true and p.is_available = true
        and v.is_active = true and v.is_available = true;

      if not found then
        raise exception using errcode = '22023', message = 'PRODUCT_UNAVAILABLE: One of the selected products or variants is no longer available.';
      end if;

      v_base_price := (to_jsonb(v_product)->>'selected_price')::numeric;
      v_modifiers := coalesce(v_item->'modifiers', '[]'::jsonb);
      if jsonb_typeof(v_modifiers) <> 'array' or jsonb_array_length(v_modifiers) > 20 then
        raise exception using errcode = '22023', message = 'MODIFIERS_INVALID: Modifier selections must be an array of at most 20 selections.';
      end if;

      -- Enforce each product's configured minimum and maximum selections.
      for v_group in
        select mg.id, mg.name_en, mg.min_select, mg.max_select
        from public.modifier_group_assignments a
        join public.modifier_groups mg on mg.id = a.modifier_group_id
        where a.product_id = v_product_id and a.is_active = true and mg.is_active = true
      loop
        select count(*) into v_selected_count
        from jsonb_array_elements(v_modifiers) sel(value)
        where sel.value->>'group_id' = v_group.id::text;
        if v_selected_count < v_group.min_select then
          raise exception using errcode = '22023', message = 'MODIFIER_REQUIRED: Select the required option for ' || v_group.name_en || '.';
        end if;
        if v_selected_count > v_group.max_select then
          raise exception using errcode = '22023', message = 'MODIFIER_LIMIT_EXCEEDED: Too many selections for ' || v_group.name_en || '.';
        end if;
      end loop;

      insert into public.order_items (
        order_id, line_number, product_id, product_variant_id, quantity,
        product_name_snapshot, variant_label_snapshot, unit_price_snapshot,
        discount_amount, tax_amount, line_total, item_notes, item_snapshot
      ) values (
        v_order_id, v_line_number, v_product_id, v_variant_id, v_qty,
        v_product.name_en, (to_jsonb(v_product)->>'selected_size_label'), v_base_price,
        0, 0, v_base_price * v_qty, nullif(btrim(v_item->>'notes'),''),
        jsonb_build_object(
          'product_id', v_product_id, 'variant_id', v_variant_id,
          'product_legacy_id', v_product.legacy_id,
          'variant_legacy_id', (select legacy_id from public.product_variants where id = v_variant_id),
          'size_key', (to_jsonb(v_product)->>'selected_size_key'),
          'base_unit_price', v_base_price
        )
      ) returning id into v_item_id;

      v_modifier_total := 0;
      for v_modifier in select value from jsonb_array_elements(v_modifiers)
      loop
        v_group_id := nullif(v_modifier->>'group_id','')::uuid;
        v_modifier_id := nullif(v_modifier->>'modifier_id','')::uuid;
        if v_group_id is null or v_modifier_id is null then
          raise exception using errcode = '22023', message = 'MODIFIER_SELECTION_INVALID: Each modifier needs a group_id and modifier_id.';
        end if;

        select mg.name_en as group_name, mg.id as group_id, m.name_en as modifier_name,
               m.legacy_id as modifier_legacy_id, m.price_mode, m.fixed_price,
               mg.max_select
        into v_mod
        from public.modifier_groups mg
        join public.modifiers m on m.modifier_group_id = mg.id
        join public.modifier_group_assignments a on a.modifier_group_id = mg.id and a.product_id = v_product_id
        where mg.id = v_group_id and m.id = v_modifier_id
          and mg.is_active = true and m.is_active = true and a.is_active = true;

        if not found then
          raise exception using errcode = '22023', message = 'MODIFIER_NOT_ALLOWED: A selected extra is not assigned to this product.';
        end if;

        case upper(v_mod.price_mode)
          when 'FREE' then v_modifier_price := 0;
          when 'FIXED' then v_modifier_price := coalesce(v_mod.fixed_price, 0);
          when 'BY_SIZE' then
            select mpr.price into v_modifier_price
            from public.modifier_price_rules mpr
            where mpr.modifier_id = v_modifier_id
              and mpr.size_key = (to_jsonb(v_product)->>'selected_size_key');
            if not found then
              raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MISSING: No size-specific price exists for a selected extra.';
            end if;
          else
            raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MODE_INVALID: A selected extra has an unsupported pricing mode.';
        end case;

        insert into public.order_item_modifiers (
          order_item_id, order_item_component_id, modifier_group_id, modifier_id,
          quantity, modifier_group_name_snapshot, modifier_name_snapshot,
          unit_price_snapshot, total_price_snapshot, modifier_snapshot
        ) values (
          v_item_id, null, v_group_id, v_modifier_id,
          v_qty, v_mod.group_name, v_mod.modifier_name,
          v_modifier_price, v_modifier_price * v_qty,
          jsonb_build_object(
            'modifier_legacy_id', v_mod.modifier_legacy_id,
            'price_mode', v_mod.price_mode,
            'size_key', (to_jsonb(v_product)->>'selected_size_key'),
            'unit_price', v_modifier_price
          )
        );
        v_modifier_total := v_modifier_total + v_modifier_price;
      end loop;

      v_line_total := (v_base_price + v_modifier_total) * v_qty;
      update public.order_items
      set line_total = v_line_total,
          item_snapshot = item_snapshot || jsonb_build_object('modifier_total_per_unit', v_modifier_total)
      where id = v_item_id;
      v_subtotal := v_subtotal + v_line_total;

    elsif v_line_kind = 'deal' then
      v_deal_id := nullif(v_item->>'deal_id','')::uuid;
      select * into v_deal
      from public.deals d
      where d.id = v_deal_id
        and d.restaurant_id = v_restaurant_id
        and d.is_active = true and d.is_available = true;

      if not found then
        raise exception using errcode = '22023', message = 'DEAL_UNAVAILABLE: One of the selected deals is no longer available.';
      end if;

      v_base_price := v_deal.bundle_price;
      v_line_total := v_base_price * v_qty;

      insert into public.order_items (
        order_id, line_number, deal_id, quantity, deal_title_snapshot,
        unit_price_snapshot, discount_amount, tax_amount, line_total, item_snapshot
      ) values (
        v_order_id, v_line_number, v_deal_id, v_qty, v_deal.title,
        v_base_price, 0, 0, v_line_total,
        jsonb_build_object('deal_id', v_deal_id, 'deal_legacy_id', v_deal.legacy_id, 'bundle_price', v_base_price)
      ) returning id into v_item_id;

      v_choices := coalesce(v_item->'choices','{}'::jsonb);
      if jsonb_typeof(v_choices) <> 'object' then
        raise exception using errcode = '22023', message = 'DEAL_CHOICES_INVALID: Deal choices must be an object keyed by deal component ID.';
      end if;

      for v_component in
        select dc.*
        from public.deal_components dc
        where dc.deal_id = v_deal_id
        order by dc.sort_order, dc.id
      loop
        v_selected_product_id := null;
        v_selected_variant_id := null;
        v_selected_product_name := null;
        v_selected_variant_label := null;
        v_component_name := coalesce(nullif(v_component.description_phrase,''), nullif(v_component.display_name,''));
        v_component_volume := v_component.volume_key;
        v_component_qty := v_component.quantity * v_qty;

        if v_component.ref_type = 'FIXED_PRODUCT' then
          select p.id, p.name_en, vx.id, vx.size_label
          into v_selected_product_id, v_selected_product_name, v_selected_variant_id, v_selected_variant_label
          from public.products p
          left join lateral (
            select vv.id, vv.size_label
            from public.product_variants vv
            where vv.product_id = p.id and vv.is_active = true and vv.is_available = true
            order by vv.sort_order, vv.id
            limit 1
          ) vx on true
          where p.id = v_component.product_id
            and p.is_active = true and p.is_available = true;

          if not found then
            raise exception using errcode = '22023', message = 'DEAL_COMPONENT_UNAVAILABLE: A fixed product in this deal is no longer available.';
          end if;
          v_component_name := coalesce(v_selected_product_name, v_component_name);

        elsif v_component.ref_type = 'FIXED_VARIANT' then
          select p.id, p.name_en, vv.id, vv.size_label
          into v_selected_product_id, v_selected_product_name, v_selected_variant_id, v_selected_variant_label
          from public.product_variants vv
          join public.products p on p.id = vv.product_id
          where vv.id = v_component.product_variant_id
            and vv.is_active = true and vv.is_available = true
            and p.is_active = true and p.is_available = true;

          if not found then
            raise exception using errcode = '22023', message = 'DEAL_COMPONENT_UNAVAILABLE: A fixed variant in this deal is no longer available.';
          end if;
          v_component_name := coalesce(v_selected_product_name, v_component_name);

        elsif v_component.ref_type = 'CHOICE_BY_SIZE' then
          v_variant_id := nullif(v_choices->>v_component.id::text,'')::uuid;
          if v_variant_id is null then
            raise exception using errcode = '22023', message = 'DEAL_CHOICE_REQUIRED: Complete all required product selections for the selected deal.';
          end if;

          select p.id, p.name_en, vv.id, vv.size_label
          into v_selected_product_id, v_selected_product_name, v_selected_variant_id, v_selected_variant_label
          from public.product_variants vv
          join public.products p on p.id = vv.product_id
          where vv.id = v_variant_id
            and vv.size_key = v_component.size_key
            and p.subcategory_id = v_component.pool_subcategory_id
            and vv.is_active = true and vv.is_available = true
            and p.is_active = true and p.is_available = true;

          if not found then
            raise exception using errcode = '22023', message = 'DEAL_CHOICE_INVALID: A selected deal product does not match the required category and size.';
          end if;
          v_component_name := coalesce(v_selected_product_name, v_component_name);

        elsif v_component.ref_type = 'DRINK_INCLUDED' then
          -- Current HFP deal definitions include a drink volume as a fixed bundle component.
          -- There are no DrinkOptions rows yet, and the website does not ask customers to choose a drink flavour.
          v_component_name := coalesce(v_component_name, 'Included drink');

        else
          raise exception using errcode = '22023', message = 'DEAL_COMPONENT_UNSUPPORTED: This deal contains an unsupported component type.';
        end if;

        v_component_snapshot := jsonb_build_object(
          'deal_component_id', v_component.id,
          'legacy_id', v_component.legacy_id,
          'ref_type', v_component.ref_type,
          'description_phrase', v_component.description_phrase,
          'volume_key', v_component.volume_key
        );

        insert into public.order_item_components (
          order_item_id, deal_component_id, component_type,
          selected_product_id, selected_variant_id, selected_drink_option_id,
          quantity, name_snapshot, variant_snapshot, volume_snapshot,
          unit_price_snapshot, component_snapshot
        ) values (
          v_item_id, v_component.id, v_component.component_type,
          v_selected_product_id, v_selected_variant_id, null,
          v_component_qty, coalesce(v_component_name, v_component.component_type),
          v_selected_variant_label, v_component_volume,
          0, v_component_snapshot
        );
      end loop;

      v_subtotal := v_subtotal + v_line_total;
    else
      raise exception using errcode = '22023', message = 'ORDER_LINE_KIND_INVALID: Each order line must be product or deal.';
    end if;
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      delivery_area_fee_snapshot = v_delivery_fee,
      total = v_subtotal + v_delivery_fee,
      balance_due = v_subtotal + v_delivery_fee,
      address_snapshot = jsonb_build_object(
        'address', v_address,
        'area_id', v_delivery_area_id,
        'area_name', v_delivery_area_name,
        'delivery_fee', v_delivery_fee,
        'instructions', v_delivery_instructions,
        'table_number', v_table_number
      )
  where id = v_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'source', v_order.source,
      'fulfillment_type', v_order.fulfillment_type,
      'subtotal', v_order.subtotal,
      'delivery_fee', v_order.delivery_fee,
      'total', v_order.total,
      'currency_code', v_order.currency_code,
      'payment_status', v_order.payment_status,
      'created_at', v_order.created_at
    )
  );
end;
$function$
;