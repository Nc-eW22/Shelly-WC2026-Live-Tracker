// ⚽ SPARK_LABS — WC2026 Live Tracker — Installer
// Version: 1.0-beta
// Script 2 of the install flow. Serves a web UI for configuration.
// On Save: writes wc_auth + wc_timing + wc_teams, starts the Seeder
// (Script 3), then self-stops to free the HTTP server heap.
//
// UI: http://<device_ip>/script/<id>/ui

let VER = "1.0-beta";
let _sid = Shelly.getCurrentScriptId() + "";
let _ip = "?";

// Seeder is expected in slot 3. Change if you flash it elsewhere.
let SEEDER_SLOT = 3;

// ── 48-TEAM TABLE (AFS IDs, group, ISO flag code for picker UI) ──
let TEAMS = [
  {i:798,n:"Czechia",t:"CZE",g:"A",f:"cz"},   {i:16,n:"Mexico",t:"MEX",g:"A",f:"mx"},
  {i:1531,n:"South Africa",t:"RSA",g:"A",f:"za"},{i:17,n:"South Korea",t:"KOR",g:"A",f:"kr"},
  {i:1113,n:"Bosnia-Herz.",t:"BIH",g:"B",f:"ba"},{i:5529,n:"Canada",t:"CAN",g:"B",f:"ca"},
  {i:1569,n:"Qatar",t:"QAT",g:"B",f:"qa"},    {i:15,n:"Switzerland",t:"SUI",g:"B",f:"ch"},
  {i:6,n:"Brazil",t:"BRA",g:"C",f:"br"},      {i:31,n:"Morocco",t:"MAR",g:"C",f:"ma"},
  {i:2386,n:"Haiti",t:"HAI",g:"C",f:"ht"},    {i:1108,n:"Scotland",t:"SCO",g:"C",f:"gb-sct"},
  {i:777,n:"Turkey",t:"TUR",g:"D",f:"tr"},    {i:2384,n:"USA",t:"USA",g:"D",f:"us"},
  {i:2380,n:"Paraguay",t:"PAR",g:"D",f:"py"}, {i:20,n:"Australia",t:"AUS",g:"D",f:"au"},
  {i:25,n:"Germany",t:"GER",g:"E",f:"de"},    {i:5530,n:"Curacao",t:"CUR",g:"E",f:"cw"},
  {i:1501,n:"Ivory Coast",t:"CIV",g:"E",f:"ci"},{i:2382,n:"Ecuador",t:"ECU",g:"E",f:"ec"},
  {i:5,n:"Sweden",t:"SWE",g:"F",f:"se"},      {i:1118,n:"Netherlands",t:"NED",g:"F",f:"nl"},
  {i:12,n:"Japan",t:"JPN",g:"F",f:"jp"},      {i:28,n:"Tunisia",t:"TUN",g:"F",f:"tn"},
  {i:1,n:"Belgium",t:"BEL",g:"G",f:"be"},     {i:32,n:"Egypt",t:"EGY",g:"G",f:"eg"},
  {i:22,n:"Iran",t:"IRN",g:"G",f:"ir"},       {i:4673,n:"New Zealand",t:"NZL",g:"G",f:"nz"},
  {i:9,n:"Spain",t:"ESP",g:"H",f:"es"},       {i:1533,n:"Cape Verde",t:"CPV",g:"H",f:"cv"},
  {i:23,n:"Saudi Arabia",t:"KSA",g:"H",f:"sa"},{i:7,n:"Uruguay",t:"URY",g:"H",f:"uy"},
  {i:2,n:"France",t:"FRA",g:"I",f:"fr"},      {i:13,n:"Senegal",t:"SEN",g:"I",f:"sn"},
  {i:1090,n:"Norway",t:"NOR",g:"I",f:"no"},   {i:1567,n:"Iraq",t:"IRQ",g:"I",f:"iq"},
  {i:26,n:"Argentina",t:"ARG",g:"J",f:"ar"},  {i:1532,n:"Algeria",t:"ALG",g:"J",f:"dz"},
  {i:775,n:"Austria",t:"AUT",g:"J",f:"at"},   {i:1548,n:"Jordan",t:"JOR",g:"J",f:"jo"},
  {i:1508,n:"Congo DR",t:"COD",g:"K",f:"cd"}, {i:27,n:"Portugal",t:"POR",g:"K",f:"pt"},
  {i:1568,n:"Uzbekistan",t:"UZB",g:"K",f:"uz"},{i:8,n:"Colombia",t:"COL",g:"K",f:"co"},
  {i:10,n:"England",t:"ENG",g:"L",f:"gb-eng"},{i:3,n:"Croatia",t:"CRO",g:"L",f:"hr"},
  {i:1504,n:"Ghana",t:"GHA",g:"L",f:"gh"},    {i:11,n:"Panama",t:"PAN",g:"L",f:"pa"}
];

// Per-tier timing presets
function timingFor(tier) {
    if (tier === "PREMIUM" || tier === "FREE") {
        // football-data.org tiers — slower polling
        return {tz:2, poll_live_s:60, poll_pre_s:120, poll_idle_s:600,
                poll_standings_s:1800, pre_window_s:3600, ft_hold_s:1800, live2_revert_s:30};
    }
    // PRO (API-Football) — default fast polling
    return {tz:2, poll_live_s:30, poll_pre_s:120, poll_idle_s:600,
            poll_standings_s:1800, pre_window_s:3600, ft_hold_s:1800, live2_revert_s:30};
}

function providerFor(tier) {
    if (tier === "PRO") return "AFS";
    return "FDO";
}

function send(res, body, ct) {
    res.code = 200;
    res.headers = [["Content-Type", (ct || "application/json") + "; charset=utf-8"]];
    res.body = body; res.send();
}

function pqs(q) {
    let o = {}; if (!q) return o;
    let p = q.split("&");
    for (let i = 0; i < p.length; i++) {
        let kv = p[i].split("="); if (kv.length >= 2) o[kv[0]] = kv[1];
    }
    return o;
}

function buildCSS() {
    return 'body{font:13px system-ui,sans-serif;background:#161616;color:#ddd;margin:0;padding:10px}'
    +'.w{max-width:490px;margin:0 auto;display:flex;flex-direction:column;gap:8px}'
    +'.h{background:#0e1f36;border-radius:7px;padding:14px;border:1px solid #00aeef22}'
    +'.t{font-size:16px;font-weight:900}'
    +'.s{font-size:10px;color:#00aeef88;letter-spacing:2px;text-transform:uppercase;margin-top:2px}'
    +'.c{background:#1e1e1e;border-radius:7px;padding:12px 14px}'
    +'.tt{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#00aeef;margin-bottom:10px}'
    +'.r{display:grid;grid-template-columns:120px 1fr;gap:6px;margin:6px 0;align-items:center}'
    +'.l{font-size:12px;color:#888}'
    +'input,select{background:#111;border:1px solid #2a2a2a;color:#ddd;padding:5px 8px;border-radius:5px;font:13px system-ui;width:100%;box-sizing:border-box}'
    +'.ctr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}'
    +'.cn{font-size:26px;font-weight:900;color:#00aeef;line-height:1}'
    +'.cb{height:3px;background:#1a1a1a;border-radius:2px;width:100px}'
    +'.cf{height:100%;background:#00aeef;border-radius:2px;width:0%}'
    +'.gs{display:grid;grid-template-columns:1fr 1fr;gap:6px}'
    +'.gc{background:#161616;border-radius:6px;padding:8px;border:1px solid #202020}'
    +'.gh{font-size:9px;font-weight:800;letter-spacing:2px;color:#444;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #202020}'
    +'.tr{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:4px;cursor:pointer;margin:1px 0}'
    +'.tr:hover{background:#222}.tr.sl{background:#001824}'
    +'.tr input{width:13px;height:13px;accent-color:#00aeef;flex-shrink:0;margin:0}'
    +'.fl{width:24px;height:16px;object-fit:cover;border-radius:2px;flex-shrink:0}'
    +'.tn{font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    +'.tl{font-size:9px;color:#3a3a3a;font-weight:700;flex-shrink:0}'
    +'.b{width:100%;padding:13px;background:#00aeef;color:#000;font:700 13px system-ui;border:0;border-radius:7px;cursor:pointer;letter-spacing:1px;text-transform:uppercase}'
    +'.b:disabled{opacity:0.5}'
    +'.st{font-size:11px;padding:8px 12px;border-radius:6px;display:none}'
    +'.ok{background:#091509;color:#4a4;display:block}.er{background:#150909;color:#c44;display:block}'
    +'@media(max-width:400px){.gs{grid-template-columns:1fr}}';
}

function buildHTML() {
    return '<!DOCTYPE html><html><head><meta charset=UTF-8>'
    +'<meta name=viewport content="width=device-width,initial-scale=1">'
    +'<title>WC2026 Installer</title>'
    +'<link rel=stylesheet href="/script/'+_sid+'/asset?f=css"></head><body><div class=w>'
    +'<div class=h><div class=t>⚽ WC2026 Live Tracker</div>'
    +'<div class=s>SPARK_LABS · Setup & Provisioning v'+VER+'</div></div>'
    +'<div class=c><div class=tt>Configuration</div>'
    +'<div class=r><span class=l>API Token</span><input type=password id=tok placeholder="your API key"></div>'
    +'<div class=r><span class=l>Tier</span><select id=tier>'
    +'<option value=PRO>Premium — API-Football</option>'
    +'<option value=PREMIUM>Basic — football-data.org</option>'
    +'<option value=FREE>Free — football-data.org</option></select></div>'
    +'<div class=r><span class=l>Timezone UTC</span><input type=number id=tz value=2></div>'
    +'<div class=r><span class=l>Default Mode</span><select id=mode>'
    +'<option value=Live1>Live1</option><option value=Live2>Live2</option><option value=Auto>Auto</option></select></div>'
    +'</div>'
    +'<div class=c><div class=tt>Select Teams</div>'
    +'<div class=ctr><div><span class=cn id=cnt>0</span>'
    +'<span style=font-size:11px;color:#444> / 10 Max</span></div>'
    +'<div><div class=cb><div class=cf id=cf></div></div></div></div>'
    +'<div id=tms>Loading teams...</div></div>'
    +'<button class=b id=sB>💾 Save & Provision</button>'
    +'<div class=st id=ms></div></div>'
    +'<script src="/script/'+_sid+'/asset?f=app"></scr'+'ipt></body></html>';
}

function buildAPP() {
    let js = 'var B="/script/'+_sid+'";';
    js += 'function Q(i){return document.getElementById(i)}';
    js += 'function sh(m,c){var s=Q("ms");s.textContent=m;s.className="st "+c}';
    js += 'function uc(){var cks=document.querySelectorAll(".tck:checked"),n=cks.length;';
    js += 'Q("cnt").textContent=n;Q("cf").style.width=(n*10)+"%";';
    js += 'var rs=document.querySelectorAll(".tr");';
    js += 'for(var i=0;i<rs.length;i++){var cb=rs[i].querySelector(".tck");if(cb)rs[i].classList.toggle("sl",cb.checked)}}';
    js += 'function chk(e){if(!e.target.classList.contains("tck"))return;';
    js += 'if(document.querySelectorAll(".tck:checked").length>10){e.target.checked=false;sh("Maximum 10 teams","er");return}uc()}';
    js += 'function loadT(){fetch(B+"/ctrl?cmd=teams").then(function(r){return r.text()}).then(function(raw){';
    js += 'var ts=JSON.parse(raw),gs=["A","B","C","D","E","F","G","H","I","J","K","L"];';
    js += 'var h="<div class=gs>";';
    js += 'for(var g=0;g<gs.length;g++){var gr=gs[g];h+="<div class=gc><div class=gh>GROUP "+gr+"</div>";';
    js += 'for(var i=0;i<ts.length;i++){if(ts[i].g!==gr)continue;';
    js += 'h+=\'<label class=tr><input type=checkbox class=tck value=\'+ts[i].i+\'><img src=https://flagcdn.com/w40/\'+ts[i].f+\'.png class=fl><span class=tn>\'+ts[i].n+\'</span><span class=tl>\'+ts[i].t+\'</span></label>\';}';
    js += 'h+="</div>"}Q("tms").innerHTML=h+"</div>";';
    js += 'uc();document.addEventListener("change",chk)})}';
    js += 'Q("sB").onclick=function(){var cks=document.querySelectorAll(".tck:checked");';
    js += 'if(!cks.length){sh("Select at least 1 team","er");return}';
    js += 'if(!Q("tok").value){sh("Enter your API token","er");return}';
    js += 'var teams=[];for(var i=0;i<cks.length;i++)teams.push(cks[i].value);';
    js += 'var qs="cmd=save&tok="+Q("tok").value+"&tier="+Q("tier").value+"&tz="+(parseInt(Q("tz").value)||0)+"&mode="+Q("mode").value+"&teams="+teams.join("-");';
    js += 'Q("sB").disabled=true;Q("sB").textContent="Provisioning...";';
    js += 'fetch(B+"/ctrl?"+qs).then(function(r){return r.json()}).then(function(d){';
    js += 'if(d.ok){sh("Saved! Provisioning now. This page will stop responding in a few seconds — that is normal. Check your Shelly app in ~30s, then flash and start the Brain.","ok")}';
    js += 'else{sh("Write error: "+(d.err||"unknown"),"er");Q("sB").disabled=false;Q("sB").textContent="Save & Provision"}}).catch(function(){sh("Saved — page stopped responding as expected. Check your app.","ok")});};';
    js += 'loadT();';
    return js;
}

// ── HTTP ENDPOINTS ───────────────────────────────────────
HTTPServer.registerEndpoint("ui", function(req, res) { send(res, buildHTML(), "text/html"); });
HTTPServer.registerEndpoint("asset", function(req, res) {
    let f = pqs(req.query).f || "";
    if (f === "css") send(res, buildCSS(), "text/css");
    else if (f === "app") send(res, buildAPP(), "text/javascript");
    else send(res, "404", "text/plain");
});

HTTPServer.registerEndpoint("ctrl", function(req, res) {
    let q = pqs(req.query), cmd = q.cmd || "";
    if (cmd === "teams") { send(res, JSON.stringify(TEAMS)); return; }
    if (cmd === "save") {
        console.log("[INSTALLER] save received");
        let tok = q.tok || "";
        let tier = q.tier || "PRO";
        let tz = parseInt(q.tz) || 2;
        let teamsCsv = q.teams || "";
        if (tok === "" || teamsCsv === "") { send(res, '{"ok":false,"err":"missing"}'); return; }

        // teams arrive as dash-joined IDs: "10-2-1-6"
        let parts = teamsCsv.split("-");
        let teamIds = [];
        for (let i = 0; i < parts.length; i++) {
            let n = parseInt(parts[i]);
            if (!isNaN(n)) teamIds.push(n);
        }
        console.log("[INSTALLER] " + teamIds.length + " teams, tier=" + tier);

        let auth = JSON.stringify({token: tok, provider: providerFor(tier), tier: tier});
        let timing = timingFor(tier);
        timing.tz = tz;
        let teamsStr = JSON.stringify({teams: teamIds, live1_pri: 1, live2_pri: 2});

        Shelly.call("KVS.Set", {key: "wc_auth", value: auth}, function() {
            Shelly.call("KVS.Set", {key: "wc_timing", value: JSON.stringify(timing)}, function() {
                Shelly.call("KVS.Set", {key: "wc_teams", value: teamsStr}, function() {
                    send(res, '{"ok":true}');
                    console.log("[INSTALLER] KVS written. Starting Seeder slot " + SEEDER_SLOT);
                    Shelly.call("Script.Start", {id: SEEDER_SLOT}, null);
                    Timer.set(1500, false, function() {
                        console.log("[INSTALLER] Self-stopping to free heap.");
                        Shelly.call("Script.Stop", {id: parseInt(_sid)}, null);
                    });
                });
            });
        });
        return;
    }
    send(res, '{"err":"unknown"}');
});

let _w = Shelly.getComponentStatus("wifi") || {};
_ip = _w.sta_ip || "?";
console.log("[INSTALLER] WC2026 Installer v" + VER);
console.log("[INSTALLER] Open: http://" + _ip + "/script/" + _sid + "/ui");
console.log("[INSTALLER] Ensure Seeder is flashed to slot " + SEEDER_SLOT + " before saving.");
