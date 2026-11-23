#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1)
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

BRANCH_ID="b7777777-7777-4777-8777-777777777661"
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

echo "[race verification] all 4 races produced one coherent terminal state, at most one current assignment, and matching audit events"
