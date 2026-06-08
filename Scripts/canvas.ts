/*
 * Stake Night — canvas, viewport, the frame clock, and the world→screen projection.
 *
 * Coordinates: x = world horizontal, z = floor depth (0 far/top … floorDepth() near/bottom),
 * y = jump height. screenX = x - camX; screenY = floorTopY + z - y.
 */
namespace SN {
    export const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    export const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    export let viewW = 0, viewH = 0, dpr = 1;
    export let nowMs = 0;

    export function resize(): void {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        viewW = canvas.clientWidth || window.innerWidth;
        viewH = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(viewW * dpr); canvas.height = Math.round(viewH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (ctx) { ctx.imageSmoothingEnabled = false; }
    }
    window.addEventListener("resize", resize);

    export function floorTopY(): number { return viewH * CONFIG.floorTopFrac; }
    export function floorDepth(): number { return viewH * CONFIG.floorDepthFrac; }
    export function sx(x: number): number { return x - state.camX; }
    export function groundY(z: number): number { return floorTopY() + z; }
    export function feetY(z: number, y: number): number { return floorTopY() + z - y; }
}
