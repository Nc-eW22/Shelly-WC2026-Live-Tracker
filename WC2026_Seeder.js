// ⚽ SPARK_LABS — WC2026 Live Tracker — Seeder
// Version: 1.0-beta
// Script 3 of the install flow. Started automatically by the Installer.
// Reads wc_teams from KVS, writes all 12 group keys, provisions the 9
// virtual components + group, patches the Mode enum, then self-stops.
//
// DO NOT run this manually before the Installer. It expects wc_teams in KVS.

// ── GROUP DATA (AFS team IDs — confirmed from /teams?league=1&season=2026) ──
// Each group: 4 team IDs + matching TLA codes.
let GROUPS = [
    {l:"A", teams:[798,16,1531,17],   tlas:["CZE","MEX","RSA","KOR"]},
    {l:"B", teams:[1113,5529,1569,15], tlas:["BIH","CAN","QAT","SUI"]},
    {l:"C", teams:[6,31,2386,1108],   tlas:["BRA","MAR","HAI","SCO"]},
    {l:"D", teams:[777,2384,2380,20], tlas:["TUR","USA","PAR","AUS"]},
    {l:"E", teams:[25,5530,1501,2382], tlas:["GER","CUR","CIV","ECU"]},
    {l:"F", teams:[5,1118,12,28],     tlas:["SWE","NED","JPN","TUN"]},
    {l:"G", teams:[1,32,22,4673],     tlas:["BEL","EGY","IRN","NZL"]},
    {l:"H", teams:[9,1533,23,7],      tlas:["ESP","CPV","KSA","URY"]},
    {l:"I", teams:[2,13,1090,1567],   tlas:["FRA","SEN","NOR","IRQ"]},
    {l:"J", teams:[26,1532,775,1548], tlas:["ARG","ALG","AUT","JOR"]},
    {l:"K", teams:[1508,27,1568,8],   tlas:["COD","POR","UZB","COL"]},
    {l:"L", teams:[10,3,1504,11],     tlas:["ENG","CRO","GHA","PAN"]}
];

// ID → TLA + flag lookup for the Mode enum titles.
// Subdivision flags (ENG/SCO) handled in gF() if/else — never in object literals.
function gF(t) {
    if (t === "ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿"; if (t === "SCO") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
    if (t === "FRA") return "🇫🇷"; if (t === "BEL") return "🇧🇪";
    if (t === "BRA") return "🇧🇷"; if (t === "GER") return "🇩🇪";
    if (t === "ARG") return "🇦🇷"; if (t === "ESP") return "🇪🇸";
    if (t === "NED") return "🇳🇱"; if (t === "MEX") return "🇲🇽";
    if (t === "SUI") return "🇨🇭"; if (t === "CRO") return "🇭🇷";
    if (t === "GHA") return "🇬🇭"; if (t === "PAN") return "🇵🇦";
    if (t === "USA") return "🇺🇸"; if (t === "PAR") return "🇵🇾";
    if (t === "MAR") return "🇲🇦"; if (t === "HAI") return "🇭🇹";
    if (t === "KOR") return "🇰🇷"; if (t === "CZE") return "🇨🇿";
    if (t === "RSA") return "🇿🇦"; if (t === "CAN") return "🇨🇦";
    if (t === "QAT") return "🇶🇦"; if (t === "BIH") return "🇧🇦";
    if (t === "POR") return "🇵🇹"; if (t === "JPN") return "🇯🇵";
    if (t === "AUS") return "🇦🇺"; if (t === "CPV") return "🇨🇻";
    if (t === "KSA") return "🇸🇦"; if (t === "URY") return "🇺🇾";
    if (t === "TUR") return "🇹🇷"; if (t === "CUR") return "🇨🇼";
    if (t === "CIV") return "🇨🇮"; if (t === "ECU") return "🇪🇨";
    if (t === "SWE") return "🇸🇪"; if (t === "TUN") return "🇹🇳";
    if (t === "EGY") return "🇪🇬"; if (t === "IRN") return "🇮🇷";
    if (t === "NZL") return "🇳🇿"; if (t === "SEN") return "🇸🇳";
    if (t === "NOR") return "🇳🇴"; if (t === "IRQ") return "🇮🇶";
    if (t === "ALG") return "🇩🇿"; if (t === "AUT") return "🇦🇹";
    if (t === "JOR") return "🇯🇴"; if (t === "COD") return "🇨🇩";
    if (t === "UZB") return "🇺🇿"; if (t === "COL") return "🇨🇴";
    return "🏳";
}

function tlaOf(id) {
    for (let g = 0; g < GROUPS.length; g++) {
        for (let i = 0; i < GROUPS[g].teams.length; i++) {
            if (GROUPS[g].teams[i] === id) return GROUPS[g].tlas[i];
        }
    }
    return "";
}

// ── PIPELINE QUEUE (sequential micro-steps, one RPC at a time) ──
let _pq = [];
let _pqi = 0;

function runStep() {
    if (_pqi >= _pq.length) {
        console.log("[SEEDER] Complete. Provisioning done. Self-stopping.");
        Shelly.call("Script.Stop", {id: Shelly.getCurrentScriptId()}, null);
        return;
    }
    let step = _pq[_pqi]; _pqi++;
    if (step.m === "_PAUSE_") {
        Timer.set(step.d, false, runStep);
        return;
    }
    if (step.m === "_LOG_") {
        console.log("[SEEDER] " + step.msg);
        Timer.set(50, false, runStep);
        return;
    }
    Shelly.call(step.m, step.p, function(r, e) {
        if (e !== 0 && e !== undefined) console.log("[SEEDER] step warn " + step.m + " e=" + e);
        Timer.set(step.d, false, runStep);
    });
}

// ── BUILD THE PROVISIONING QUEUE ─────────────────────────
function buildQueue(selectedIds) {
    _pq = []; _pqi = 0;

    // Phase 0: write group KVS keys
    _pq.push({m:"_LOG_", msg:"Writing 12 group keys"});
    for (let g = 0; g < GROUPS.length; g++) {
        let grp = GROUPS[g];
        let val = JSON.stringify({teams: grp.teams, tlas: grp.tlas});
        _pq.push({m:"KVS.Set", p:{key:"wc_grp_" + grp.l, value: val}, d:300});
    }
    _pq.push({m:"_PAUSE_", d:800});

    // Phase 1: clear any existing VCs (clean reinstall)
    _pq.push({m:"_LOG_", msg:"Clearing existing components"});
    let clear = ["enum:200","enum:201","number:200","number:201","number:202","text:200","text:201","text:202","text:203","group:200"];
    for (let i = 0; i < clear.length; i++) {
        _pq.push({m:"Virtual.Delete", p:{key: clear[i]}, d:300});
    }
    _pq.push({m:"_PAUSE_", d:1000});

    // Build Mode enum options + titles from selected teams
    let modeOpts = ["Live1","Live2"];
    let modeTitles = {"Live1":"🎥1","Live2":"🎥2","Auto":"🔁","Error":"⚠️"};
    for (let i = 0; i < selectedIds.length; i++) {
        let tla = tlaOf(selectedIds[i]);
        if (tla === "") continue;
        modeOpts.push(tla);
        modeTitles[tla] = gF(tla);
    }
    modeOpts.push("Auto"); modeOpts.push("Error");

    let statusOpts = ["IDLE","PRE","LIVE","HT","ET","PENS","FT","Error","RC","YC","SUB","KO","APG","HPG"];
    let statusTitles = {
        "IDLE":" ", "PRE":"🏟", "LIVE":"🔴", "HT":"HT", "ET":"ET",
        "PENS":"🥅", "FT":"FT", "Error":"⚠️", "RC":"🟥", "YC":"🟨",
        "SUB":"🔀", "KO":"⚽", "APG":"🥅", "HPG":"🥅"
    };

    // Phase 2: create components (Virtual.Add)
    _pq.push({m:"_LOG_", msg:"Creating components"});
    _pq.push({m:"Virtual.Add", p:{type:"enum",   id:200, config:{name:"Mode", options:modeOpts, default_value:"Live1"}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"enum",   id:201, config:{name:"Status", options:statusOpts, default_value:"IDLE"}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"number", id:200, config:{name:"Goal Home/For", min:0, max:30, default_value:0}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"number", id:201, config:{name:"Goal Away/Against", min:0, max:30, default_value:0}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"number", id:202, config:{name:"Game time", min:0, max:120, default_value:0}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"text",   id:200, config:{name:"Feed", max_len:50, default_value:"Awaiting data..."}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"text",   id:201, config:{name:"Info A", max_len:50, default_value:"—"}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"text",   id:202, config:{name:"Info B", max_len:255, default_value:"—"}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"text",   id:203, config:{name:"Stage", max_len:255, default_value:"World Cup 2026 Tracker"}}, d:600});
    _pq.push({m:"Virtual.Add", p:{type:"group",  id:200, config:{name:"⚽ WC2026 Tracker"}}, d:600});
    _pq.push({m:"_PAUSE_", d:1200});

    // Phase 3: configure metadata + UI (per-type SetConfig)
    _pq.push({m:"_LOG_", msg:"Configuring UI metadata"});
    _pq.push({m:"Enum.SetConfig", p:{id:200, config:{name:"Mode", options:modeOpts, default_value:"Live1", meta:{ui:{view:"dropdown", icon:"https://crests.football-data.org/wm26.png", titles:modeTitles}}}}, d:500});
    _pq.push({m:"Enum.SetConfig", p:{id:201, config:{name:"Status", options:statusOpts, default_value:"IDLE", meta:{cloud:["log"], ui:{view:"label", icon:"https://img.icons8.com/?size=100&id=UdKsIDrOADZd&format=png&color=000000", titles:statusTitles}}}}, d:500});
    _pq.push({m:"Number.SetConfig", p:{id:200, config:{name:"Goal Home/For", min:0, max:30, meta:{cloud:["log","counter"], ui:{view:"label", unit:"⚽️", step:1, icon:"https://img.icons8.com/?size=100&id=le9pwCn69alh&format=png&color=000000"}}}}, d:500});
    _pq.push({m:"Number.SetConfig", p:{id:201, config:{name:"Goal Away/Against", min:0, max:30, meta:{cloud:["log","counter"], ui:{view:"label", unit:"⚽️", step:1, icon:"https://img.icons8.com/?size=100&id=le9pwCn69alh&format=png&color=000000"}}}}, d:500});
    _pq.push({m:"Number.SetConfig", p:{id:202, config:{name:"Game time", min:0, max:120, meta:{cloud:["log","accumulation"], ui:{view:"progressbar", step:1, icon:"https://img.icons8.com/?size=100&id=vj8GRDfKf8Ac&format=png&color=000000", webIcon:13}}}}, d:500});
    _pq.push({m:"Text.SetConfig", p:{id:200, config:{name:"Feed", max_len:50, meta:{cloud:["log"], ui:{view:"label", icon:"https://img.icons8.com/?size=100&id=cBFvS9yWRYSZ&format=png&color=000000"}}}}, d:500});
    _pq.push({m:"Text.SetConfig", p:{id:201, config:{name:"Info A", max_len:50, meta:{cloud:["log"], ui:{view:"label", icon:"https://img.icons8.com/?size=100&id=VQOfeAx5KWTK&format=png&color=000000"}}}}, d:500});
    _pq.push({m:"Text.SetConfig", p:{id:202, config:{name:"Info B", max_len:255, meta:{ui:{view:"label", icon:"https://img.icons8.com/?size=100&id=VQOfeAx5KWTK&format=png&color=000000"}}}}, d:500});
    _pq.push({m:"Text.SetConfig", p:{id:203, config:{name:"Stage", max_len:255, meta:{cloud:[], ui:{view:"label", icon:"https://img.icons8.com/?size=100&id=2jHmblEslKYm&format=png&color=000000&rotate=90"}}}}, d:500});
    _pq.push({m:"_PAUSE_", d:1000});

    // Phase 4: bind group membership
    _pq.push({m:"_LOG_", msg:"Binding group layout"});
    _pq.push({m:"Group.Set", p:{id:200, value:["enum:200","enum:201","number:200","number:201","number:202","text:200","text:201","text:202","text:203"]}, d:600});

    runStep();
}

// ── BOOT ─────────────────────────────────────────────────
function init() {
    console.log("[SEEDER] WC2026 Seeder 1.0-beta");
    console.log("[SEEDER] Waiting 5s for installer HTTP server to release...");
    Timer.set(5000, false, function() {
        Shelly.call("KVS.Get", {key:"wc_teams"}, function(r, e) {
            let ids = [];
            if (e === 0 && r && r.value) {
                let tm = null;
                try { tm = JSON.parse(r.value); } catch(x) {}
                if (tm && tm.teams) ids = tm.teams;
            }
            if (ids.length === 0) {
                console.log("[SEEDER] WARNING: no teams in wc_teams. Mode enum will have Live1/Live2/Auto only.");
            } else {
                console.log("[SEEDER] " + ids.length + " teams selected. Building components.");
            }
            buildQueue(ids);
        });
    });
}

init();
