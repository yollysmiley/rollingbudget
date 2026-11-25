#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGDATABASE:-}" == production_upgrade_test ]] || exit 1
owner=00000000-0000-4000-8000-000000000106
tmp=$(mktemp -d)
cleanup() {
 local status=$?
 trap - EXIT
 if ((status)); then
  for log in "$tmp"/*.first "$tmp"/*.second; do [[ ! -f "$log" ]] || cat "$log" >&2; done
 fi
 sql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name LIKE 'category-first-%' OR application_name LIKE 'category-second-%';" >/dev/null 2>&1 || status=1
 sql -c "DELETE FROM public.budget_ui_years WHERE user_id IN ('$owner','$owner2'); DELETE FROM public.budget_recurring_rules WHERE user_id IN ('$owner','$owner2'); DELETE FROM auth.users WHERE id IN ('$owner','$owner2');" >/dev/null 2>&1 || status=1
 rm -rf "$tmp"
 exit "$status"
}
owner2=00000000-0000-4000-8000-000000000107
trap cleanup EXIT
sql() { psql -X -v ON_ERROR_STOP=1 "$@"; }
sql -c "INSERT INTO auth.users(id) VALUES ('$owner'); INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('$owner','race-a','Race A'),('$owner','race-b','Race B');"
session="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$owner',false); SET statement_timeout='20s';"
write_a="INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('$owner',2040,'{\"months\":[{\"expenses\":[{\"categoryId\":\"race-a\"}]}]}');"
delete_a="DELETE FROM public.budget_expense_categories WHERE user_id='$owner' AND id='race-a';"
write_b="INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('$owner',2041,'{\"months\":[{\"expenses\":[{\"categoryId\":\"race-b\"}]}]}');"
delete_b="DELETE FROM public.budget_expense_categories WHERE user_id='$owner' AND id='race-b';"
race() {
 local first="$1" second="$2" tag="$3" finish="${4:-COMMIT}" expected="${5:-23503}" allow_early="${6:-no}" pid other early=no
 # Reference removal may reject against the committed snapshot before a lock wait.
 { printf '%s\n' "$session" 'BEGIN;' "$first" "SELECT 'ready';"; 
   for ((i=0;i<100;i++)); do
     if [[ -f "$tmp/$tag.go" ]]; then printf '%s;\n' "$finish"; exit 0; fi
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
   if [[ "$allow_early" == yes ]] && ! kill -0 "$other" 2>/dev/null; then
     if wait "$other"; then echo "Deletion succeeded before reference removal committed"; exit 1; fi
     grep -q '23503' "$tmp/$tag.second"
     early=yes
     touch "$tmp/$tag.go"
     break
   fi
   sleep .1
 done
 test -f "$tmp/$tag.go"
 wait "$pid"
 if [[ "$early" == yes ]]; then
   if [[ "$expected" == success ]]; then sql -c "$session $second"; fi
   return 0
 fi
 if [[ "$expected" == success ]]; then
   wait "$other"
 else
   if wait "$other"; then echo "Conflicting transaction unexpectedly succeeded"; exit 1; fi
   grep -q "$expected" "$tmp/$tag.second"
 fi
}
race "$write_a" "$delete_a" write-first
race "$delete_b" "$write_b" delete-first
test "$(sql -Atc "SELECT count(*) FROM budget_internal.year_category_refs WHERE user_id='$owner' AND category_id='race-a'")" = 1
test "$(sql -Atc "SELECT count(*) FROM public.budget_ui_years WHERE user_id='$owner' AND year=2041")" = 0
fixture() { sql -c "INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('$owner','$1','$1');"; }
del() { printf "DELETE FROM public.budget_expense_categories WHERE user_id='%s' AND id='%s';" "$owner" "$1"; }
year_insert() { printf "INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('%s',%s,'{\"months\":[{\"expenses\":[{\"categoryId\":\"%s\"}]}]}');" "$owner" "$1" "$2"; }
year_update() { printf "UPDATE public.budget_ui_years SET budget_data='{\"months\":[{\"expenses\":[{\"categoryId\":\"%s\"}]}]}' WHERE user_id='%s' AND year=%s;" "$2" "$owner" "$1"; }
clear_year() { printf "UPDATE public.budget_ui_years SET budget_data='{}' WHERE user_id='%s' AND year=%s;" "$owner" "$1"; }
empty_year() { sql -c "INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('$owner',$1,'{}');"; }
rule_insert() { printf "INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date,versions) VALUES ('%s','%s','%s','%s',1,'monthly','2026-01-01','[]');" "$owner" "$1" "$1" "$2"; }
rule_update() { printf "UPDATE public.budget_recurring_rules SET category='%s' WHERE user_id='%s' AND id='%s';" "$2" "$owner" "$1"; }
for n in 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18; do fixture "race-$n"; done
empty_year 2043
empty_year 2044
race "$(year_update 2043 race-03)" "$(del race-03)" update-first
race "$(del race-04)" "$(year_update 2044 race-04)" delete-before-update
sql -c "$(year_insert 2045 race-05) $(year_insert 2046 race-06) $(year_insert 2047 race-06)"
race "$(clear_year 2045)" "$(del race-05)" final-year-ref COMMIT success yes
# Another committed year still references the category; no lock wait is required.
sql -c "$(clear_year 2046)"
if sql -v VERBOSITY=verbose -c "$session $(del race-06)" >"$tmp/multiple.second" 2>&1; then exit 1; fi
grep -q 23503 "$tmp/multiple.second"
race "$(rule_insert rule07 race-07)" "$(del race-07)" rule-first
race "$(del race-08)" "$(rule_insert rule08 race-08)" delete-before-rule
sql -c "$(rule_insert rule09 fixed) $(rule_insert rule10 fixed) $(rule_insert rule11 fixed) $(rule_insert rule12 race-12)"
race "$(rule_update rule09 race-09)" "$(del race-09)" reassign-first
race "$(del race-10)" "$(rule_update rule10 race-10)" delete-before-reassign
race "UPDATE public.budget_recurring_rules SET versions='[{\"categoryId\":\"race-11\"}]' WHERE user_id='$owner' AND id='rule11';" "$(del race-11)" historical-first
race "$(rule_update rule12 fixed)" "$(del race-12)" final-rule-ref COMMIT success yes
race "$(year_insert 2053 race-13)" "$(del race-13)" rollback-write ROLLBACK success
race "$(del race-14)" "$(year_insert 2054 race-14)" rollback-delete ROLLBACK success
sql -c "$(year_insert 2055 race-15)"
race "$(clear_year 2055)" "$(del race-15)" rollback-removal ROLLBACK 23503 yes
race "$(rule_insert rule16 race-16)" "$(del race-16)" rollback-rule ROLLBACK success
sql -c "INSERT INTO auth.users(id) VALUES ('$owner2'); INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('$owner2','race-17','Other owner');"
sql -c "$(year_insert 2057 race-17)"
sql -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$owner2',false); DELETE FROM public.budget_expense_categories WHERE user_id='$owner2' AND id='race-17';"
test "$(sql -Atc "SELECT count(*) FROM public.budget_expense_categories WHERE id='race-17' AND user_id='$owner'")" = 1
sql -c "$(year_insert 2058 race-18)"
before=$(sql -Atc "SELECT ctid FROM budget_internal.year_category_refs WHERE user_id='$owner' AND year=2058")
sql -c "UPDATE public.budget_ui_years SET budget_data=budget_data || '{\"note\":\"changed\"}' WHERE user_id='$owner' AND year=2058;"
test "$before" = "$(sql -Atc "SELECT ctid FROM budget_internal.year_category_refs WHERE user_id='$owner' AND year=2058")"
test "$(sql -Atc "SELECT count(*) FROM public.budget_ui_years WHERE user_id='$owner' AND year=2053")" = 0
test "$(sql -Atc "SELECT count(*) FROM public.budget_ui_years WHERE user_id='$owner' AND year=2054")" = 1
test "$(sql -Atc "SELECT count(*) FROM public.budget_recurring_rules WHERE user_id='$owner' AND id IN ('rule08','rule16')")" = 0
test "$(sql -Atc "SELECT category FROM public.budget_recurring_rules WHERE user_id='$owner' AND id='rule10'")" = fixed
test "$(sql -Atc "SELECT count(*) FROM budget_internal.year_category_refs r LEFT JOIN public.budget_expense_categories c ON (r.user_id,r.category_id)=(c.user_id,c.id) WHERE c.id IS NULL")" = 0
test "$(sql -Atc "SELECT count(*) FROM budget_internal.rule_category_refs r LEFT JOIN public.budget_expense_categories c ON (r.user_id,r.category_id)=(c.user_id,c.id) WHERE c.id IS NULL")" = 0
test "$(sql -Atc "SELECT count(*) FROM public.budget_expense_categories WHERE user_id='$owner' AND id IN ('race-05','race-12')")" = 0
test "$(sql -Atc "SELECT category FROM public.budget_recurring_rules WHERE user_id='$owner' AND id='rule12'")" = fixed
test "$(sql -Atc "SELECT count(*) FROM budget_internal.year_category_refs WHERE user_id='$owner' AND year=2055 AND category_id='race-15'")" = 1
test "$(sql -Atc "SELECT count(*) FROM public.budget_expense_categories WHERE user_id='$owner' AND id='race-15'")" = 1
echo 'Independent-session category concurrency checks passed'

# Essential release gate: embedded account references versus deletion, both orders.
sql -c "INSERT INTO public.budget_accounts(user_id,id,name) VALUES ('$owner','account-race-a','Account race A'),('$owner','account-race-b','Account race B'),('$owner','account-race-c','Account race C');"
account_delete() { printf "DELETE FROM public.budget_accounts WHERE user_id='%s' AND id='%s';" "$owner" "$1"; }
account_year() { printf "INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('%s',%s,'{\"months\":[{\"fixed\":[{\"accountId\":\"%s\",\"amount\":12}]}]}');" "$owner" "$1" "$2"; }
race "$(account_year 2061 account-race-a)" "$(account_delete account-race-a)" account-write-first
race "$(account_delete account-race-b)" "$(account_year 2062 account-race-b)" account-delete-first
race "INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date,versions) VALUES ('$owner','account-history','Account history','fixed',1,'monthly','2026-01-01','[{\"accountId\":\"account-race-c\"}]');" "$(account_delete account-race-c)" account-history-first
test "$(sql -Atc "SELECT count(*) FROM budget_internal.year_account_refs WHERE user_id='$owner' AND year=2061 AND account_id='account-race-a'")" = 1
test "$(sql -Atc "SELECT count(*) FROM public.budget_ui_years WHERE user_id='$owner' AND year=2062")" = 0
test "$(sql -Atc "SELECT count(*) FROM budget_internal.rule_account_refs WHERE user_id='$owner' AND rule_id='account-history' AND account_id='account-race-c'")" = 1
# Real PostgreSQL CAS: two sessions share the same original revision.
sql -c "INSERT INTO public.budget_ui_years(user_id,year,budget_data,updated_at) VALUES ('$owner',2063,'{}','2026-01-01T00:00:00Z');"
race "UPDATE public.budget_ui_years SET budget_data='{\"note\":\"winner\"}',updated_at='2026-01-02T00:00:00Z' WHERE user_id='$owner' AND year=2063 AND updated_at='2026-01-01T00:00:00Z';" "UPDATE public.budget_ui_years SET budget_data='{\"note\":\"stale\"}',updated_at='2026-01-03T00:00:00Z' WHERE user_id='$owner' AND year=2063 AND updated_at='2026-01-01T00:00:00Z';" account-stale-save COMMIT success
test "$(sql -Atc "SELECT budget_data->>'note' FROM public.budget_ui_years WHERE user_id='$owner' AND year=2063")" = winner
grep -q 'UPDATE 0' "$tmp/account-stale-save.second"
echo 'Essential account concurrency and stale-save checks passed'
