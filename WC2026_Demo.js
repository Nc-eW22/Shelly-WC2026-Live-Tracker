// ⚽ SPARK_LABS — WC2026 Live Tracker — Demo Replay
// Version: 1.0-beta
// Replays a completed match on the device card at configurable speed.
// UI output is an exact replica of the LIVE Brain display.
// Stop the Brain before running. Run once, record, stop and delete.

// ── DEMO CONFIG ──────────────────────────────────────────
// To find fixture IDs, use Postman (add x-apisports-key header):
//   GET https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=FT-AET-PEN
//   GET https://v3.football.api-sports.io/fixtures?league=1&season=2026&date=2026-06-14
// If FIX_ID is 0, the script logs lookup URLs and stops.
// TLAs auto-resolve from KVS group data — only IDs needed.

let FIX_ID = 1489375;        // AFS fixture ID (0 = logs help URLs and stops)
let HOME_ID = 1118;           // AFS team ID for home team
let AWAY_ID = 12;             // AFS team ID for away team
let SCORE_H = 2;              // Final home score
let SCORE_A = 1;              // Final away score
let GRP = "F";                // Group letter

let TICK_MS = 2000;           // ms per game minute (2000 = 3min full match)
let EVT_HOLD_MS = 5000;       // ms to pause and display each event
let HT_HOLD_MS = 8000;        // ms to hold at half time
let FT_HOLD_MS = 15000;       // ms to hold at full time before stop

// ── FLAG LOOKUP ──────────────────────────────────────────
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

// ── VC HANDLES ───────────────────────────────────────────
let hMode = null, hSt = null, hGF = null, hGA = null, hTm = null;
let hFd = null, hIA = null, hIB = null, hSg = null;

function getHandles() {
    hMode = Virtual.getHandle("enum:200"); hSt = Virtual.getHandle("enum:201");
    hGF = Virtual.getHandle("number:200"); hGA = Virtual.getHandle("number:201");
    hTm = Virtual.getHandle("number:202"); hFd = Virtual.getHandle("text:200");
    hIA = Virtual.getHandle("text:201"); hIB = Virtual.getHandle("text:202");
    hSg = Virtual.getHandle("text:203");
    return hMode && hSt && hGF && hGA && hTm && hFd && hIA && hIB && hSg;
}

function sv(h, v) { if (h) h.setValue(v); }

// ── RUNTIME STATE ────────────────────────────────────────
let _idToTla = {};
let _evts = {};
let _curH = 0;
let _curA = 0;
let _min = 0;
let _half = 1;
let _state = "IDLE";
let _token = "";
let _homeTla = "?";
let _awayTla = "?";
let _feed = "";
let _grpStr = "";
let _lastEvtTxt = "";

// ── KVS GROUP LOADER (Brain pattern) ─────────────────────
function loadGroups(cb) {
    let letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
    let idx = 0;
    function step() {
        if (idx >= letters.length) {
            console.log("[DEMO] idToTla: " + Object.keys(_idToTla).length + " entries");
            cb(); return;
        }
        let l = letters[idx]; idx = idx + 1;
        Shelly.call("KVS.Get", {key: "wc_grp_" + l}, function(r, e) {
            if (e === 0 && r && r.value) {
                let g = null;
                try { g = JSON.parse(r.value); } catch(x) {}
                if (g && g.teams && g.tlas) {
                    for (let j = 0; j < g.teams.length; j++) {
                        _idToTla[g.teams[j]] = g.tlas[j];
                    }
                }
            }
            Timer.set(100, false, step);
        });
    }
    step();
}

function resolveTlas() {
    _homeTla = _idToTla[HOME_ID] || "?";
    _awayTla = _idToTla[AWAY_ID] || "?";
    console.log("[DEMO] Home: " + _homeTla + " (" + HOME_ID + ") Away: " + _awayTla + " (" + AWAY_ID + ")");
    _feed = gF(_homeTla) + _homeTla + " vs " + _awayTla + gF(_awayTla);
}

// ── ONE-SHOT STANDINGS BUILD (Brain pattern, simplified) ──
function buildStandings(cb) {
    let grpKey = "wc_grp_" + GRP;
    Shelly.call("KVS.Get", {key: grpKey}, function(r, e) {
        if (e !== 0 || !r || !r.value) {
            _grpStr = "Grp " + GRP;
            console.log("[DEMO] No group data for " + GRP);
            cb(); return;
        }
        let g = null;
        try { g = JSON.parse(r.value); } catch(x) {}
        if (!g || !g.teams) { _grpStr = "Grp " + GRP; cb(); return; }

        let ids = g.teams;
        let count = ids.length;
        let rankSlots = []; let ptsSlots = [];
        for (let i = 0; i < count; i++) { rankSlots.push(99); ptsSlots.push(0); }
        let idx = 0;

        function next() {
            if (idx >= count) {
                // Sort by rank and build string (Brain pattern)
                let order = [];
                for (let i = 0; i < count; i++) order.push(i);
                for (let a = 0; a < count - 1; a++) {
                    for (let b = 0; b < count - a - 1; b++) {
                        if (rankSlots[order[b]] > rankSlots[order[b + 1]]) {
                            let t = order[b]; order[b] = order[b + 1]; order[b + 1] = t;
                        }
                    }
                }
                let out = "Grp " + GRP + " |";
                for (let k = 0; k < count; k++) {
                    let pos = order[k];
                    let tla = _idToTla[ids[pos]] || "?";
                    out = out + " " + gF(tla) + ptsSlots[pos] + " |";
                }
                _grpStr = out;
                console.log("[DEMO] Standings: " + _grpStr);
                cb(); return;
            }
            let slot = idx; let tid = ids[slot]; idx = idx + 1;
            let url = "https://v3.football.api-sports.io";
            Shelly.call("HTTP.Request", {
                method: "GET",
                url: url + "/standings?league=1&season=2026&team=" + tid,
                headers: {"x-apisports-key": _token}, timeout: 30
            }, function(resp, err) {
                if (!err && resp && resp.code === 200 && resp.body) {
                    let d = null;
                    try { d = JSON.parse(resp.body); } catch(x) {}
                    if (d && d.response && d.response.length > 0) {
                        let lg = d.response[0] && d.response[0].league;
                        if (lg && lg.standings && lg.standings[0] && lg.standings[0][0]) {
                            rankSlots[slot] = lg.standings[0][0].rank || 99;
                            ptsSlots[slot] = lg.standings[0][0].points || 0;
                        }
                    }
                    d = null;
                }
                resp = null;
                Timer.set(500, false, next);
            });
        }
        next();
    });
}

// ── BRAIN-MATCHING UI HELPERS ────────────────────────────
// Mirrors Brain liveIA(): label + persistent last event
function liveIA(label) {
    return _lastEvtTxt ? (label + " " + _lastEvtTxt) : label;
}

// ── STREAM EVENT SCANNER (Brain pattern — no JSON.parse) ─
// Forward-scans the raw body for ALL Goal/Card events.
// Same indexOf/slice approach as the Brain's scanLastEvent,
// applied iteratively to avoid the JSON.parse memory spike.
function scanAllEvents(body) {
    let searchPos = 0;
    let count = 0;
    let tmStr = '"team":{"id":';
    let foundTeams = {};

    while (searchPos < body.length) {
        let gp = body.indexOf('"type":"Goal"', searchPos);
        let cp = body.indexOf('"type":"Card"', searchPos);

        let pos = -1;
        let isGoal = false;
        if (gp >= 0 && (cp < 0 || gp < cp)) { pos = gp; isGoal = true; }
        else if (cp >= 0) { pos = cp; isGoal = false; }
        if (pos < 0) break;

        let ws = pos > 500 ? pos - 500 : 0;
        let we = pos + 200;
        if (we > body.length) we = body.length;
        let chunk = body.slice(ws, we);
        let offset = pos - ws;

        // All backward searches constrained to BEFORE the type marker
        // elapsed
        let elIdx = chunk.lastIndexOf('"elapsed":', offset);
        let elapsed = 0;
        if (elIdx >= 0) elapsed = parseInt(chunk.slice(elIdx + 10)) || 0;

        // extra
        let extra = 0;
        if (elIdx >= 0) {
            let exIdx = chunk.indexOf('"extra":', elIdx);
            if (exIdx >= 0 && exIdx < offset) {
                let exVal = chunk.slice(exIdx + 8, chunk.indexOf(',', exIdx + 8));
                if (exVal !== "null") extra = parseInt(exVal) || 0;
            }
        }

        // player name — search backward from type marker only
        let plIdx = chunk.lastIndexOf('"player"', offset);
        let pName = "?";
        if (plIdx >= 0) {
            let nmIdx = chunk.indexOf('"name":"', plIdx);
            if (nmIdx >= 0 && nmIdx < offset) {
                let ns = nmIdx + 8;
                let ne = chunk.indexOf('"', ns);
                if (ne > ns) pName = chunk.slice(ns, ne);
            }
        }

        // detail (after the type marker)
        let dtIdx = chunk.indexOf('"detail":"', offset);
        let detail = "";
        if (dtIdx >= 0) {
            let ds = dtIdx + 10;
            let de = chunk.indexOf('"', ds);
            if (de > ds) detail = chunk.slice(ds, de);
        }

        // team id — search backward from type marker only
        let tmIdx = chunk.lastIndexOf(tmStr, offset);
        let teamId = 0;
        if (tmIdx >= 0) {
            teamId = parseInt(chunk.slice(tmIdx + tmStr.length)) || 0;
        }
        foundTeams[teamId] = true;

        if (pName === "?") {
            console.log("[EVT] player=? at " + elapsed + "' tid=" + teamId + " pl@" + plIdx + " off=" + offset);
        }

        let isHome = (teamId === HOME_ID);
        let key = String(elapsed);
        if (!_evts[key]) _evts[key] = [];
        _evts[key].push({
            type: isGoal ? "goal" : "card",
            detail: detail, player: pName,
            min: elapsed, extra: extra, isHome: isHome
        });
        count = count + 1;
        chunk = null;
        searchPos = pos + 10;
    }
    console.log("[DEMO] Scanned " + count + " events across " + Object.keys(_evts).length + " minutes");

    // Config validation: check if HOME_ID matched any event
    let teamKeys = Object.keys(foundTeams);
    let homeFound = false;
    for (let i = 0; i < teamKeys.length; i++) {
        if (parseInt(teamKeys[i]) === HOME_ID) homeFound = true;
    }
    if (!homeFound && count > 0) {
        console.log("[DEMO] WARNING: HOME_ID " + HOME_ID + " not found in events!");
        console.log("[DEMO] Teams in fixture: " + teamKeys.join(", "));
        console.log("[DEMO] Update HOME_ID/AWAY_ID in config to match fixture.");
    }
}

// ── API EVENT FETCH ──────────────────────────────────────
function fetchEvents(cb) {
    if (FIX_ID === 0 || _token === "") {
        console.log("[DEMO] No fixture ID or no token — running clean walk");
        cb(); return;
    }
    let url = "https://v3.football.api-sports.io/fixtures/events?fixture=" + FIX_ID;
    console.log("[DEMO] Fetching events: " + url);
    Shelly.call("HTTP.Request", {
        method: "GET", url: url,
        headers: {"x-apisports-key": _token}, timeout: 30
    }, function(r, e) {
        if (e || !r || r.code !== 200 || !r.body) {
            console.log("[DEMO] Event fetch failed — running clean walk");
            r = null; cb(); return;
        }
        scanAllEvents(r.body);
        r.body = null; r = null; cb();
    });
}

// ── HTTP ENDPOINT (Brain-compatible for WLED Script C) ───
function registerEndpoint() {
    let sid = Shelly.getCurrentScriptId();
    HTTPServer.registerEndpoint("ctrl", function(req, res) {
        let q = req.query || "";
        if (q.indexOf("cmd=state") >= 0) {
            res.code = 200;
            res.headers = [["Content-Type", "application/json"]];
            res.body = JSON.stringify({
                ver: "demo-1.0", state: _state, mode: "Demo",
                fixture_id: FIX_ID,
                score_h: _curH, score_a: _curA,
                elapsed: _min, last_event: _lastEvtTxt
            });
            res.send(); return;
        }
        res.code = 400; res.body = "{}"; res.send();
    });
    let w = Shelly.getComponentStatus("wifi") || {};
    console.log("[DEMO] Endpoint: http://" + (w.sta_ip || "?") + "/script/" + sid + "/ctrl?cmd=state");
}

// ── TICK ENGINE ──────────────────────────────────────────
function processEvents(cb) {
    let key = String(_min);
    if (!_evts[key]) { cb(false); return; }
    let arr = _evts[key];
    let idx = 0;
    function next() {
        if (idx >= arr.length) { cb(true); return; }
        let ev = arr[idx]; idx = idx + 1;

        if (ev.type === "goal") {
            if (ev.detail !== "Missed Penalty") {
                if (ev.isHome) _curH = _curH + 1;
                else _curA = _curA + 1;
            }
        }

        let mStr = ev.min + (ev.extra > 0 ? "+" + ev.extra : "") + "'";
        let txt = "";
        if (ev.type === "goal") {
            if (ev.detail === "Own Goal") txt = "⚽ OG " + ev.player + " " + mStr;
            else if (ev.detail === "Penalty") txt = "⚽ PEN " + ev.player + " " + mStr;
            else if (ev.detail === "Missed Penalty") txt = "❌ PEN " + ev.player + " " + mStr;
            else txt = "⚽ " + ev.player + " " + mStr;
        } else {
            if (ev.detail === "Red Card") txt = "🟥 " + ev.player + " " + mStr;
            else txt = "🟨 " + ev.player + " " + mStr;
        }

        _lastEvtTxt = txt;

        let flashSt = "LIVE";
        if (ev.type === "goal" && ev.detail !== "Missed Penalty") flashSt = "KO";
        else if (ev.detail === "Red Card") flashSt = "RC";
        else if (ev.detail === "Yellow Card" || ev.detail === "Second Yellow card") flashSt = "YC";

        console.log("[DEMO] " + _min + "' " + txt);
        sv(hSt, flashSt);
        sv(hGF, _curH); sv(hGA, _curA);
        sv(hTm, _min > 120 ? 120 : _min);
        sv(hIA, liveIA("🔴 LIVE"));

        Timer.set(EVT_HOLD_MS, false, next);
    }
    next();
}

function tick() {
    _min = _min + 1;

    // ── KICK OFF ──
    if (_min === 1) {
        _state = "LIVE";
        console.log("[DEMO] ⚽ Kick Off");
        sv(hSt, "KO"); sv(hGF, 0); sv(hGA, 0); sv(hTm, 1);
        sv(hFd, _feed); sv(hIA, liveIA("🔴 LIVE")); sv(hIB, "⚡ SPARK_LABS"); sv(hSg, _grpStr);
        Timer.set(EVT_HOLD_MS, false, function() {
            sv(hSt, "LIVE");
            scheduleTick();
        });
        return;
    }

    // ── HALF TIME ──
    if (_min === 46 && _half === 1) {
        _half = 2; _min = 45; _state = "HT";
        console.log("[DEMO] ⏸️ HT " + _curH + "-" + _curA);
        sv(hSt, "HT"); sv(hGF, _curH); sv(hGA, _curA); sv(hTm, 45);
        sv(hFd, _feed); sv(hIA, liveIA("⏸️ HT")); sv(hIB, "⚡ SPARK_LABS"); sv(hSg, _grpStr);
        Timer.set(HT_HOLD_MS, false, function() {
            _min = 45; _state = "LIVE";
            console.log("[DEMO] ⚽ 2nd Half");
            sv(hSt, "KO"); sv(hIA, liveIA("🔴 LIVE"));
            Timer.set(EVT_HOLD_MS, false, function() {
                sv(hSt, "LIVE");
                scheduleTick();
            });
        });
        return;
    }

    // ── FULL TIME ──
    if (_min === 91) {
        _min = 90; _state = "FT";
        _curH = SCORE_H; _curA = SCORE_A;
        console.log("[DEMO] 🏁 FT " + _curH + "-" + _curA);
        sv(hSt, "FT"); sv(hGF, _curH); sv(hGA, _curA); sv(hTm, 90);
        sv(hFd, _feed); sv(hIA, liveIA("🏁 FT")); sv(hIB, "FT " + SCORE_H + "-" + SCORE_A); sv(hSg, _grpStr);
        Timer.set(FT_HOLD_MS, false, function() {
            console.log("[DEMO] Complete.");
            _state = "IDLE";
            sv(hSt, "IDLE"); sv(hGF, 0); sv(hGA, 0); sv(hTm, 0);
            sv(hFd, "⚽ Demo Complete");
            sv(hIA, "Run WC2026_LIVE_Beta.js");
            sv(hIB, "⚡ SPARK_LABS");
            sv(hSg, "Enjoy the match");
            Timer.set(1000, false, function() {
                Shelly.call("Script.Stop", {id: Shelly.getCurrentScriptId()}, null);
            });
        });
        return;
    }

    // ── NORMAL MINUTE ──
    sv(hTm, _min > 120 ? 120 : _min);
    processEvents(function(hadEvent) {
        if (!hadEvent) {
            sv(hSt, "LIVE");
            sv(hIA, liveIA("🔴 LIVE"));
        }
        scheduleTick();
    });
}

function scheduleTick() {
    Timer.set(TICK_MS, false, tick);
}

// ── BOOT ─────────────────────────────────────────────────
function init() {
    console.log("[DEMO] WC2026 Demo Replay 1.0-beta");
    if (!getHandles()) {
        console.log("[DEMO] FATAL: VCs not provisioned.");
        return;
    }

    if (FIX_ID === 0) {
        console.log("[DEMO] No FIX_ID set. Use Postman to find a completed fixture:");
        console.log("[DEMO] All completed:");
        console.log("[DEMO]   https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=FT-AET-PEN");
        console.log("[DEMO] By date:");
        console.log("[DEMO]   https://v3.football.api-sports.io/fixtures?league=1&season=2026&date=2026-06-14");
        console.log("[DEMO] By team:");
        console.log("[DEMO]   https://v3.football.api-sports.io/fixtures?league=1&season=2026&team=10");
        console.log("[DEMO] Header: x-apisports-key: <your token>");
        console.log("[DEMO] Stopping.");
        Timer.set(500, false, function() {
            Shelly.call("Script.Stop", {id: Shelly.getCurrentScriptId()}, null);
        });
        return;
    }

    // Read API token first (needed for standings + events)
    Shelly.call("KVS.Get", {key: "wc_auth"}, function(r, e) {
        if (e === 0 && r && r.value) {
            let a = null;
            try { a = JSON.parse(r.value); } catch(x) {}
            if (a && a.token) _token = a.token;
        }

        // Boot pipeline: groups → TLAs → standings → events → tick
        loadGroups(function() {
            resolveTlas();
            registerEndpoint();
            sv(hMode, "Live1");
            sv(hFd, _feed); sv(hIA, "Loading standings..."); sv(hIB, "⚡ SPARK_LABS"); sv(hSg, "Grp " + GRP);
            console.log("[DEMO] " + _homeTla + " vs " + _awayTla + " · FIX_ID=" + FIX_ID);

            // Build real standings before starting replay
            buildStandings(function() {
                sv(hSg, _grpStr);
                sv(hIA, "⚽ Demo starting...");
                console.log("[DEMO] Tick: " + TICK_MS + "ms/min · Hold: " + EVT_HOLD_MS + "ms");

                Timer.set(2000, false, function() {
                    fetchEvents(function() {
                        console.log("[DEMO] Starting replay");
                        scheduleTick();
                    });
                });
            });
        });
    });
}

init();
