/*
 * Stake Night — the game-over overlay: arcade-style initials entry, score submission to
 * /api/scores, and the all-time / today leaderboard. Wires its own buttons (all handlers
 * reference symbols defined in this file).
 */
namespace SN {
    export const overTitle = document.getElementById("over-title") as HTMLElement | null;
    export const finalScoreEl = document.getElementById("final-score") as HTMLElement;
    export const entryBlock = document.getElementById("entry-block") as HTMLElement;
    export const boardBlock = document.getElementById("board-block") as HTMLElement;
    export const boardList = document.getElementById("board-list") as HTMLElement;
    export const charButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#initials .char"));
    export const btnSubmit = document.getElementById("btn-submit") as HTMLButtonElement;
    export const initialsState = [0, 0, 0];

    export function showGameOver(victory: boolean): void {
        if (overTitle) { overTitle.textContent = victory ? "Sunnydale Saved" : "Dawn Breaks"; }
        finalScoreEl.textContent = state.score.toLocaleString();
        entryBlock.classList.remove("hidden"); boardBlock.classList.add("hidden");
        btnSubmit.disabled = false; btnSubmit.textContent = "Carve It In";
        hud.setAttribute("aria-hidden", "true"); overlayOver.classList.remove("hidden");
    }

    charButtons.forEach(function (btn) {
        const i = parseInt(btn.dataset.i ?? "0", 10);
        btn.addEventListener("click", function () { initialsState[i] = (initialsState[i] + 1) % LETTERS.length; btn.textContent = LETTERS[initialsState[i]]; });
    });
    export function currentInitials(): string { return initialsState.map(i => LETTERS[i]).join(""); }

    export const tabAll = document.getElementById("tab-all") as HTMLElement | null;
    export const tabToday = document.getElementById("tab-today") as HTMLElement | null;
    export let lastSubmit: { initials: string; score: number } | null = null;
    export let boardPeriod: "all" | "today" = "all";

    btnSubmit.addEventListener("click", async function () {
        btnSubmit.disabled = true; btnSubmit.textContent = "Carving…";
        lastSubmit = { initials: currentInitials(), score: state.score };
        let posted: { top: Row[] } | null = null;
        try {
            const resp = await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initials: lastSubmit.initials, score: lastSubmit.score, token: state.runToken }) });
            if (resp.ok) { posted = await resp.json(); }
        } catch (err) { /* offline */ }
        entryBlock.classList.add("hidden"); boardBlock.classList.remove("hidden");
        if (posted && posted.top) { boardPeriod = "all"; setActiveTab(); renderBoard(posted.top); } else { await loadBoard("all"); }
    });
    export async function loadBoard(period: "all" | "today"): Promise<void> {
        boardPeriod = period; setActiveTab(); let top: Row[] = [];
        try { const resp = await fetch("/api/scores?top=10&period=" + period); if (resp.ok) { top = await resp.json(); } } catch (err) { /* empty */ }
        renderBoard(top);
    }
    export function setActiveTab(): void { tabAll?.classList.toggle("active", boardPeriod === "all"); tabToday?.classList.toggle("active", boardPeriod === "today"); }
    export function isMine(row: Row): boolean { return !!lastSubmit && row.initials === lastSubmit.initials && row.score === lastSubmit.score; }
    export function renderBoard(top: Row[]): void {
        boardList.innerHTML = "";
        if (!top || top.length === 0) { const li = document.createElement("li"); li.className = "empty"; li.textContent = boardPeriod === "today" ? "No slayers tonight — yet." : "No souls tallied yet. Be the first."; boardList.appendChild(li); return; }
        let mineShown = false;
        top.forEach(function (row) {
            const li = document.createElement("li");
            if (!mineShown && isMine(row)) { li.className = "you"; mineShown = true; }
            const r = document.createElement("span"); r.className = "r"; r.textContent = "#" + row.rank;
            const i = document.createElement("span"); i.className = "i"; i.textContent = row.initials;
            const s = document.createElement("span"); s.className = "s"; s.textContent = Number(row.score).toLocaleString();
            li.append(r, i, s); boardList.appendChild(li);
        });
    }
    tabAll?.addEventListener("click", () => { loadBoard("all"); });
    tabToday?.addEventListener("click", () => { loadBoard("today"); });
}
