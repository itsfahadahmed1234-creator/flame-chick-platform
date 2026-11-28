import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("apps/flame-chick-rider/index.html", "utf8");

test("Rider invite callback activates the invitation through Staff Admin using the invitee JWT", () => {
  assert.match(html, /const STAFF_ADMIN_API=SUPABASE_URL\+'\/functions\/v1\/flame-chick-staff-admin'/);
  const start = html.indexOf("$('passwordForm').addEventListener('submit'");
  const end = html.indexOf("$('signOutBtn').addEventListener", start);
  assert.ok(start >= 0 && end > start, "Rider password setup handler must exist");
  const handler = html.slice(start, end);

  assert.match(handler, /if\(pendingAuthType==='invite'\)/);
  assert.match(handler, /fetch\(STAFF_ADMIN_API/);
  assert.match(handler, /'Authorization':'Bearer '\+next\.access_token/);
  assert.match(handler, /JSON\.stringify\(\{action:'accept_invitation'\}\)/);
  assert.match(handler, /accepted\.ok!==true\|\|accepted\.result\?\.status!=='accepted'/);
  assert.ok(handler.indexOf("await getUser(next.access_token)") < handler.indexOf("fetch(STAFF_ADMIN_API"));
  assert.ok(handler.indexOf("fetch(STAFF_ADMIN_API") < handler.indexOf("getActiveAccountRoles(invitedUser.id,next.access_token)"));
});

test("Rider invite session is retained when activation or role verification fails", () => {
  const start = html.indexOf("$('passwordForm').addEventListener('submit'");
  const end = html.indexOf("$('signOutBtn').addEventListener", start);
  const handler = html.slice(start, end);
  const roleCheck = handler.indexOf("getActiveAccountRoles(invitedUser.id,next.access_token)");
  const clearPositions = [...handler.matchAll(/pendingAuthSession=null/g)].map(match => match.index);

  assert.ok(roleCheck >= 0, "Role verification must follow invitation acceptance");
  assert.ok(clearPositions.length >= 3, "Each completed role outcome must clear the pending invitation session");
  assert.ok(clearPositions.every(position => position > roleCheck),
    "Pending invitation credentials must remain available through acceptance and role verification");
  assert.match(handler, /catch\(err\)\{\$\('passwordError'\)\.textContent=err\.message/);
});

test("Rider page's inline browser scripts parse", () => {
  const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)];
  assert.ok(scripts.length > 0, "Rider page must contain its application script");
  for (const [index, match] of scripts.entries()) {
    const code = match[1].trim();
    if (code) new vm.Script(code, { filename: "rider-inline-" + index + ".js" });
  }
});
