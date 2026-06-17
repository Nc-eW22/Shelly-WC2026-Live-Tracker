// ⚽ SPARK_LABS — WC2026 API Debug
// Version: 1.0-beta
// Flash to any free slot, run once, read console, stop and delete.
// Tests API-Football v3 connectivity step by step.

let TOKEN = "YOUR_API_SPORTS_KEY_HERE";
let BASE  = "https://v3.football.api-sports.io";

function fire(label, url, cb) {
    console.log("[DBG] >> " + label);
    console.log("[DBG]    " + url);
    Shelly.call("HTTP.Request", {
        method: "GET",
        url: url,
        headers: {"x-apisports-key": TOKEN},
        timeout: 30
    }, function(r, e) {
        if (e) {
            console.log("[DBG] FAIL e=" + e);
            cb(false, null);
            return;
        }
        if (!r) {
            console.log("[DBG] FAIL no response object");
            cb(false, null);
            return;
        }
        console.log("[DBG] code=" + r.code + " body_len=" + (r.body ? r.body.length : 0));
        if (r.body && r.body.length > 0) {
            // Print first 300 chars only
            console.log("[DBG] body=" + r.body.slice(0, 300));
        }
        cb(r.code === 200, r);
    });
}

// Test 1: /status — tiny response, confirms auth + connectivity
// Test 2: /fixtures?league=1&season=2026&live=1 — live matches, small response
// Tests run sequentially with 2s gaps

function test1() {
    fire("TEST1 /status (auth check)", BASE + "/status", function(ok, r) {
        if (ok) {
            console.log("[DBG] TEST1 PASS — API reachable, auth valid");
        } else {
            console.log("[DBG] TEST1 FAIL — check token or connectivity");
        }
        Timer.set(2000, false, test2);
    });
}

function test2() {
    fire("TEST2 /fixtures live=1 (live matches)", BASE + "/fixtures?league=1&season=2026&live=1", function(ok, r) {
        if (ok) {
            console.log("[DBG] TEST2 PASS — fixtures endpoint works");
        } else {
            console.log("[DBG] TEST2 FAIL");
        }
        Timer.set(2000, false, test3);
    });
}

function test3() {
    // England's fixtures — per-team call
    fire("TEST3 /fixtures team=10 (England)", BASE + "/fixtures?league=1&season=2026&team=10", function(ok, r) {
        if (ok) {
            console.log("[DBG] TEST3 PASS — per-team endpoint works");
        } else {
            console.log("[DBG] TEST3 FAIL");
        }
        Timer.set(2000, false, test4);
    });
}

function test4() {
    // Standings — the one that hit -108 before, smaller now?
    fire("TEST4 /standings (may be large)", BASE + "/standings?league=1&season=2026", function(ok, r) {
        if (ok) {
            console.log("[DBG] TEST4 PASS — standings fits in buffer");
        } else {
            console.log("[DBG] TEST4 FAIL — likely buffer overflow or timeout");
        }
        console.log("[DBG] === ALL TESTS COMPLETE ===");
    });
}

console.log("[DBG] WC2026 API Debug v1.0 starting");
console.log("[DBG] Device time: " + JSON.stringify(Shelly.getComponentStatus("sys").time));
console.log("[DBG] Token: " + TOKEN.slice(0, 8) + "...");
test1();
