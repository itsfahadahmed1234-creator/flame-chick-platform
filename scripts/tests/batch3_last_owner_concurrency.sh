#!/usr/bin/env bash
# Batch 3 last-active-Owner concurrency regression test.
# DESTRUCTIVE TO THE TWO SUPPLIED TEST OWNER ASSIGNMENTS.
# Run ONLY against an isolated, disposable PostgreSQL staging database.
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to an isolated disposable staging database}"
: "${RESTAURANT_ID:?Set RESTAURANT_ID for the disposable test restaurant}"
: "${OWNER_ROLE_ID_A:?Set OWNER_ROLE_ID_A to the first active Owner assignment UUID}"
: "${OWNER_ROLE_ID_B:?Set OWNER_ROLE_ID_B to the second active Owner assignment UUID}"
: "${ADMIN_USER_ID:?Set ADMIN_USER_ID to an active restaurant-wide Admin/Owner actor UUID}"

command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*|*staging*|*test*) ;;
  *)
    echo "Refusing a DATABASE_URL not visibly marked local/staging/test." >&2
    echo "Use a dedicated disposable staging database; never Production." >&2
    exit 2
    ;;
esac

export PGAPPNAME="batch3-owner-concurrency"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
  DO \$guard\$
  DECLARE v_count integer;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE id IN ('$OWNER_ROLE_ID_A'::uuid, '$OWNER_ROLE_ID_B'::uuid)
        AND restaurant_id = '$RESTAURANT_ID'::uuid
        AND role_key = 'owner' AND branch_id IS NULL AND is_active
      GROUP BY restaurant_id HAVING count(*) = 2
    ) THEN
      RAISE EXCEPTION 'Fixture must contain exactly the two supplied active Owner assignments';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE restaurant_id = '$RESTAURANT_ID'::uuid
        AND user_id = '$ADMIN_USER_ID'::uuid
        AND role_key = 'admin' AND branch_id IS NULL AND is_active
    ) THEN
      RAISE EXCEPTION 'ADMIN_USER_ID must have an active restaurant-wide Admin assignment';
    END IF;
  END
  \$guard\$;
"

lock_key="flame-chick:role-restaurant:$RESTAURANT_ID"
echo "1/4 Acquiring the exact restaurant advisory lock in a blocker session..."
PGAPPNAME="batch3-owner-lock-blocker" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
  BEGIN;
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('$lock_key', 0)
  );
  SELECT pg_catalog.pg_sleep(12);
  COMMIT;
" &
blocker_pid=$!

cleanup() {
  if kill -0 "$blocker_pid" 2>/dev/null; then
    kill "$blocker_pid" 2>/dev/null || true
  fi
  wait "$blocker_pid" 2>/dev/null || true
}
trap cleanup EXIT

sleep 2
echo "2/4 Launching two independent Owner-deactivation statements while the lock is held..."
deactivate_owner() {
  local role_id="$1"
  local request_id
  request_id="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)"
  PGAPPNAME="batch3-owner-race-$role_id" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
    UPDATE public.user_roles
       SET is_active = false,
           disabled_by = '$ADMIN_USER_ID'::uuid,
           disabled_reason = 'Disposable concurrency regression test',
           disabled_request_id = '$request_id'::uuid
     WHERE id = '$role_id'::uuid
       AND restaurant_id = '$RESTAURANT_ID'::uuid
       AND role_key = 'owner'
       AND is_active;
  "
}

deactivate_owner "$OWNER_ROLE_ID_A" &
pid_a=$!
deactivate_owner "$OWNER_ROLE_ID_B" &
pid_b=$!

echo "3/4 Waiting for both independent statements to finish after the blocker releases..."
wait "$pid_a"
status_a=$?
wait "$pid_b"
status_b=$?
wait "$blocker_pid"
blocker_pid=""

echo "Session exit statuses: A=$status_a B=$status_b"
active_owners="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
  SELECT count(*)
  FROM public.user_roles
  WHERE restaurant_id = '$RESTAURANT_ID'::uuid
    AND role_key = 'owner' AND branch_id IS NULL AND is_active;
")"

echo "4/4 Active restaurant-wide Owners after race: $active_owners"
if [[ "$active_owners" -lt 1 ]]; then
  echo "FAIL: concurrent requests removed the last active Owner." >&2
  echo "This is the expected regression signal for the current trigger-level lock design." >&2
  exit 1
fi

if [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]]; then
  echo "PASS: both requests reported success but at least one Owner remains; inspect whether one update was a no-op."
else
  echo "PASS: at least one concurrent request was rejected and an active Owner remains."
fi
echo "Fixture is intentionally left in its post-test state. Destroy/recreate the disposable fixture before rerunning."
