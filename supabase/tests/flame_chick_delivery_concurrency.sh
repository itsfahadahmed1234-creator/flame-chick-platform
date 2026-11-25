#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1)
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

BRANCH_ID="10000000-0000-4000-8000-000000000001"
RIDER1="b7777777-7777-4777-8777-777777777671"
RIDER2="b7777777-7777-4777-8777-777777777672"
RIDER3="b7777777-7777-4777-8777-777777777674"
RIDER4="b7777777-7777-4777-8777-777777777675"
TASK1="b7777777-7777-4777-8777-777777777690"
TASK2="b7777777-7777-4777-8777-777777777691"
TASK3="b7777777-7777-4777-8777-777777777692"
TASK4="b7777777-7777-4777-8777-777777777693"

query() { "${PSQL[@]}" -c "$1"; }
scalar() { query "$1" | tail -n 1; }
offer_for() { scalar "SELECT id FROM public.delivery_task_offers WHERE delivery_task_id='$1' AND status='offered'"; }
expiry_for() { scalar "SELECT expires_at::text FROM public.delivery_task_offers WHERE id='$1'"; }
before_expiry_for() { scalar "SELECT (expires_at-interval '1 microsecond')::text FROM public.delivery_task_offers WHERE id='$1'"; }

LAST_PID=""
start_session() {
  local app="$1" sql="$2" output="$3"
  PGAPPNAME="$app" "${PSQL[@]}" -c "$sql" >"$output" 2>&1 &
  LAST_PID=$!
}

wait_for_event() {
  local app="$1" event="$2" pid="$3" count
  for _ in $(seq 1 120); do
    if [[ "$event" == "Lock" ]]; then
      count="$(scalar "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='$app' AND wait_event_type='Lock'")"
    else
      count="$(scalar "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='$app' AND wait_event='$event'")"
    fi
    if [[ "$count" -gt 0 ]]; then return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Session $app ended before reaching expected wait event $event" >&2
      cat "$TMP_DIR/$app.log" >&2 || true
      return 1
    fi
    sleep 0.025
  done
  echo "Timed out waiting for $app to reach PostgreSQL wait event $event" >&2
  cat "$TMP_DIR/$app.log" >&2 || true
  return 1
}

json_from() {
  local file="$1"
  grep -E '^[{]' "$file" | tail -n 1
}
assert_json() {
  local file="$1" expression="$2" label="$3" json
  json="$(json_from "$file")"
  if [[ -z "$json" ]] || ! jq -e "$expression" >/dev/null <<<"$json"; then
    echo "Assertion failed: $label" >&2
    echo "JSON: ${json:-<missing>}" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}
assert_database_state() {
  local task="$1" rider="$2" expected_offer="$3" expected_task="$4"
  local expected_current="$5" expected_rider="$6" expected_accept="$7"
  local expected_decline="$8" expected_expired="$9" label="${10}"
  local json
  json="$(query "
    SELECT pg_catalog.jsonb_build_object(
      'offer_status',o.status,
      'task_status',t.status,
      'order_status',ord.status,
      'current_assignments',(SELECT count(*) FROM public.delivery_assignments da WHERE da.delivery_task_id=t.id AND da.is_current),
      'rider_status',rp.availability_status,
      'accepted_events',(SELECT count(*) FROM public.delivery_task_events e WHERE e.delivery_task_id=t.id AND e.event_type='offer_accepted'),
      'declined_events',(SELECT count(*) FROM public.delivery_task_events e WHERE e.delivery_task_id=t.id AND e.event_type='offer_declined'),
      'expired_events',(SELECT count(*) FROM public.delivery_task_events e WHERE e.delivery_task_id=t.id AND e.event_type='offer_expired')
    )
    FROM public.delivery_tasks t
    JOIN public.delivery_task_offers o ON o.delivery_task_id=t.id
    JOIN public.orders ord ON ord.id=t.order_id
    JOIN public.rider_profiles rp ON rp.user_id='$rider' AND rp.branch_id=t.branch_id
    WHERE t.id='$task'
  ")" 
  if ! jq -e "
    .offer_status==\"$expected_offer\" and
    .task_status==\"$expected_task\" and
    .order_status==\"ready\" and
    .current_assignments==$expected_current and
    .rider_status==\"$expected_rider\" and
    .accepted_events==$expected_accept and
    .declined_events==$expected_decline and
    .expired_events==$expected_expired
  " >/dev/null <<<"$json"; then
    echo "Final database state mismatch: $label" >&2
    echo "$json" | jq . >&2 || echo "$json" >&2
    exit 1
  fi
}

echo "[race 1/4] Rider accept wins against concurrent decline"
OFFER1="$(offer_for "$TASK1")"
EXP1="$(before_expiry_for "$OFFER1")"
SQL_A1="BEGIN; SELECT set_config('test.delivery.clock_now','$EXP1',true); SELECT set_config('test.delivery.race_delay','on',true); SELECT public.flame_chick_accept_delivery_offer('$OFFER1','$RIDER1',gen_random_uuid()); COMMIT;"
SQL_B1="BEGIN; SELECT public.flame_chick_decline_delivery_offer('$OFFER1','$RIDER1','Concurrent decline contender',gen_random_uuid()); COMMIT;"
start_session race1_accept "$SQL_A1" "$TMP_DIR/race1_accept.log"
PID_A1="$LAST_PID"
wait_for_event race1_accept PgSleep "$PID_A1"
start_session race1_decline "$SQL_B1" "$TMP_DIR/race1_decline.log"
PID_B1="$LAST_PID"
wait_for_event race1_decline Lock "$PID_B1"
wait "$PID_B1"
wait "$PID_A1"
assert_json "$TMP_DIR/race1_accept.log" '.ok==true and .task_status=="accepted"' "race1 accepting rider succeeds"
assert_json "$TMP_DIR/race1_decline.log" '.ok==false and .error.code=="DELIVERY_OFFER_ALREADY_RESOLVED"' "race1 decline loses cleanly"
assert_database_state "$TASK1" "$RIDER1" accepted accepted 1 busy 1 0 0 "accept over decline"

echo "[race 2/4] Rider decline wins against concurrent accept"
OFFER2="$(offer_for "$TASK2")"
SQL_A2="BEGIN; SELECT set_config('test.delivery.race_delay','on',true); SELECT public.flame_chick_decline_delivery_offer('$OFFER2','$RIDER2','Concurrent decline winner',gen_random_uuid()); COMMIT;"
SQL_B2="BEGIN; SELECT public.flame_chick_accept_delivery_offer('$OFFER2','$RIDER2',gen_random_uuid()); COMMIT;"
start_session race2_decline "$SQL_A2" "$TMP_DIR/race2_decline.log"
PID_A2="$LAST_PID"
wait_for_event race2_decline PgSleep "$PID_A2"
start_session race2_accept "$SQL_B2" "$TMP_DIR/race2_accept.log"
PID_B2="$LAST_PID"
wait_for_event race2_accept Lock "$PID_B2"
wait "$PID_B2"
wait "$PID_A2"
assert_json "$TMP_DIR/race2_decline.log" '.ok==true and .offer_status=="rejected" and .task_status=="dispatch_pending"' "race2 decline succeeds"
assert_json "$TMP_DIR/race2_accept.log" '.ok==false and .error.code=="DELIVERY_OFFER_ALREADY_RESOLVED"' "race2 accept loses cleanly"
assert_database_state "$TASK2" "$RIDER2" rejected dispatch_pending 0 available 0 1 0 "decline over accept"

echo "[race 3/4] Rider accept holds task lock; expiry sweep uses SKIP LOCKED"
OFFER3="$(offer_for "$TASK3")"
EXP3_BEFORE="$(before_expiry_for "$OFFER3")"
EXP3_AT="$(expiry_for "$OFFER3")"
SQL_A3="BEGIN; SELECT set_config('test.delivery.clock_now','$EXP3_BEFORE',true); SELECT set_config('test.delivery.race_delay','on',true); SELECT public.flame_chick_accept_delivery_offer('$OFFER3','$RIDER3',gen_random_uuid()); COMMIT;"
SQL_B3="BEGIN; SELECT set_config('test.delivery.clock_now','$EXP3_AT',true); SELECT public.flame_chick_expire_delivery_offers('$BRANCH_ID',100); COMMIT;"
start_session race3_accept "$SQL_A3" "$TMP_DIR/race3_accept.log"
PID_A3="$LAST_PID"
wait_for_event race3_accept PgSleep "$PID_A3"
start_session race3_expiry "$SQL_B3" "$TMP_DIR/race3_expiry.log"
PID_B3="$LAST_PID"
wait "$PID_B3"
if ! kill -0 "$PID_A3" 2>/dev/null; then
  echo "Expiry sweep did not complete while acceptance held its row lock" >&2
  cat "$TMP_DIR/race3_accept.log" "$TMP_DIR/race3_expiry.log" >&2
  exit 1
fi
wait "$PID_A3"
assert_json "$TMP_DIR/race3_accept.log" '.ok==true and .task_status=="accepted"' "race3 accept before expiry succeeds"
assert_json "$TMP_DIR/race3_expiry.log" '.ok==true and .expired_count==0' "race3 expiry sweep skips the locked task"
assert_database_state "$TASK3" "$RIDER3" accepted accepted 1 busy 1 0 0 "accept beats skip-locked expiry"

echo "[race 4/4] Expiry sweep wins while accept waits on the same task"
OFFER4="$(offer_for "$TASK4")"
EXP4_AT="$(expiry_for "$OFFER4")"
SQL_A4="BEGIN; SELECT set_config('test.delivery.clock_now','$EXP4_AT',true); SELECT set_config('test.delivery.race_delay','on',true); SELECT public.flame_chick_expire_delivery_offers('$BRANCH_ID',100); COMMIT;"
SQL_B4="BEGIN; SELECT set_config('test.delivery.clock_now','$EXP4_AT',true); SELECT public.flame_chick_accept_delivery_offer('$OFFER4','$RIDER4',gen_random_uuid()); COMMIT;"
start_session race4_expiry "$SQL_A4" "$TMP_DIR/race4_expiry.log"
PID_A4="$LAST_PID"
wait_for_event race4_expiry PgSleep "$PID_A4"
start_session race4_accept "$SQL_B4" "$TMP_DIR/race4_accept.log"
PID_B4="$LAST_PID"
wait_for_event race4_accept Lock "$PID_B4"
wait "$PID_B4"
wait "$PID_A4"
assert_json "$TMP_DIR/race4_expiry.log" '.ok==true and .expired_count==1' "race4 expiry sweep expires exactly one offer"
assert_json "$TMP_DIR/race4_accept.log" '.ok==false and .error.code=="DELIVERY_OFFER_ALREADY_RESOLVED"' "race4 accept loses cleanly after expiry"
assert_database_state "$TASK4" "$RIDER4" expired dispatch_pending 0 available 0 0 1 "expiry over accept"


assert_payment_state() {
  local order="$1" expected_status="$2" expected_payment="$3"
  local expected_paid="$4" expected_due="$5" expected_count="$6" expected_history="$7" label="$8" json
  json="$(query "
    SELECT pg_catalog.jsonb_build_object(
      'order_status',o.status,
      'payment_status',o.payment_status,
      'paid_amount',o.paid_amount,
      'balance_due',o.balance_due,
      'completed_at_is_null',o.completed_at IS NULL,
      'payment_count',(SELECT count(*) FROM public.payments p WHERE p.order_id=o.id AND p.entry_type='collection'),
      'payment_total',(SELECT COALESCE(sum(p.amount),0) FROM public.payments p WHERE p.order_id=o.id AND p.entry_type='collection'),
      'history_count',(SELECT count(*) FROM public.order_status_history h WHERE h.order_id=o.id)
    )
    FROM public.orders o WHERE o.id='$order'
  ")"
  if ! jq -e "
    .order_status==\"$expected_status\" and
    .payment_status==\"$expected_payment\" and
    .paid_amount==$expected_paid and
    .balance_due==$expected_due and
    .completed_at_is_null==true and
    .payment_count==$expected_count and
    .payment_total==$expected_paid and
    .history_count==$expected_history
  " >/dev/null <<<"$json"; then
    echo "Payment race database state mismatch: $label" >&2
    echo "$json" | jq . >&2 || echo "$json" >&2
    exit 1
  fi
}

echo "[payment race 5/6] Concurrent identical Cashier retries create one collection"
PAYMENT_ORDER5="b7777777-7777-4777-8777-777777777684"
SHARED_REQUEST="c8888888-8888-4888-8888-888888888881"
SQL_P5A="BEGIN; SELECT set_config('test.payment.race_delay','on',true); SELECT public.flame_chick_collect_order_payment(jsonb_build_object('order_id','$PAYMENT_ORDER5','actor_user_id','b7777777-7777-4777-8777-777777777673','request_id','$SHARED_REQUEST','amount',60,'payment_method','cash')); COMMIT;"
SQL_P5B="BEGIN; SELECT public.flame_chick_collect_order_payment(jsonb_build_object('order_id','$PAYMENT_ORDER5','actor_user_id','b7777777-7777-4777-8777-777777777673','request_id','$SHARED_REQUEST','amount',60,'payment_method','cash')); COMMIT;"
start_session payment5_first "$SQL_P5A" "$TMP_DIR/payment5_first.log"
PID_P5A="$LAST_PID"
wait_for_event payment5_first PgSleep "$PID_P5A"
start_session payment5_retry "$SQL_P5B" "$TMP_DIR/payment5_retry.log"
PID_P5B="$LAST_PID"
wait_for_event payment5_retry Lock "$PID_P5B"
wait "$PID_P5B"
wait "$PID_P5A"
assert_json "$TMP_DIR/payment5_first.log" '.ok==true and .already_processed==false and .balance_due==40' "payment race5 original collection succeeds"
assert_json "$TMP_DIR/payment5_retry.log" '.ok==true and .already_processed==true and .balance_due==40' "payment race5 duplicate request returns original collection"
assert_payment_state "$PAYMENT_ORDER5" delivered partially_paid 60 40 1 1 "concurrent duplicate payment request"

echo "[payment race 6/6] Concurrent different Cashier submissions cannot over-collect"
PAYMENT_ORDER6="b7777777-7777-4777-8777-777777777685"
SQL_P6A="BEGIN; SELECT set_config('test.payment.race_delay','on',true); SELECT public.flame_chick_collect_order_payment(jsonb_build_object('order_id','$PAYMENT_ORDER6','actor_user_id','b7777777-7777-4777-8777-777777777673','request_id','c8888888-8888-4888-8888-888888888882','amount',60,'payment_method','cash')); COMMIT;"
SQL_P6B="BEGIN; SELECT public.flame_chick_collect_order_payment(jsonb_build_object('order_id','$PAYMENT_ORDER6','actor_user_id','b7777777-7777-4777-8777-777777777673','request_id','c8888888-8888-4888-8888-888888888883','amount',60,'payment_method','card')); COMMIT;"
start_session payment6_first "$SQL_P6A" "$TMP_DIR/payment6_first.log"
PID_P6A="$LAST_PID"
wait_for_event payment6_first PgSleep "$PID_P6A"
start_session payment6_overpay "$SQL_P6B" "$TMP_DIR/payment6_overpay.log"
PID_P6B="$LAST_PID"
wait_for_event payment6_overpay Lock "$PID_P6B"
wait "$PID_P6B"
wait "$PID_P6A"
assert_json "$TMP_DIR/payment6_first.log" '.ok==true and .already_processed==false and .balance_due==40' "payment race6 first collection succeeds"
assert_json "$TMP_DIR/payment6_overpay.log" '.ok==false and .error.code=="PAYMENT_AMOUNT_EXCEEDS_BALANCE"' "payment race6 second stale collection is rejected"
assert_payment_state "$PAYMENT_ORDER6" delivered partially_paid 60 40 1 1 "concurrent over-collection rejected"

echo "[race verification] all 4 delivery races and 2 payment races produced coherent terminal states and matching ledger/audit records"
