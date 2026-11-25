#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGDATABASE:-}" == production_upgrade_test ]] || exit 1
owner=00000000-0000-4000-8000-000000000106
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sql() { psql -X -v ON_ERROR_STOP=1 "$@"; }
sql -c "INSERT INTO auth.users(id) VALUES ('$owner'); INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('$owner','race-a','Race A'),('$owner','race-b','Race B');"
session="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$owner',false); SET statement_timeout='20s';"
write_a="INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('$owner',2040,'{\"months\":[{\"expenses\":[{\"categoryId\":\"race-a\"}]}]}');"
delete_a="DELETE FROM public.budget_expense_categories WHERE user_id='$owner' AND id='race-a';"
write_b="INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('$owner',2041,'{\"months\":[{\"expenses\":[{\"categoryId\":\"race-b\"}]}]}');"
delete_b="DELETE FROM public.budget_expense_categories WHERE user_id='$owner' AND id='race-b';"
race() {
 local first="$1" second="$2" tag="$3" pid other
 # First session holds the transaction until the second is observed waiting on a lock.
 { printf '%s\n' "$session" 'BEGIN;' "$first" "SELECT 'ready';"; 
   for ((i=0;i<100;i++)); do
     if [[ -f "$tmp/$tag.go" ]]; then printf 'COMMIT;\n'; exit 0; fi
     sleep .1
   done
   printf 'ROLLBACK;\n'; exit 1
 } | PGAPPNAME="category-first-$tag" sql -At >"$tmp/$tag.first" 2>&1 &
 pid=$!
 for ((i=0;i<100;i++)); do grep -qx ready "$tmp/$tag.first" && break; sleep .1; done
 grep -qx ready "$tmp/$tag.first"
 PGAPPNAME="category-second-$tag" sql -v VERBOSITY=verbose -c "$session $second" >"$tmp/$tag.second" 2>&1 &
 other=$!
 for ((i=0;i<80;i++)); do
   if [[ $(sql -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='category-second-$tag' AND wait_event_type='Lock'") == 1 ]]; then touch "$tmp/$tag.go"; break; fi
   sleep .1
 done
 test -f "$tmp/$tag.go"
 wait "$pid"
 if wait "$other"; then echo "Conflicting transaction unexpectedly succeeded"; exit 1; fi
 grep -q '23503' "$tmp/$tag.second"
}
race "$write_a" "$delete_a" write-first
race "$delete_b" "$write_b" delete-first
test "$(sql -Atc "SELECT count(*) FROM budget_internal.year_category_refs WHERE user_id='$owner' AND category_id='race-a'")" = 1
test "$(sql -Atc "SELECT count(*) FROM public.budget_ui_years WHERE user_id='$owner' AND year=2041")" = 0
sql -c "DELETE FROM public.budget_ui_years WHERE user_id='$owner'; DELETE FROM auth.users WHERE id='$owner';"
echo 'Independent-session category concurrency checks passed'
