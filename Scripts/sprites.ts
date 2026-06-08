/*
 * Stake Night — sprite-sheet loader and frame blitter. drawSheet() returns false when a sheet
 * isn't ready, so callers fall back to procedural shapes (see render.ts). See SPRITES.md.
 */
namespace SN {
    export const sheets: Record<string, SheetState> = {};

    export function loadSheets(): void {
        if (typeof Image === "undefined") { return; }
        for (const key of Object.keys(SHEETS)) {
            const def = SHEETS[key]; const stt: SheetState = { def, img: null, ready: false };
            try { const img = new Image(); img.onload = () => { stt.img = img; stt.ready = true; }; img.onerror = () => { stt.ready = false; }; img.src = def.src; } catch { /* ignore */ }
            sheets[key] = stt;
        }
    }

    export function drawSheet(kind: string, anim: string, animStart: number, fxp: number, fyp: number, facing: number): boolean {
        const stt = sheets[kind];
        if (!stt || !stt.ready || !stt.img) { return false; }
        const def = stt.def; const a = def.anims[anim] || def.anims.idle;
        let frame = Math.floor(((nowMs - animStart) / 1000) * a.fps);
        frame = a.loop ? frame % a.frames : Math.min(frame, a.frames - 1);
        const w = def.fw * def.scale, h = def.fh * def.scale;
        ctx.save();
        ctx.imageSmoothingEnabled = def.smooth !== false;   // HD/painterly sheets scale cleanly; restored by ctx.restore()
        ctx.translate(fxp, fyp); ctx.scale(facing, 1);
        ctx.drawImage(stt.img, frame * def.fw, a.row * def.fh, def.fw, def.fh, -w / 2, -h, w, h);
        ctx.restore();
        return true;
    }
}
