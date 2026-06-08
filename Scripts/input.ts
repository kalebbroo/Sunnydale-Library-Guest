/*
 * Stake Night — keyboard + touch input. Holds the directional state and wires the on-screen
 * buttons. tryAttack/tryThrow (combat.ts) are invoked lazily so file order doesn't matter.
 */
namespace SN {
    export const input = { left: false, right: false, up: false, down: false, jumpBufferedAt: -1e9 };
    export const held = new Set<string>();

    export function pressJump(): void { input.jumpBufferedAt = nowMs; }
    export function syncDirs(): void {
        input.left = held.has("arrowleft") || held.has("a");
        input.right = held.has("arrowright") || held.has("d");
        input.up = held.has("arrowup") || held.has("w");
        input.down = held.has("arrowdown") || held.has("s");
    }
    export function keyDown(e: KeyboardEvent): void {
        const k = e.key.toLowerCase();
        if (["arrowleft", "a", "arrowright", "d", "arrowup", "w", "arrowdown", "s"].includes(k)) { held.add(k); syncDirs(); e.preventDefault(); }
        else if (k === " " || k === "spacebar" || k === "j" || k === "x" || k === "enter" || e.code === "Space") { tryAttack(); e.preventDefault(); }
        else if (k === "k" || k === "shift") { pressJump(); e.preventDefault(); }
        else if (k === "l" || k === ";") { tryThrow(); e.preventDefault(); }
    }
    export function keyUp(e: KeyboardEvent): void { held.delete(e.key.toLowerCase()); syncDirs(); }

    export function bindHold(el: HTMLElement | null, on: (v: boolean) => void): void {
        if (!el) { return; }
        const set = (v: boolean) => () => { on(v); };
        el.addEventListener("pointerdown", (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); on(true); }, { passive: false });
        el.addEventListener("pointerup", (e: PointerEvent) => { e.preventDefault(); on(false); }, { passive: false });
        el.addEventListener("pointercancel", set(false));
        el.addEventListener("pointerleave", set(false));
    }
    export function bindTap(el: HTMLElement | null, fn: () => void): void {
        if (!el) { return; }
        el.addEventListener("pointerdown", (e: PointerEvent) => { e.preventDefault(); fn(); }, { passive: false });
    }

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    canvas.addEventListener("pointerdown", function (e: PointerEvent) { e.preventDefault(); tryAttack(); }, { passive: false });
    bindHold(document.getElementById("btn-left"), v => { input.left = v; });
    bindHold(document.getElementById("btn-right"), v => { input.right = v; });
    bindHold(document.getElementById("btn-up"), v => { input.up = v; });
    bindHold(document.getElementById("btn-down"), v => { input.down = v; });
    bindTap(document.getElementById("btn-attack"), () => tryAttack());
    bindTap(document.getElementById("btn-jump"), pressJump);
    bindTap(document.getElementById("btn-throw"), () => tryThrow());
}
