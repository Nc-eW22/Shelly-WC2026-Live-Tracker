// ⚽ SPARK_LABS — WC2026 Live Tracker — LIVE Brain
// Premium tier — API-Football v3 (api-sports.io)
// Target: Shelly 1 Gen4 · fw 2.0.0-beta1+
// Real-time live scores, goal/card events, Live1/Live2 dual-game tracking.

let VER = "1.0-beta";
let BASE = "https://v3.football.api-sports.io";
let SEASON = "2026";
let LEAGUE = "1";
let MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── CONFIG (KVS) ─────────────────────────────────────────
let CFG = {
    token: "", tz: 2,
    poll_live_s: 30, poll_pre_s: 120, poll_idle_s: 600,
    poll_standings_s: 1800, pre_window_s: 3600,
    ft_hold_s: 7200, live2_revert_s: 30
};
let TEAMS = [];
let _idToTla = {};

// ── RUNTIME ──────────────────────────────────────────────
let _mode = "Live1";
let _state = "IDLE";
let _fixId = 0;
let _timer = null;
let _todayCount = 0;
let _live2Cached = null;
let _ftTs = 0;
let _live2NoTs = 0;
let _lastEvtCount = 0;
let _lastEvtTxt = "";
let _lastLiveFix = null;

// ── STANDINGS ────────────────────────────────────────────
let _grpStr = "";
let _grpLet = "";
let _grpTeamId = 0;
let _grpTs = 0;
let _grpBusy = false;
let _grpFixId = 0;
let _grpGen = 0;
let _nextStr = "—";

// ── VC HANDLES ───────────────────────────────────────────
let hMode=null, hSt=null, hGF=null, hGA=null, hTm=null;
let hFd=null, hIA=null, hIB=null, hSg=null;

// ── DEDUP ────────────────────────────────────────────────
let _cv = {};

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

function gFid(id) { return gF(_idToTla[id] || ""); }

// ── STATUS FLASH ENGINE (timerless — next render overwrites) ──
function flash(status) {
    sv("st", hSt, status);
}

// ── STREAMING RAW EVENT SCROLL WINDOW SCANNER ────────────
function scanLastEvent(body) {
    let gp = body.lastIndexOf('"type":"Goal"');
    let cp = body.lastIndexOf('"type":"Card"');
    let pos = (gp > cp) ? gp : cp;
    if (pos < 0) {
        // Diagnostic: live fixture returned a body but no goal/card markers matched.
        // If this fires repeatedly during a live match, the API event format may have changed.
        console.log("[EVT] no goal/card markers found");
        return;
    }
    let isGoal = (gp > cp);

    let ws = pos > 400 ? pos - 400 : 0;
    let chunk = body.slice(ws, pos + 100);

    let elIdx = chunk.lastIndexOf('"elapsed":');
    let elapsed = 0;
    if (elIdx >= 0) elapsed = parseInt(chunk.slice(elIdx + 10)) || 0;

    let exIdx = chunk.indexOf('"extra":', elIdx > 0 ? elIdx : 0);
    let extra = 0;
    if (exIdx >= 0) {
        let exVal = chunk.slice(exIdx + 8, chunk.indexOf(',', exIdx + 8));
        if (exVal !== "null") extra = parseInt(exVal) || 0;
    }

    let plIdx = chunk.lastIndexOf('"player"');
    let pName = "?";
    if (plIdx >= 0) {
        let nmIdx = chunk.indexOf('"name":"', plIdx);
        if (nmIdx >= 0) {
            let ns = nmIdx + 8;
            let ne = chunk.indexOf('"', ns);
            if (ne > ns) pName = chunk.slice(ns, ne);
        }
    }

    let dtIdx = chunk.lastIndexOf('"detail":"');
    let detail = "";
    if (dtIdx >= 0) {
        let ds = dtIdx + 10;
        let de = chunk.indexOf('"', ds);
        if (de > ds) detail = chunk.slice(ds, de);
    }

    let mStr = elapsed + (extra > 0 ? "+" + extra : "") + "'";
    let newTxt = "";

    if (isGoal) {
        if (detail === "Own Goal") newTxt = "⚽ OG " + pName + " " + mStr;
        else if (detail === "Penalty") newTxt = "⚽ PEN " + pName + " " + mStr;
        else if (detail === "Missed Penalty") newTxt = "❌ PEN " + pName + " " + mStr;
        else newTxt = "⚽ " + pName + " " + mStr;
    } else {
        if (detail === "Red Card") newTxt = "🟥 " + pName + " " + mStr;
        else if (detail === "Yellow Card") newTxt = "🟨 " + pName + " " + mStr;
        else newTxt = "🟨 " + pName + " " + mStr;
    }

    if (newTxt !== _lastEvtTxt) {
        _lastEvtTxt = newTxt;
        if (!isGoal) {
            if (detail === "Red Card") { flash("RC"); }
            else { flash("YC"); }
        }
    }
    chunk = null;
}

function fetchLastEvent(fixId, cb) {
    let url = BASE + "/fixtures/events?fixture=" + fixId;
    console.log("[BRAIN] EVT " + fixId);
    Shelly.call("HTTP.Request", {
        method: "GET", url: url,
        headers: {"x-apisports-key": CFG.token}, timeout: 30
    }, function(r, e) {
        if (e || !r || r.code !== 200 || !r.body) { r = null; cb(); return; }
        scanLastEvent(r.body);
        r.body = null; r = null; cb();
    });
}

// ── DETERMINISTIC SEPARATED SLOT DEDUPLICATION ───────────
function sv(id, h, v) {
    if (!h) return;
    if (_cv[id] === v) return;
    _cv[id] = v;
    h.setValue(v);
}

function si(v, d) {
    if (v === null || v === undefined) return d;
    let n = parseInt(v);
    return isNaN(n) ? d : n;
}

function todayStr() {
    let d = new Date(Date.now());
    let y = d.getFullYear();
    let m = ("0" + (d.getMonth() + 1)).slice(-2);
    let dd = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + dd;
}

function fmtDate(s) {
    if (!s) return "—";
    let d = s.slice(8,10);
    let m = MONTHS[parseInt(s.slice(5,7)) - 1];
    let h = (parseInt(s.slice(11,13)) + CFG.tz + 48) % 24;
    let n = s.slice(14,16);
    return "📅" + d + " " + m + " @" + ("0" + h).slice(-2) + ":" + n;
}

function tlaOf(id, nm) {
    if (_idToTla[id]) return _idToTla[id];
    return (nm || "?").slice(0, 3).toUpperCase();
}

function pair(fix) {
    let h = fix.teams && fix.teams.home;
    let a = fix.teams && fix.teams.away;
    let ht = tlaOf(h && h.id, h && h.name);
    let at = tlaOf(a && a.id, a && a.name);
    return gF(ht) + ht + " vs " + at + gF(at);
}

function scH(f) { return si(f.goals && f.goals.home, 0); }
function scA(f) { return si(f.goals && f.goals.away, 0); }
function pnH(f) { return si(f.score && f.score.penalty && f.score.penalty.home, 0); }
function pnA(f) { return si(f.score && f.score.penalty && f.score.penalty.away, 0); }

function statusToState(s) {
    if (s === "1H" || s === "2H" || s === "LIVE") return "LIVE";
    if (s === "HT" || s === "BT") return "HT";
    if (s === "ET") return "ET";
    if (s === "P") return "PENS";
    if (s === "FT" || s === "AET" || s === "PEN") return "FT";
    return "IDLE";
}

function isGrpStage(round) {
    if (!round) return true;
    return round.slice(0, 11) === "Group Stage";
}

function get(path, cb) {
    let url = BASE + path;
    console.log("[BRAIN] GET " + url);
    Shelly.call("HTTP.Request", {
        method: "GET", url: url,
        headers: {"x-apisports-key": CFG.token}, timeout: 30
    }, function(r, e) {
        if (e || !r || r.code !== 200) {
            console.log("[BRAIN] HTTP err code=" + (r ? r.code : 0));
            cb(null); return;
        }
        let data = null;
        try { data = JSON.parse(r.body); } catch(x) {}
        r.body = null; r = null; cb(data);
    });
}

// ── STREAM FIXTURE SCANNER (no JSON.parse) ───────────────
// Forward-scans raw body for fixture blocks, extracts only the
// fields the Brain reads. Returns array matching the API structure
// so render/selectFixture/renderLiveMode work unchanged.
function scanFixtures(body) {
    let mk = '"fixture":{"id":';
    let fixes = [];
    let pos = 0;

    while (pos < body.length) {
        let fs = body.indexOf(mk, pos);
        if (fs < 0) break;
        let fe = body.indexOf(mk, fs + mk.length);
        if (fe < 0) fe = body.length;
        let c = body.slice(fs, fe);

        let fid = parseInt(c.slice(mk.length)) || 0;

        let stIdx = c.indexOf('"short":"');
        let st = "NS";
        if (stIdx >= 0) { let ss = stIdx + 9; let se = c.indexOf('"', ss); if (se > ss) st = c.slice(ss, se); }

        let elIdx = c.indexOf('"elapsed":');
        let el = 0;
        if (elIdx >= 0) { let ev = c.slice(elIdx + 10, c.indexOf(',', elIdx + 10)); if (ev !== "null") el = parseInt(ev) || 0; }

        let tsIdx = c.indexOf('"timestamp":');
        let ts = 0;
        if (tsIdx >= 0) ts = parseInt(c.slice(tsIdx + 12)) || 0;

        let dtIdx = c.indexOf('"date":"');
        let dateStr = "";
        if (dtIdx >= 0) { let ds = dtIdx + 8; let de = c.indexOf('"', ds); if (de > ds) dateStr = c.slice(ds, de); }

        let rnIdx = c.indexOf('"round":"');
        let round = "";
        if (rnIdx >= 0) { let rs = rnIdx + 9; let re = c.indexOf('"', rs); if (re > rs) round = c.slice(rs, re); }

        let hmIdx = c.indexOf('"home":{"id":');
        let hid = 0; let hname = "?";
        if (hmIdx >= 0) {
            hid = parseInt(c.slice(hmIdx + 13)) || 0;
            let hn = c.indexOf('"name":"', hmIdx); if (hn >= 0) { let ns = hn + 8; let ne = c.indexOf('"', ns); if (ne > ns) hname = c.slice(ns, ne); }
        }

        let awIdx = c.indexOf('"away":{"id":');
        let aid = 0; let aname = "?";
        if (awIdx >= 0) {
            aid = parseInt(c.slice(awIdx + 13)) || 0;
            let an = c.indexOf('"name":"', awIdx); if (an >= 0) { let ns = an + 8; let ne = c.indexOf('"', ns); if (ne > ns) aname = c.slice(ns, ne); }
        }

        let glIdx = c.indexOf('"goals":{"home":');
        let gh = 0; let ga = 0;
        if (glIdx >= 0) {
            let gv = c.slice(glIdx + 16, c.indexOf(',', glIdx + 16)); if (gv !== "null") gh = parseInt(gv) || 0;
            let gaIdx = c.indexOf('"away":', glIdx + 16); if (gaIdx >= 0) { let gav = c.slice(gaIdx + 7, c.indexOf('}', gaIdx)); if (gav !== "null") ga = parseInt(gav) || 0; }
        }

        let pnIdx = c.indexOf('"penalty":{"home":');
        let pnh = 0; let pna = 0;
        if (pnIdx >= 0) {
            let pv = c.slice(pnIdx + 18, c.indexOf(',', pnIdx + 18)); if (pv !== "null") pnh = parseInt(pv) || 0;
            let paIdx = c.indexOf('"away":', pnIdx + 18); if (paIdx >= 0) { let pav = c.slice(paIdx + 7, c.indexOf('}', paIdx)); if (pav !== "null") pna = parseInt(pav) || 0; }
        }

        fixes.push({
            fixture: {id: fid, status: {short: st, elapsed: el}, timestamp: ts, date: dateStr},
            teams: {home: {id: hid, name: hname}, away: {id: aid, name: aname}},
            goals: {home: gh, away: ga},
            league: {round: round},
            score: {penalty: {home: pnh, away: pna}}
        });

        c = null;
        pos = fs + mk.length;
    }
    return fixes;
}

function getFixtures(path, cb) {
    let url = BASE + path;
    console.log("[BRAIN] GET " + url);
    Shelly.call("HTTP.Request", {
        method: "GET", url: url,
        headers: {"x-apisports-key": CFG.token}, timeout: 30
    }, function(r, e) {
        if (e || !r || r.code !== 200 || !r.body) {
            console.log("[BRAIN] HTTP err code=" + (r ? r.code : 0));
            cb(null); return;
        }
        let fixes = scanFixtures(r.body);
        r.body = null; r = null; cb(fixes);
    });
}

// ── ON-DEMAND SERIAL 4-CALL STANDINGS ENGINE ─────────────
function standingsStale() {
    if (_grpTs === 0) return true;
    if (_grpTeamId !== resolveTeamId()) return true;
    return (Math.floor(Date.now() / 1000) - _grpTs) > CFG.poll_standings_s;
}

function resolveTeamId() {
    if (_mode === "Live1" || _mode === "Live2" || _mode === "Auto") {
        return TEAMS.length > 0 ? TEAMS[0] : 0;
    }
    let keys = Object.keys(_idToTla);
    for (let i = 0; i < keys.length; i++) {
        if (_idToTla[keys[i]] === _mode) return parseInt(keys[i]);
    }
    return 0;
}

function buildStandings(teamId) {
    if (_grpBusy) return;
    if (!teamId || teamId === 0) return;
    _grpBusy = true;
    let myGen = _grpGen;

    findGroup(teamId, function(letter, ids) {
        if (myGen !== _grpGen) { _grpBusy = false; return; }
        if (!letter || !ids) { _grpBusy = false; return; }
        _grpLet = letter;
        let count = ids.length;
        let rankSlots = []; let ptsSlots = []; let idSlots = [];
        for (let i = 0; i < count; i++) {
            rankSlots.push(99); ptsSlots.push(0); idSlots.push(ids[i]);
        }
        let idx = 0;
        function next() {
            if (myGen !== _grpGen) { _grpBusy = false; return; }
            if (idx >= count) {
                let order = [];
                for (let i = 0; i < count; i++) order.push(i);
                for (let a = 0; a < count - 1; a++) {
                    for (let b = 0; b < count - a - 1; b++) {
                        if (rankSlots[order[b]] > rankSlots[order[b+1]]) {
                            let t = order[b]; order[b] = order[b+1]; order[b+1] = t;
                        }
                    }
                }
                let out = "Grp " + letter + " |";
                for (let k = 0; k < count; k++) {
                    let pos = order[k];
                    let tla = _idToTla[idSlots[pos]] || "?";
                    out += " " + gF(tla) + ptsSlots[pos] + " |";
                }
                _grpStr = out;
                _grpTs = Math.floor(Date.now() / 1000);
                _grpTeamId = teamId; _grpBusy = false;
                if (_state !== "Error") {
                    sv("sg", hSg, _grpStr);
                }
                rankSlots = null; ptsSlots = null; idSlots = null; order = null;
                return;
            }
            let slot = idx; let tid = idSlots[slot]; idx++;
            get("/standings?league=" + LEAGUE + "&season=" + SEASON + "&team=" + tid, function(d) {
                if (d && d.response && d.response.length > 0) {
                    let lg = d.response[0] && d.response[0].league;
                    if (lg && lg.standings && lg.standings[0] && lg.standings[0][0]) {
                        let e = lg.standings[0][0];
                        rankSlots[slot] = e.rank || 99;
                        ptsSlots[slot] = e.points || 0;
                    }
                }
                d = null; Timer.set(500, false, next);
            });
        }
        next();
    });
}

function findGroup(teamId, cb) {
    let letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
    let idx = 0;
    function step() {
        if (idx >= letters.length) { cb(null, null); return; }
        let l = letters[idx]; idx++;
        Shelly.call("KVS.Get", {key: "wc_grp_" + l}, function(r, e) {
            if (e === 0 && r && r.value) {
                let g = null; try { g = JSON.parse(r.value); } catch(x) {}
                if (g && g.teams) {
                    for (let j = 0; j < g.teams.length; j++) {
                        if (g.teams[j] === teamId) { cb(l, g.teams); return; }
                    }
                }
            }
            Timer.set(100, false, step);
        });
    }
    step();
}

// ── STAGE VIEW UTILITIES ─────────────────────────────────
function stageStr() {
    if (!_grpStr || _grpStr === "") { return "Grp " + (_grpLet || "?") + " | Loading..."; }
    return _grpStr;
}

function stageKnock(fix, state, el) {
    let r = (fix.league && fix.league.round) || "Knock";
    r = r.split("Quarter-finals").join("QF");
    r = r.split("Semi-finals").join("SF");
    r = r.split("Round of 16").join("R16");
    let h = fix.teams && fix.teams.home;
    let a = fix.teams && fix.teams.away;
    let ht = tlaOf(h && h.id, h && h.name);
    let at = tlaOf(a && a.id, a && a.name);
    if (state === "IDLE" || state === "PRE") { return r + " · " + ht + gF(ht) + " vs " + at + gF(at); }
    if (state === "FT") { return r + " · " + ht + gF(ht) + " " + scH(fix) + "-" + scA(fix) + " " + at + gF(at) + " FT"; }
    return r + " · Min " + el + "'";
}

// ── LIVE2 SECONDARY-MATCH TICKER ─────────────────────────
function live2Tick(fix) {
    if (!fix) return "—";
    let h = fix.teams && fix.teams.home;
    let a = fix.teams && fix.teams.away;
    let ht = tlaOf(h && h.id, h && h.name);
    let at = tlaOf(a && a.id, a && a.name);
    let el = fix.fixture && fix.fixture.status && fix.fixture.status.elapsed;
    return "Also: " + ht + gF(ht) + " " + scH(fix) + "-" + scA(fix) + " " + at + gF(at) + " " + (el || 0) + "'";
}

// ── UI STRING HELPERS (v7.6) ─────────────────────────────
function idOf(f) { return si(f && f.fixture && f.fixture.id, 0); }

function koTime(s) {
    if (!s) return "";
    let h = (parseInt(s.slice(11,13)) + CFG.tz + 48) % 24;
    let n = s.slice(14,16);
    return "" + ("0" + h).slice(-2) + ":" + n;
}

function mdStr(round) {
    if (!round) return "";
    if (round.slice(0,11) === "Group Stage") {
        let p = round.lastIndexOf("- ");
        if (p >= 0) return "MD" + round.slice(p + 2);
        return "GS";
    }
    let r = round;
    r = r.split("Round of 16").join("R16");
    r = r.split("Quarter-finals").join("QF");
    r = r.split("Semi-finals").join("SF");
    r = r.split("3rd Place").join("3rd");
    return r;
}

function nextStr(f) {
    if (!f) return "—";
    let md = mdStr((f.league && f.league.round) || "");
    return "⏭️ " + pair(f) + " " + koTime(f.fixture && f.fixture.date);
}

function headLine(f) {
    if (!f) return "WC2026";
    return pair(f) + " " + koTime(f.fixture && f.fixture.date);
}

function liveIA(label) {
    return _lastEvtTxt ? (label + " " + _lastEvtTxt) : label;
}

function liveIB() {
    if (_live2Cached) return live2Tick(_live2Cached);
    return _nextStr;
}

function nthUpcoming(arr, exclude) {
    let best = null; let bestTs = 0;
    for (let i = 0; i < arr.length; i++) {
        let f = arr[i];
        let fid = idOf(f);
        let skip = false;
        for (let j = 0; j < exclude.length; j++) { if (exclude[j] === fid) skip = true; }
        if (skip) continue;
        let ts = si(f.fixture && f.fixture.timestamp, 0);
        if (!best || ts < bestTs) { best = f; bestTs = ts; }
    }
    return best;
}

// ── RENDER PIPELINE ──────────────────────────────────────
function render(fix) {
    let isLiveMode = (_mode === "Live1" || _mode === "Live2");

    if (!fix) {
        sv("st", hSt, "IDLE"); sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
        sv("fd", hFd, "WC2026"); sv("ia", hIA, "—"); sv("ib", hIB, isLiveMode ? liveIB() : "—"); sv("sg", hSg, "WC 2026");
        return;
    }

    let elapsed = si(fix.fixture && fix.fixture.status && fix.fixture.status.elapsed, 0);
    let apiSt = (fix.fixture && fix.fixture.status && fix.fixture.status.short) || "NS";
    let round = (fix.league && fix.league.round) || "";
    let grpStage = isGrpStage(round);
    let feed = pair(fix);
    let newSt = statusToState(apiSt);
    let fid = si(fix.fixture && fix.fixture.id, 0);

    if (fid && fid !== _fixId) {
        _fixId = fid;
        Script.storage.setItem("fix_id", String(fid));
        _lastEvtCount = 0; _lastEvtTxt = "";
        sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
    }

    // Live1/Live2: rebuild group standings once per displayed fixture (gen-guarded)
    if (isLiveMode && fid && fid !== _grpFixId && !_grpBusy) {
        let homeId = si(fix.teams && fix.teams.home && fix.teams.home.id, 0);
        if (homeId) { _grpFixId = fid; _grpStr = ""; _grpGen = _grpGen + 1; buildStandings(homeId); }
    }

    if (newSt === "FT") {
        if (_ftTs === 0) _ftTs = Date.now();
        if (Date.now() - _ftTs > CFG.ft_hold_s * 1000) { _ftTs = 0; newSt = "IDLE"; }
    } else { _ftTs = 0; }

    let prev = _state;
    let isKO = (newSt === "LIVE" && (prev === "PRE" || prev === "IDLE") && elapsed <= 3);
    let is2H = (newSt === "LIVE" && prev === "HT");
    let isET = (newSt === "ET" && prev !== "ET" && prev !== "Error");
    _state = newSt;

    let sg;
    if (isLiveMode) {
        sg = (_grpStr && _grpStr !== "") ? _grpStr : ("WC2026 · " + _todayCount + (_todayCount === 1 ? " match today" : " matches today"));
    } else {
        sg = grpStage ? stageStr() : stageKnock(fix, newSt, elapsed);
    }

    let ko = si(fix.fixture && fix.fixture.timestamp, 0) * 1000;
    if (newSt === "IDLE" && ko > Date.now() && (ko - Date.now()) <= CFG.pre_window_s * 1000) {
        newSt = "PRE"; _state = "PRE";
    }

    if (newSt === "IDLE") {
        sv("st", hSt, "IDLE"); sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
        sv("fd", hFd, feed); sv("ia", hIA, fmtDate(fix.fixture && fix.fixture.date));
        sv("ib", hIB, isLiveMode ? liveIB() : "—"); sv("sg", hSg, sg);
        return;
    }

    if (newSt === "PRE") {
        let mins = Math.round((ko - Date.now()) / 60000);
        sv("st", hSt, "PRE"); sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
        sv("fd", hFd, feed); sv("ia", hIA, "⏱ Kick-off in " + mins + "m");
        sv("ib", hIB, isLiveMode ? liveIB() : fmtDate(fix.fixture && fix.fixture.date)); sv("sg", hSg, sg);
        return;
    }

    let sH = scH(fix), sA = scA(fix);
    if (newSt === "PENS") { sH = pnH(fix); sA = pnA(fix); }

    if (newSt === "LIVE") {
        if (isKO || is2H) { flash("KO"); } else { sv("st", hSt, "LIVE"); }
        sv("gf", hGF, sH); sv("ga", hGA, sA);
        sv("tm", hTm, elapsed > 120 ? 120 : elapsed); sv("fd", hFd, feed);
        sv("ia", hIA, isLiveMode ? liveIA("🔴") : (isKO ? "⚽ Kick Off!" : ("🔴 Min " + elapsed + "'")));
        sv("ib", hIB, isLiveMode ? liveIB() : (_lastEvtTxt || (sH + "-" + sA))); sv("sg", hSg, sg);
        return;
    }
    if (newSt === "HT") {
        sv("st", hSt, "HT"); sv("gf", hGF, sH); sv("ga", hGA, sA); sv("tm", hTm, 45);
        sv("fd", hFd, feed); sv("ia", hIA, isLiveMode ? liveIA("⏸️ HT") : ("⏸️ Half Time " + sH + "-" + sA));
        sv("ib", hIB, isLiveMode ? liveIB() : (_lastEvtTxt || "—")); sv("sg", hSg, sg);
        return;
    }
    if (newSt === "ET") {
        if (isET) { flash("KO"); } else { sv("st", hSt, "ET"); }
        sv("gf", hGF, sH); sv("ga", hGA, sA);
        sv("tm", hTm, elapsed > 120 ? 120 : elapsed); sv("fd", hFd, feed);
        sv("ia", hIA, isLiveMode ? liveIA("⏱ ET") : ("⏱ ET · " + elapsed + "'"));
        sv("ib", hIB, isLiveMode ? liveIB() : (_lastEvtTxt || ("AET " + sH + "-" + sA))); sv("sg", hSg, sg);
        return;
    }
    if (newSt === "PENS") {
        sv("st", hSt, "PENS"); sv("gf", hGF, sH); sv("ga", hGA, sA); sv("tm", hTm, 120);
        sv("fd", hFd, feed); sv("ia", hIA, isLiveMode ? liveIA("🥅 Pens") : ("🥅 Penalties " + sH + "-" + sA));
        sv("ib", hIB, isLiveMode ? liveIB() : (_lastEvtTxt || "—")); sv("sg", hSg, sg);
        return;
    }
    if (newSt === "FT") {
        let lbl = "🏁 Full Time"; if (apiSt === "AET") lbl = "🏁 AET"; if (apiSt === "PEN") lbl = "🏁 Pens";
        let ftLbl = "🏁 FT"; if (apiSt === "AET") ftLbl = "🏁 AET"; if (apiSt === "PEN") ftLbl = "🏁 Pens";
        let infoB = "FT " + sH + "-" + sA;
        if (apiSt === "PEN") { infoB = "PEN " + pnH(fix) + "-" + pnA(fix) + " (AET " + sH + "-" + sA + ")"; }
        sv("st", hSt, "FT"); sv("gf", hGF, sH); sv("ga", hGA, sA); sv("tm", hTm, apiSt === "FT" ? 90 : 120);
        sv("fd", hFd, feed); sv("ia", hIA, isLiveMode ? liveIA(ftLbl) : lbl); sv("ib", hIB, isLiveMode ? liveIB() : infoB); sv("sg", hSg, sg);
        return;
    }
}

function pollRate() {
    if (_state === "LIVE" || _state === "HT" || _state === "ET" || _state === "PENS") return CFG.poll_live_s;
    if (_state === "PRE") return CFG.poll_pre_s;
    return CFG.poll_idle_s;
}

function schedNext(s) {
    if (_timer) { Timer.clear(_timer); _timer = null; }
    _timer = Timer.set(s * 1000, false, poll);
}

// ── DYNAMIC SERVER-SIDE SCOPED POLLING ───────────────────
function poll() {
    if (_mode === "Live") _mode = "Live1";

    let _sys = Shelly.getComponentStatus("sys");
    console.log("[HEAP] free=" + (_sys ? _sys.ram_free : "?") + " min=" + (_sys ? _sys.ram_min_free : "?") + " state=" + _state + " mode=" + _mode);
    _sys = null;

    let isLive = (_mode === "Live1" || _mode === "Live2");

    if (isLive) {
        let tStr = todayStr();
        let livePath = "/fixtures?league=" + LEAGUE + "&season=" + SEASON + "&from=" + tStr + "&to=" + tStr + "&status=1H-2H-HT-ET-P-BT";
        getFixtures(livePath, function(arr) {
            if (!arr) { console.log("[BRAIN] API err — holding display"); schedNext(pollRate()); return; }
            if (arr.length > 0) {
                _todayCount = arr.length; renderLiveMode(arr); arr = null;
                // One-shot NS primer: populate _nextStr on first live poll
                if (_nextStr === "—") {
                    Timer.set(3000, false, function() {
                        let nsPath = "/fixtures?league=" + LEAGUE + "&season=" + SEASON + "&from=" + tStr + "&to=" + tStr + "&status=NS-TBD";
                        getFixtures(nsPath, function(ns) {
                            if (ns && ns.length > 0) {
                                _nextStr = nextStr(nthUpcoming(ns, []));
                            }
                            ns = null;
                        });
                    });
                }
            } else {
                // No live games — check cached FT hold before idle fetch
                arr = null;
                if (_lastLiveFix) {
                    let ftTs = si(_lastLiveFix.fixture && _lastLiveFix.fixture.timestamp, 0) * 1000;
                    if (Date.now() - (ftTs + 5400000) < CFG.ft_hold_s * 1000) {
                        render(_lastLiveFix); schedNext(pollRate()); return;
                    }
                    _lastLiveFix = null;
                }
                Timer.set(1500, false, function() {
                    let idlePath = "/fixtures?league=" + LEAGUE + "&season=" + SEASON + "&from=" + tStr + "&to=" + tStr + "&status=NS-TBD";
                    getFixtures(idlePath, function(arr2) {
                        if (!arr2) { console.log("[BRAIN] API err — holding display"); schedNext(pollRate()); return; }
                        _todayCount = arr2.length; renderLiveMode(arr2); arr2 = null;
                    });
                });
            }
        });
        return;
    }

    if (_mode === "Auto") {
        if (TEAMS.length === 0) { schedNext(CFG.poll_idle_s); return; }
        pollTeam(TEAMS[0]); return;
    }

    let teamId = resolveTeamId();
    if (teamId === 0) {
        sv("st", hSt, "Error"); sv("fd", hFd, "Unknown mode: " + _mode); schedNext(CFG.poll_idle_s); return;
    }
    pollTeam(teamId);
}

function pollTeam(teamId) {
    let path = "/fixtures?league=" + LEAGUE + "&season=" + SEASON + "&team=" + teamId;
    getFixtures(path, function(arr) {
        if (!arr || arr.length === 0) { render(null); schedNext(pollRate()); return; }
        let fix = selectFixture(arr); arr = null;
        if (!fix) { render(null); schedNext(pollRate()); return; }

        let s = (fix.fixture && fix.fixture.status && fix.fixture.status.short) || "NS";
        let st = statusToState(s);
        if (st === "LIVE" || st === "HT" || st === "ET" || st === "PENS") {
            let fid = si(fix.fixture && fix.fixture.id, 0);
            Timer.set(1500, false, function() {
                fetchLastEvent(fid, function() {
                    render(fix);
                    if (standingsStale()) buildStandings(teamId);
                    schedNext(pollRate());
                });
            });
        } else {
            render(fix); if (standingsStale()) buildStandings(teamId); schedNext(pollRate());
        }
    });
}

function renderLiveMode(matches) {
    let now = Date.now(); let live = null; let live2 = null;
    let upcoming = []; let lastFt = null;

    for (let i = 0; i < matches.length; i++) {
        let m = matches[i]; let s = (m.fixture && m.fixture.status && m.fixture.status.short) || "NS";
        if (s === "1H" || s === "2H" || s === "HT" || s === "ET" || s === "P" || s === "BT" || s === "LIVE") {
            if (!live) live = m; else if (!live2) live2 = m;
        } else if (s === "NS" || s === "TBD") { upcoming.push(m); }
        else if (s === "FT" || s === "AET" || s === "PEN") { if (!lastFt) lastFt = m; }
    }

    _live2Cached = live2;
    if (upcoming.length > 0) _nextStr = nextStr(nthUpcoming(upcoming, []));

    if (_mode === "Live2") {
        if (live2) { _live2NoTs = 0; pollEventsAndRender(live2); return; }
        if (_live2NoTs === 0) _live2NoTs = now;
        if (now - _live2NoTs > CFG.live2_revert_s * 1000) {
            _live2NoTs = 0; sv("mode", hMode, "Live1"); _mode = "Live1"; poll(); return;
        }
        let secs = Math.round(CFG.live2_revert_s - (now - _live2NoTs) / 1000);
        sv("st", hSt, "IDLE"); sv("fd", hFd, "No 2nd live game"); sv("ia", hIA, "Back to Live1 in " + secs + "s");
        sv("ib", hIB, live ? live2Tick(live) : "—"); sv("sg", hSg, "—"); schedNext(5); return;
    }

    if (live) { _live2NoTs = 0; _lastLiveFix = live; pollEventsAndRender(live); return; }

    if (lastFt) {
        let ftTs = si(lastFt.fixture && lastFt.fixture.timestamp, 0) * 1000;
        if (now - (ftTs + 5400000) < CFG.ft_hold_s * 1000) { render(lastFt); schedNext(pollRate()); return; }
    }

    if (upcoming.length > 0) {
        let u1 = nthUpcoming(upcoming, []);
        let ko = si(u1.fixture && u1.fixture.timestamp, 0) * 1000;
        let inPreWindow = (ko - now) <= CFG.pre_window_s * 1000 && ko > now;
        if (inPreWindow) {
            _nextStr = nextStr(nthUpcoming(upcoming, [idOf(u1)]));
            render(u1); schedNext(pollRate()); return;
        }

        let u2 = nthUpcoming(upcoming, [idOf(u1)]);
        let u3 = u2 ? nthUpcoming(upcoming, [idOf(u1), idOf(u2)]) : null;
        _state = "IDLE";
        sv("st", hSt, "IDLE"); sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
        sv("fd", hFd, headLine(u1));
        sv("ia", hIA, u2 ? nextStr(u2) : "—");
        sv("ib", hIB, u3 ? nextStr(u3) : "—");
        sv("sg", hSg, "WC2026 · " + _todayCount + (_todayCount === 1 ? " match today" : " matches today"));
        schedNext(pollRate()); return;
    }

    let tomMs = now + 86400000; let td = new Date(tomMs);
    let tomStr = td.getFullYear() + "-" + ("0" + (td.getMonth() + 1)).slice(-2) + "-" + ("0" + td.getDate()).slice(-2);
    getFixtures("/fixtures?league=" + LEAGUE + "&season=" + SEASON + "&from=" + tomStr + "&to=" + tomStr + "&status=NS", function(arr) {
        if (arr && arr.length > 0) {
            let next = arr[0]; sv("st", hSt, "IDLE"); sv("gf", hGF, 0); sv("ga", hGA, 0); sv("tm", hTm, 0);
            sv("fd", hFd, pair(next)); sv("ia", hIA, fmtDate(next.fixture && next.fixture.date)); sv("ib", hIB, "—"); sv("sg", hSg, "WC 2026");
        } else {
            sv("st", hSt, "IDLE"); sv("fd", hFd, "WC2026"); sv("ia", hIA, "No upcoming fixtures"); sv("ib", hIB, "—"); sv("sg", hSg, "WC 2026");
        }
        schedNext(pollRate());
    });
}

function pollEventsAndRender(fix) {
    let fid = si(fix.fixture && fix.fixture.id, 0);
    if (fid === 0) { render(fix); schedNext(pollRate()); return; }
    Timer.set(1500, false, function() {
        fetchLastEvent(fid, function() { render(fix); schedNext(pollRate()); });
    });
}

function selectFixture(fixtures) {
    let live = null; let upcoming = null; let lastFt = null; let now = Date.now();
    for (let i = 0; i < fixtures.length; i++) {
        let f = fixtures[i]; let s = (f.fixture && f.fixture.status && f.fixture.status.short) || "NS";
        let ts = si(f.fixture && f.fixture.timestamp, 0) * 1000;
        if (s === "1H" || s === "2H" || s === "HT" || s === "ET" || s === "P" || s === "BT" || s === "LIVE") { if (!live) live = f; }
        else if (s === "NS" || s === "TBD") { if (!upcoming || ts < si(upcoming.fixture && upcoming.fixture.timestamp, 0) * 1000) upcoming = f; }
        else if (s === "FT" || s === "AET" || s === "PEN") { if (!lastFt || ts > si(lastFt.fixture && lastFt.fixture.timestamp, 0) * 1000) lastFt = f; }
    }
    if (live) return live;
    if (lastFt) {
        let ftTs = si(lastFt.fixture && lastFt.fixture.timestamp, 0) * 1000;
        if (now - (ftTs + 5400000) < CFG.ft_hold_s * 1000) return lastFt;
    }
    if (upcoming) return upcoming; return lastFt;
}

// ── INTERFACE CHANGE EVENT LISTENER ──────────────────────
function setupListener() {
    if (!hMode) return;
    hMode.on("change", function(ev) {
        if (ev.source === "rpc" || ev.source === "loopback" || ev.source === "sys") return;
        let val = ev.value || ""; if (!val) return;
        if (val === "Live") val = "Live1"; if (val === _mode) return;

        _mode = val; _live2NoTs = 0; _live2Cached = null; _grpStr = "";
        _grpTs = 0; _grpTeamId = 0; _grpLet = ""; _grpFixId = 0; _grpGen = _grpGen + 1; _cv = {};

        console.log("[BRAIN] Mode → " + _mode);
        sv("fd", hFd, "Loading..."); sv("ia", hIA, "Fetching data"); sv("ib", hIB, "—"); sv("sg", hSg, "Updating...");

        if (_timer) { Timer.clear(_timer); _timer = null; }
        poll();
    });
    console.log("[BRAIN] Mode listener registered");
}

function registerEndpoint() {
    let sid = Shelly.getCurrentScriptId();
    HTTPServer.registerEndpoint("ctrl", function(req, res) {
        let q = req.query || "";
        if (q.indexOf("cmd=state") >= 0) {
            res.code = 200; res.headers = [["Content-Type", "application/json"]];
            res.body = JSON.stringify({
                ver: VER, state: _state, mode: _mode, fixture_id: _fixId,
                score_h: hGF ? hGF.getValue() : 0, score_a: hGA ? hGA.getValue() : 0,
                elapsed: hTm ? hTm.getValue() : 0, last_event: _lastEvtTxt
            });
            res.send(); return;
        }
        res.code = 400; res.body = "{}"; res.send();
    });
    let w = Shelly.getComponentStatus("wifi") || {};
    console.log("[BRAIN] Endpoint: http://" + (w.sta_ip || "?") + "/script/" + sid + "/ctrl?cmd=state");
}

function loadKVS(cb) {
    Shelly.call("KVS.Get", {key: "wc_auth"}, function(r, e) {
        if (e !== 0 || !r || !r.value) { console.log("[BRAIN] FATAL: wc_auth missing"); return; }
        let a = null; try { a = JSON.parse(r.value); } catch(x) {}
        if (!a || !a.token) { return; } CFG.token = a.token;

        Shelly.call("KVS.Get", {key: "wc_timing"}, function(r2, e2) {
            if (e2 === 0 && r2 && r2.value) {
                let t = null; try { t = JSON.parse(r2.value); } catch(x) {}
                if (t) {
                    if (t.tz !== undefined) CFG.tz = t.tz;
                    if (t.poll_live_s) CFG.poll_live_s = t.poll_live_s;
                    if (t.poll_pre_s) CFG.poll_pre_s = t.poll_pre_s;
                    if (t.poll_idle_s) CFG.poll_idle_s = t.poll_idle_s;
                    if (t.poll_standings_s) CFG.poll_standings_s = t.poll_standings_s;
                    if (t.pre_window_s) CFG.pre_window_s = t.pre_window_s;
                    if (t.ft_hold_s) CFG.ft_hold_s = t.ft_hold_s;
                    if (t.live2_revert_s) CFG.live2_revert_s = t.live2_revert_s;
                }
            }
            Shelly.call("KVS.Get", {key: "wc_teams"}, function(r3, e3) {
                if (e3 === 0 && r3 && r3.value) {
                    let tm = null; try { tm = JSON.parse(r3.value); } catch(x) {}
                    if (tm && tm.teams) TEAMS = tm.teams;
                }
                loadGroups(cb);
            });
        });
    });
}

function loadGroups(cb) {
    let letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
    let idx = 0;
    function step() {
        if (idx >= letters.length) { console.log("[BRAIN] idToTla: " + Object.keys(_idToTla).length + " entries"); cb(); return; }
        let l = letters[idx]; idx++;
        Shelly.call("KVS.Get", {key: "wc_grp_" + l}, function(r, e) {
            if (e === 0 && r && r.value) {
                let g = null; try { g = JSON.parse(r.value); } catch(x) {}
                if (g && g.teams && g.tlas) {
                    for (let j = 0; j < g.teams.length; j++) { _idToTla[g.teams[j]] = g.tlas[j]; }
                }
            }
            Timer.set(150, false, step);
        });
    }
    step();
}

function getHandles() {
    hMode = Virtual.getHandle("enum:200"); hSt   = Virtual.getHandle("enum:201");
    hGF   = Virtual.getHandle("number:200"); hGA   = Virtual.getHandle("number:201");
    hTm   = Virtual.getHandle("number:202"); hFd   = Virtual.getHandle("text:200");
    hIA   = Virtual.getHandle("text:201"); hIB   = Virtual.getHandle("text:202");
    hSg   = Virtual.getHandle("text:203");
    return hMode && hSt && hGF && hGA && hTm && hFd && hIA && hIB && hSg;
}

function restore() {
    let f = Script.storage.getItem("fix_id");
    if (f) _fixId = parseInt(f) || 0;
    console.log("[BRAIN] Restore: fix_id=" + _fixId);
}

// ── FIXED PIPELINE SETTLING BOOT ─────────────────────────
function init() {
    console.log("[BRAIN] WC2026 v" + VER + " boot");
    if (!getHandles()) return; restore();
    loadKVS(function() {
        setupListener(); registerEndpoint();
        if (hMode) {
            let m = hMode.getValue();
            if (m && m !== "") _mode = m; if (_mode === "Live") _mode = "Live1";
        }
        // Gating step: Delays the initial query execution to let heap rest after parsing the 12 group KVS states
        console.log("[BRAIN] Memory stabilizing... initializing track engine");
        Timer.set(4000, false, poll);
    });
}

init();