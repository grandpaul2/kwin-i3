// Where workspaces live when outputs come and go (i3's
// randr.c move_content and init_ws_for_output). Pure functions of a snapshot, so they are
// unit-tested (tests/unit/outputs.test.js); src/kwin.js screensChanged takes the snapshot and acts.
//
// The snapshot st: { outputs: [connected output names, KWin's order, primary first],
//   homes: { num: output name }, assigned: { num: [output names, the setting's order] },
//   occupied: { num: true } (workspaces with windows), focused: num or null }.

var Outputs = (function () {
    function connected(st, name) { return st.outputs.indexOf(name) >= 0; }
    // i3's get_assigned_output: the first connected output of the workspace's list, or null.
    function firstAssigned(num, st) {
        var list = st.assigned[num] || [];
        for (var i = 0; i < list.length; i++) if (connected(st, list[i])) return list[i];
        return null;
    }
    function nums(obj) { return Object.keys(obj).map(Number).sort(function (a, b) { return a - b; }); }

    // B. An output lost (move_content): where each workspace that lived on it goes, for good.
    // With windows, or the focused one: the first output (i3's move_content, randr.c: every
    // workspace of a lost output to get_first_output(), the primary, assignments not read; they
    // bring it back when its output returns, movingTo); an empty unfocused one has no lasting
    // output (i3 closes it): null.
    // -> { num: new home or null } for every workspace whose home was the lost output.
    function homesAfterLoss(lost, st) {
        var out = {};
        nums(st.homes).forEach(function (n) {
            if (st.homes[n] !== lost) return;
            if (!st.occupied[n] && st.focused !== n) { out[n] = null; return; }
            out[n] = st.outputs[0] || null;
        });
        return out;
    }

    // C1. An output X appearing (init_ws_for_output): the workspaces that move to it: every one
    // that exists (has a home) whose first connected assigned output is X and whose home isn't X
    // already, lowest first. i3 loops over its existing workspaces only (randr.c:462-486); an
    // assigned one not made yet is made when it is shown (C3) or first used.
    function movingTo(X, st) {
        return nums(st.homes).filter(function (n) { return firstAssigned(n, st) === X && st.homes[n] !== X; });
    }

    // C2. What a source output shows once the workspace it showed has moved away (i3's focus
    // order, as S10): the one it most recently showed that has windows and still lives there
    // (`recent`: numbers, most recent first), else its lowest with windows, else null (the caller
    // finds an unused one).
    function sourceShows(source, recent, st) {
        function fits(n) { return st.homes[n] === source && !!st.occupied[n]; }
        for (var i = 0; i < recent.length; i++) if (fits(recent[i])) return recent[i];
        var lowest = nums(st.homes).filter(fits);
        return lowest.length ? lowest[0] : null;
    }

    // C3. What an output X shows once its workspaces have moved to it: its lowest-numbered
    // workspace, else its first assigned one (the lowest number whose first connected output is
    // X), else null (the caller finds the lowest free one, M1's rule).
    function newShows(X, st) {
        var own = nums(st.homes).filter(function (n) { return st.homes[n] === X; });
        if (own.length) return own[0];
        var assigned = nums(st.assigned).filter(function (n) { return firstAssigned(n, st) === X; });
        return assigned.length ? assigned[0] : null;
    }

    return { firstAssigned: firstAssigned, homesAfterLoss: homesAfterLoss, movingTo: movingTo,
             sourceShows: sourceShows, newShows: newShows };
})();

if (typeof module !== "undefined") module.exports = Outputs;
