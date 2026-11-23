import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const files = ["apps/flame-chick-pos/index.html", "apps/flame-chick-rider/index.html"];
const source = files.map((file) => ({ file, html: readFileSync(file, "utf8") }));

test("POS and Rider source use Flame Chick identifiers only", () => {
  const all = source.map((x) => x.html).join("\n");
  const retiredBrand = ["Pizza", "Bite"].join(" ");
  const retiredGlobal = ["H", "F", "P"].join("");
  assert.equal(all.toLowerCase().includes(retiredBrand.toLowerCase()), false);
  assert.equal(new RegExp("\\b" + retiredGlobal + "\\b", "i").test(all), false);
  assert.equal(/service_role|sb_secret_/i.test(all), false);
});

test("POS and Rider inline JavaScript parses", () => {
  for (const { file, html } of source) {
    const chunks = html.split("<script").slice(1);
    let index = 0;
    for (const chunk of chunks) {
      const tagEnd = chunk.indexOf(">");
      if (tagEnd < 0) continue;
      const attrs = chunk.slice(0, tagEnd);
      if (attrs.toLowerCase().includes("src=")) continue;
      const close = chunk.indexOf("</script>", tagEnd + 1);
      if (close < 0) continue;
      const code = chunk.slice(tagEnd + 1, close).trim();
      if (code) new vm.Script(code, { filename: file + "-inline-" + index++ + ".js" });
    }
    assert.ok(index > 0, "No inline JavaScript checked in " + file);
  }
});

test("Rider delivery sequence is Accept offer, Picked up, then Delivered", () => {
  const html=source[1].html;
  assert.match(html,/data-offer-action="accept"/);
  assert.match(html,/data-action="picked_up"/);
  assert.match(html,/if\(s==='out_for_delivery'\)return[^\n]*data-action="delivered"/);
  assert.doesNotMatch(html,/arrived_at|arrived_at_restaurant|data-acceptance-deadline|pendingAcceptance|expiredAcceptanceRefreshes|acceptance-countdown/);
});

test("POS delivery dispatch uses the targeted offer state, not a second acceptance stage", () => {
  const html=source[0].html;
  assert.match(html,/task\.status==='offering'/);
  assert.doesNotMatch(html,/deliveryAcceptanceTicker|pos-acceptance-deadline|Awaiting acceptance|reassignPending|pendingReassignment/);
  assert.doesNotMatch(html,/arrived_at|arrived_at_restaurant/);
});

test("rider Realtime channel uses the Flame Chick namespace", () => {
  assert.match(source[1].html, /flame-chick-rider-ops-/);
});


test("POS loads private staff context, orders, history, and dispatch only through authorized Edge APIs", () => {
  const html = source[0].html;
  assert.match(html, /API_URL\+'\?view=staff_context'/);
  assert.match(html, /flameChickOrderRequest\('GET',\{board:'active'/);
  assert.match(html, /flameChickOrderRequest\('GET',\{board:'all'/);
  assert.match(html, /flameChickDeliveryRequest\('GET',\{view:'dispatch'\}\)/);
  assert.match(html, /action:'assign',delivery_task_id:/);
  assert.doesNotMatch(html, /FLAME_CHICK_REST_URL/);
  assert.doesNotMatch(html, /flameChickDirectRest\(/);
  assert.doesNotMatch(html, /flameChickDirectRpc\(/);
});

test("Rider obtains its branch-scoped profile and account roles through authenticated APIs", () => {
  const html = source[1].html;
  assert.match(html, /DELIVERY_API\+'\?view=profile'/);
  assert.match(html, /ORDER_API\+'\?view=staff_context'/);
  assert.doesNotMatch(html, /REST_URL/);
  assert.doesNotMatch(html, /riderDirectRead\(/);
  assert.doesNotMatch(html, /user_roles\?select=role/);
  assert.doesNotMatch(html, /rider_profiles\?select=/);
});


test("POS delivery order payload sends explicit delivery selection without fee or display-name authority", () => {
  const html=source[0].html;
  assert.match(html,/selection_type:areaChoice==='not listed'\?'not_listed':'listed_area'/);
  assert.match(html,/area_id:areaChoice==='not listed'\?null:areaId/);
  assert.match(html,/address,/);
  const start=html.indexOf('function flameChickBuildPosDeliveryOrderPayload');
  const end=html.indexOf('async function flameChickCreatePosDeliveryOrder',start);
  const payload=html.slice(start,end);
  assert.doesNotMatch(payload,/area_name\s*:/);
  assert.doesNotMatch(payload,/delivery_fee\s*:/);
  assert.doesNotMatch(payload,/fee\s*:\s*area/);
});


test("POS keeps an unset delivery-area fee distinct from an explicitly free area", () => {
  const html=source[0].html;
  assert.match(html,/rawFee===null\|\|rawFee===undefined\|\|rawFee===''\?null:Number\(rawFee\)/);
  assert.match(html,/Number\.isFinite\(n\)&&n>=0\?n:null/);
  assert.match(html,/if\(type==='Delivery'&&deliveryFee===null\)/);
  assert.match(html,/getDeliveryFeeForArea\(order\.area\)===null/);
  assert.doesNotMatch(html,/function deliveryAreaFee\(row\)[^\n]*:0\}/);
});
