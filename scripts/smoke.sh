#!/usr/bin/env bash
# Live smoke test. Runs only once QLOO_API_KEY exists. Usage: QLOO_API_KEY=... scripts/smoke.sh [https://demo-url]
# Calls the same four Qloo endpoints the agent uses, then (if a URL is given) the deployed agent end to end.
set -euo pipefail
: "${QLOO_API_KEY:?QLOO_API_KEY is not set. The key arrives by email from the hackathon organisers.}"
B=https://api.qloo.com
H=(-H "X-Api-Key: $QLOO_API_KEY" -H "Accept: application/json")
fail(){ echo "FAIL: $*" >&2; exit 1; }
jqp(){ python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

echo "1/5 GET /search"
S=$(curl -fsS "${H[@]}" -G "$B/search" --data-urlencode "query=Fleabag" --data-urlencode "types=urn:entity:tv_show" --data-urlencode "take=3")
ID=$(echo "$S" | jqp "r=d['results']; r=r if isinstance(r,list) else r.get('entities',[]); print(r[0].get('entity_id') or r[0]['id'])") || fail "search returned no entity"
echo "   entity id: $ID"

echo "2/5 GET /v2/tags (semantic)"
curl -fsS "${H[@]}" -G "$B/v2/tags" --data-urlencode "filter.query=cozy" --data-urlencode "feature.semantic_search=true" --data-urlencode "take=2" \
  | jqp "r=d['results']; r=r if isinstance(r,list) else r.get('tags',[]); assert r, 'no tags'; print('   tag:', r[0]['name'])" || fail "tags"

echo "3/5 GET /v2/insights filter.type=urn:tag"
curl -fsS "${H[@]}" -G "$B/v2/insights" --data-urlencode "filter.type=urn:tag" --data-urlencode "signal.interests.entities=$ID" --data-urlencode "take=5" \
  | jqp "r=d['results']; r=r if isinstance(r,list) else r.get('tags',[]); assert r, 'no taste tags'; print('   ', len(r), 'taste tags')" || fail "taste tags"

echo "4/5 GET /v2/insights cross-category (book) with explainability"
curl -fsS "${H[@]}" -G "$B/v2/insights" --data-urlencode "filter.type=urn:entity:book" --data-urlencode "signal.interests.entities=$ID" --data-urlencode "feature.explainability=true" --data-urlencode "take=3" \
  | jqp "r=d['results']; r=r if isinstance(r,list) else r.get('entities',[]); assert r, 'no books'; e=r[0]; print('   ', e['name'], '| explainability keys:', list((e.get('query') or {}).get('explainability') or {}))" || fail "insights"

if [ "${1:-}" != "" ]; then
  echo "5/5 POST $1/api/gifts (end to end)"
  OUT=$(curl -fsS -m 90 -X POST "$1/api/gifts" -H 'content-type: application/json' -d '{"text":"My sister loves Fleabag, Phoebe Bridgers and Normal People by Sally Rooney. Cozy and a bit melancholy."}')
  echo "$OUT" | python3 -c "import sys,json; ev=[json.loads(l) for l in sys.stdin if l.strip()]; g=[e for e in ev if e['type']=='gifts']; assert g and len(g[0]['gifts'])>=5, ev[-1]; [print('   ',x['domain'],'|',x['idea'],'|',x['why']) for x in g[0]['gifts']]" || fail "agent returned fewer than 5 gifts"
else echo "5/5 skipped (pass the demo URL as argument to test the agent end to end)"; fi
echo "SMOKE OK"
