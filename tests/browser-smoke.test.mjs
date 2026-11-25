import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const appPath = resolve(fileURLToPath(new URL("../rollover-budget-app.html", import.meta.url)));

test("production app renders its key account controls at desktop and mobile widths", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("file://" + appPath, { waitUntil: "domcontentloaded" });
    await page.locator("#authEmail").waitFor({ state: "attached" });
    assert.equal(await page.title(), "Rolling Budget");
    assert.equal(await page.locator("#authPassword").count(), 1);
    assert.equal(await page.locator("#recurringDesktopView").count(), 1);
    assert.equal(await page.locator("#recurringMobileView").count(), 1);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("#authEmail").isVisible(), false);
    assert.equal(await page.locator("#recurringMobileView").count(), 1);
    assert.equal(await page.locator("header").isVisible(), true);
  } finally {
    await browser.close();
  }
});

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test("isolated legacy migration and cloud reload at " + viewport.width, async () => {
    const browser = await chromium.launch({headless:true});
    try {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      const user = {id:"fixture-owner",email:"fixture@example.invalid"};
      let legacy = {state:{years:[{year:2026,months:Array.from({length:12},(_,i)=>({paychecks:i===0?[{name:"Fixture pay",amount:123}]:[]}))}]},updated_at:"2026-01-01T00:00:00Z"};
      const rows = new Map();
      await context.route("**/*", async route => {
        const url = route.request().url();
        if (url.startsWith("file:")) return route.continue();
        if (url.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js")) return route.fulfill({contentType:"application/javascript",body:`
          window.supabase={createClient:()=>({
            auth:{getSession:async()=>({data:{session:{user:${JSON.stringify(user)}}}}),onAuthStateChange:()=>({})},
            from(table){let op="select",payload,filters={};const q={
              select(){return q},eq(k,v){filters[k]=v;return q},is(k,v){filters[k]=v;return q},
              maybeSingle(){return q},delete(){op="delete";return q},upsert(v){op="upsert";payload=v;return q},
              then(resolve,reject){return window.fixtureQuery({table,op,payload,filters}).then(resolve,reject)}
            };return q}
          })};`});
        return route.abort();
      });
      await page.exposeFunction("fixtureQuery",({table,op,payload,filters})=>{
        if(op!=="upsert") assert.equal(filters.user_id,user.id);
        if(table==="budget_data"){
          if(op==="delete"){assert.equal(filters.updated_at,legacy.updated_at);assert.equal(rows.size,1);legacy=null;return {data:[{user_id:user.id}],error:null};}
          return {data:legacy,error:null};
        }
        assert.equal(table,"budget_ui_years");
        if(op==="upsert"){for(const row of [payload].flat()){assert.equal(row.user_id,user.id);rows.set(row.year,structuredClone(row));}return {error:null};}
        return {data:[...rows.values()],error:null};
      });
      await page.goto("file://"+appPath);
      await page.waitForFunction(()=>typeof db!=="undefined" && db["2026"]?.months[0].income[0]?.cpm===123);
      assert.equal(legacy,null);
      await page.evaluate(async()=>{db["2026"].months[0].income[0].cpm=456;await saveDB();});
      assert.equal(rows.get(2026).budget_data.months[0].income[0].cpm,456);
      await page.evaluate(()=>localStorage.clear());
      await page.reload();
      await page.waitForFunction(()=>db["2026"]?.months[0].income[0]?.cpm===456);
      await context.close();
    } finally {await browser.close();}
  });
}
