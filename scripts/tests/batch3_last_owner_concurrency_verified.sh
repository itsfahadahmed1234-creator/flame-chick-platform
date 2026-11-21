#!/usr/bin/env bash
# Batch 3 last-active-Owner concurrency regression test.
# DESTRUCTIVE TO THE TWO SUPPLIED TEST OWNER ASSIGNMENTS.
# Run ONLY against an isolated, disposable local/staging PostgreSQL database.
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to an isolated disposable staging database}"
: "${RESTAURANT_ID:?Set RESTAURANT_ID for the disposable test restaurant}"
: "${OWNER_ROLE_ID_A:?Set OWNER_ROLE_ID_A to the first active Owner assignment UUID}"
: "${OWNER_ROLE_ID_B:?Set OWNER_ROLE_ID_B to the second active Owner assignment UUID}"
: "${ADMIN_USER_ID:?Set ADMIN_USER_ID to an active restaurant-wide Admin actor UUID}"

command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*|*staging*|*test*) ;;
  *)
    echo "Refusing a DATABASE_URL not visibly marked local/staging/test." >&2
    echo "Never run this destructive fixture test against a live Production database." >&2
    exit 2
    ;;
esac

for value in "$RESTAURANT_ID" "$OWNER_ROLE_ID_A" "$OWNER_ROLE_ID_B" "$ADMIN_USER_ID"; do
  [[ "$value" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "Expected UUID fixture values." >&2; exit 2; }
done
[[ "$OWNER_ROLE_ID_A" != "$OWNER_ROLE_ID_B" ]] || { echo "Owner role IDs must differ." >&2; exit 2; }

export PGAPPNAME="batch3-owner-concurrency"
log_a="$(mktemp)"
log_b="$(mktemp)"
blocker_pid=""
cleanup() {
  if [[ -n "$blocker_pid" ]] && kill -0 "$blocker_pid" 2>/dev/null; then
    kill "$blocker_pid" 2>/dev/null || true
  fi
  if [[ -n "$blocker_pid" ]]; then wait "$blocker_pid" 2>/dev/null || true; fi
  rm -f "$log_a" "$log_b"
}
trap cleanup EXIT

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
  DO \$guard\$
  BEGIN
    IF (SELECT count(*) FROM public.user_roles
        WHERE id IN ('$OWNER_ROLE_ID_A'::uuid, '$OWNER_ROLE_ID_B'::uuid)
          AND restaurant_id = '$RESTAURANT_ID'::uuid
          AND role_key = 'owner' AND branch_id IS NULL AND is_active) <> 2 THEN
      RAISE EXCEPTION 'Fixture must contain both supplied active Owner assignments';
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

sleep 2
echo "2/4 Launching two independent Owner-deactivation statements while the lock is held..."
deactivate_owner() {
  local role_id="$1"
  local logfile="$2"
  local request_id
  if command -v uuidgen >/dev/null; then
    request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    request_id="$(date +%s%N)"
  fi
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
  " >"$logfile" 2>&1
}

deactivate_owner "$OWNER_ROLE_ID_A" "$log_a" &
pid_a=$!
deactivate_owner "$OWNER_ROLE_ID_B" "$log_b" &
pid_b=$!

echo "3/4 Waiting for both independent statements..."
if wait "$pid_a"; then status_a=0; else status_a=$?; fi
if wait "$pid_b"; then status_b=0; else status_b=$?; fi
if wait "$blocker_pid"; then blocker_status=0; else blocker_status=$?; fi
blocker_pid=""

cat "$log_a" "$log_b"
echo "Session exit statuses: A=$status_a B=$status_b (blocker=$blocker_status)"
active_owners="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAtc "
  SELECT count(*)
  FROM public.user_roles
  WHERE restaurant_id = '$RESTAURANT_ID'::uuid
    AND role_key = 'owner' AND branch_id IS NULL AND is_active;
")"

echo "4/4 Active restaurant-wide Owners after race: $active_owners"
rejected_a=0
rejected_b=0
grep -q 'LAST_ACTIVE_OWNER_PROTECTED' "$log_a" && rejected_a=1 || true
grep -q 'LAST_ACTIVE_OWNER_PROTECTED' "$log_b" && rejected_b=1 || true

if [[ "$active_owners" -ne 1 || "$blocker_status" -ne 0 ]]; then
  echo "FAIL: expected exactly one active Owner and a clean blocker session." >&2
  exit 1
fi
if ! { [[ "$status_a" -eq 0 && "$rejected_b" -eq 1 ]] || [[ "$status_b" -eq 0 && "$rejected_a" -eq 1 ]]; }; then
  echo "FAIL: expected one successful deactivation and one LAST_ACTIVE_OWNER_PROTECTED rejection." >&2
  exit 1
fi

echo "PASS: one Owner deactivation committed; the competing request was rejected; one active Owner remains."
echo "The two supplied Owner assignments are modified. Recreate disposable fixtures before rerunning."
