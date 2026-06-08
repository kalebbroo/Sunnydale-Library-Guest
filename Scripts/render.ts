/*
 * Stake Night — the whole frame: parallax sky/stars/moon/graves, the depth-sorted actor pass,
 * projectiles, particles, score popups, the EXIT arrow, and screen flash/banner. Actor draws
 * use sprite sheets when loaded (drawSheet) and fall back to procedural shapes otherwise.
 */
namespace SN {
    // Draw the stage's painted parallax layers (sky → mid → near), each tiled and scrolled by its
    // parallax factor. Returns false if the stage has no bg or its layers aren't all loaded yet.
    export function drawBgLayers(): boolean {
        const s = stage(); if (!s.bg) { return false; }
        const set = loadBg(s.bg);
        if (!set.sky.ready || !set.mid.ready || !set.near.ready) { return false; }
        drawBgLayer(set.sky); drawBgLayer(set.mid); drawBgLayer(set.near);
        return true;
    }
    function drawBgLayer(L: BgLayer): void {
        const img = L.img; if (!img) { return; }
        const scale = viewH / img.height; const w = Math.max(1, img.width * scale);
        let x = -(((state.camX * L.par) % w + w) % w);   // seamless horizontal tiling
        for (; x < viewW; x += w) { ctx.drawImage(img, 0, 0, img.width, img.height, x, 0, w, viewH); }
    }

    export function render(): void {
        const ftY = floorTopY(); const pal = stage().palette; const OS = 26;
        const shx = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        const shy = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        ctx.save(); ctx.translate(shx, shy);

        // Painted parallax layers if this stage's PNGs are loaded; otherwise the procedural scene.
        if (!drawBgLayers()) {
            const sky = ctx.createLinearGradient(0, 0, 0, ftY);
            sky.addColorStop(0, pal.sky0); sky.addColorStop(1, pal.sky1);
            ctx.fillStyle = sky; ctx.fillRect(-OS, -OS, viewW + OS * 2, ftY + OS);

            for (const s of state.stars) {
                const px = ((s.x - state.camX * s.par) % viewW + viewW) % viewW;
                ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw + nowMs / 600)); ctx.fillStyle = "#fdf6d8";
                ctx.beginPath(); ctx.arc(px, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#f4ecc6"; ctx.beginPath(); ctx.arc(viewW * 0.8, ftY * 0.26, 34, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(11,10,20,0.55)"; ctx.beginPath(); ctx.arc(viewW * 0.8 + 12, ftY * 0.26 - 6, 30, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = pal.grave;
            for (const g of state.graves) {
                const gx = g.x - state.camX * g.par; const px = ((gx % (viewW + 400)) + (viewW + 400)) % (viewW + 400) - 200;
                ctx.beginPath(); ctx.moveTo(px - g.w / 2, ftY); ctx.lineTo(px - g.w / 2, ftY - g.h * 0.55);
                ctx.arc(px, ftY - g.h * 0.55, g.w / 2, Math.PI, 0); ctx.lineTo(px + g.w / 2, ftY); ctx.closePath(); ctx.fill();
            }

            const floor = ctx.createLinearGradient(0, ftY, 0, ftY + floorDepth());
            floor.addColorStop(0, pal.floor0); floor.addColorStop(1, pal.floor1);
            ctx.fillStyle = floor; ctx.fillRect(-OS, ftY, viewW + OS * 2, floorDepth() + OS);
            ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.moveTo(0, ftY); ctx.lineTo(viewW, ftY); ctx.stroke();
        }

        ctx.fillStyle = "rgba(0,0,0,0.28)";
        const shadow = (x: number, z: number, w: number) => { ctx.beginPath(); ctx.ellipse(sx(x), groundY(z), w * 0.5, w * 0.22, 0, 0, Math.PI * 2); ctx.fill(); };
        for (const e of state.enemies) { if (e.alive) { shadow(e.x, e.z, e.w); } }
        for (const pk of state.pickups) { shadow(pk.x, pk.z, 22); }
        if (state.boss) { shadow(state.boss.x, state.boss.z, state.boss.w); }
        shadow(state.player.x, state.player.z, state.player.w);

        type Draw = { z: number; render: () => void };
        const list: Draw[] = [];
        for (const e of state.enemies) { if (e.alive) { list.push({ z: e.z, render: () => drawEnemy(e) }); } }
        for (const pk of state.pickups) { list.push({ z: pk.z, render: () => drawPickup(pk) }); }
        if (state.boss) { const b = state.boss; list.push({ z: b.z, render: () => drawBoss(b) }); }
        list.push({ z: state.player.z, render: drawBuffy });
        list.sort((a, b) => a.z - b.z);
        for (const d of list) { d.render(); }

        // Projectiles.
        for (const b of state.bolts) {
            const bx = sx(b.x), by = feetY(b.z, b.y);
            if (b.kind === "stake") {
                ctx.save(); ctx.translate(bx, by); ctx.rotate(b.spin);
                ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-9, -2, 18, 4);
                ctx.fillStyle = "#d9b27a"; ctx.fillRect(6, -2, 3, 4);
                ctx.restore();
            } else { ctx.fillStyle = "#e8c659"; ctx.fillRect(bx - 8, by - 1.5, 16, 3); }
        }

        for (const d of state.dust) { const k = 1 - d.life / d.max; ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx(d.x), d.y, 2 + k * 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;

        ctx.font = "bold 16px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const pop of state.popups) { ctx.globalAlpha = Math.max(0, 1 - pop.life / pop.max); ctx.fillStyle = "#f4ecc6"; ctx.fillText(pop.text, sx(pop.x), pop.y); }
        ctx.globalAlpha = 1;

        // EXIT arrow (when a scene is cleared).
        if (state.exitOpen) {
            const ax = viewW - 60, ay = ftY + floorDepth() * 0.45, pulse = 0.6 + 0.4 * Math.sin(nowMs / 200);
            ctx.globalAlpha = pulse; ctx.fillStyle = "#e8c659";
            ctx.beginPath(); ctx.moveTo(ax - 24, ay - 18); ctx.lineTo(ax + 10, ay); ctx.lineTo(ax - 24, ay + 18); ctx.closePath(); ctx.fill();
            ctx.fillRect(ax - 44, ay - 7, 22, 14);
            ctx.globalAlpha = 1; ctx.fillStyle = "#e8c659"; ctx.font = "bold 13px Georgia, serif"; ctx.textAlign = "center";
            ctx.fillText("EXIT", ax - 14, ay - 28);
        }

        ctx.restore();

        if (state.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${state.flash * 0.5})`; ctx.fillRect(0, 0, viewW, viewH); }
        if (state.banner) {
            ctx.globalAlpha = Math.min(1, (state.banner.until - nowMs) / 500); ctx.fillStyle = "#ffd76b";
            ctx.font = "italic bold 26px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(state.banner.text, viewW / 2, viewH * 0.26); ctx.globalAlpha = 1;
        }
    }

    export function drawBuffy(): void {
        const p = state.player; const fx = sx(p.x), fy = feetY(p.z, p.y);
        if (drawSheet("buffy", p.anim, p.animStart, fx, fy, p.facing)) { return; }
        const lunging = nowMs < p.attackUntil;
        const hurtBlink = nowMs < p.hurtUntil && (Math.floor(nowMs / 80) % 2 === 0);
        ctx.save(); ctx.translate(fx, fy); ctx.scale(p.facing, 1);
        if (hurtBlink) { ctx.globalAlpha = 0.4; }
        ctx.fillStyle = "#27313f"; ctx.fillRect(-9, -22, 18, 22);
        ctx.fillStyle = "#7a2233"; ctx.fillRect(-9, -54, 18, 34);
        ctx.fillStyle = "#f0c9a0"; ctx.beginPath(); ctx.arc(0, -62, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e8c659"; ctx.beginPath(); ctx.arc(0, -64, 9.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-9.5, -64, 4, 12); ctx.fillRect(5.5, -64, 4, 12);
        const reach = lunging ? 30 : 20; ctx.strokeStyle = "#f0c9a0"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(6, -46); ctx.lineTo(reach, -44); ctx.stroke();
        if (nowMs < p.crossbowUntil) { ctx.strokeStyle = "#5a4632"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(reach, -48); ctx.lineTo(reach + 4, -40); ctx.stroke(); }
        else if (nowMs < p.scytheUntil) {
            const bl = reach + (lunging ? 32 : 26); ctx.strokeStyle = "#6a5238"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(reach, -44); ctx.lineTo(bl, -44); ctx.stroke();
            ctx.strokeStyle = "#c7ccd2"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bl, -44); ctx.quadraticCurveTo(bl + 6, -58, bl - 8, -60); ctx.stroke();
        } else { ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(reach, -44); ctx.lineTo(reach + (lunging ? 16 : 14), -44); ctx.stroke(); }
        ctx.restore();
    }

    export function drawEnemy(e: Enemy): void {
        const facing = Math.sign(state.player.x - e.x) || 1;
        const fx = sx(e.x), fy = feetY(e.z, e.y);
        if (drawSheet(e.type, e.anim, e.animStart, fx, fy, facing)) { return; }
        const winding = e.phase === "windup";
        const striking = e.phase === "active";
        const blocking = e.phase === "block";
        const thrown = e.phase === "thrown";
        const downed = e.phase === "down" || e.phase === "getup";
        const bob = (winding || striking || blocking || downed || thrown) ? 0 : Math.sin(e.wobble) * 3;
        const lean = (winding ? -4 : striking ? 6 : 0) * facing;   // cock back, then lunge in
        ctx.save(); ctx.translate(fx + lean, fy + bob);
        if (thrown) { ctx.rotate(e.wobble * 3); }                   // tumbling through the air
        else if (e.phase === "down") { ctx.rotate(facing * 1.3); }  // flat on the ground
        else if (e.phase === "getup") { ctx.rotate(facing * 0.6); } // rising back up

        // Wind-up telegraph: a pulsing red aura + glowing eyes so the strike is readable/dodgeable.
        if (winding) {
            ctx.globalAlpha = 0.3 + 0.35 * Math.abs(Math.sin(nowMs / 60)); ctx.fillStyle = "#ff3b3b";
            ctx.beginPath(); ctx.ellipse(0, -e.h * 0.5, e.w * 0.95, e.h * 0.58, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "#0f0a1c"; ctx.fillRect(-e.w / 2, -22, e.w, 22);
        ctx.fillStyle = e.def.color; ctx.fillRect(-e.w / 2, -e.h + 10, e.w, e.h - 32);
        ctx.fillStyle = "#b9a6c4"; ctx.beginPath(); ctx.arc(0, -e.h + 8, e.w * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = winding ? "#ffd23b" : "#ff3b3b"; ctx.fillRect(-5, -e.h + 6, 3, 3); ctx.fillRect(2, -e.h + 6, 3, 3);

        if (blocking) {
            // Guard: a bluish forearm bracket raised in front — needs a finisher/jump/scythe to break.
            ctx.save(); ctx.scale(facing, 1); ctx.strokeStyle = "#bfe3ff"; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(e.w * 0.16, -e.h * 0.78); ctx.lineTo(e.w * 0.16, -e.h * 0.28); ctx.stroke();
            ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(e.w * 0.16, -e.h * 0.5, 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.restore();
        } else if (!downed && !thrown) {
            // Claw arm: cocked back on the wind-up, slashing forward on the strike frame.
            const reach = striking ? 22 : winding ? -6 : 8;
            ctx.save(); ctx.scale(facing, 1); ctx.strokeStyle = striking ? "#ff6b6b" : "#cdbcd6"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(e.w * 0.28, -e.h * 0.6); ctx.lineTo(e.w * 0.28 + reach, -e.h * 0.6 + (striking ? 6 : 0)); ctx.stroke();
            ctx.restore();
        }

        if (e.hp < e.def.hp && !downed && !thrown) { ctx.fillStyle = "#7a2233"; ctx.fillRect(-e.w / 2, -e.h + 2, e.w * (e.hp / e.def.hp), 3); }
        ctx.restore();
    }

    export function drawBoss(b: Boss): void {
        const fx = sx(b.x), fy = feetY(b.z, b.y);
        if (drawSheet("boss", "walk", nowMs, fx, fy, Math.sign(state.player.x - b.x) || 1)) { return; }
        ctx.save(); ctx.translate(fx, fy);
        ctx.fillStyle = "#0a0610"; ctx.fillRect(-b.w / 2, -b.h, b.w, b.h);
        ctx.fillStyle = "#2a1030"; ctx.fillRect(-b.w / 2 + 4, -b.h + 6, b.w - 8, b.h - 30);
        ctx.fillStyle = "#cdbcd6"; ctx.beginPath(); ctx.arc(0, -b.h + 16, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff2020"; ctx.fillRect(-9, -b.h + 12, 6, 6); ctx.fillRect(3, -b.h + 12, 6, 6);
        ctx.restore();
    }

    export function drawPickup(pk: Pickup): void {
        const x = sx(pk.x), y = feetY(pk.z, 0) - 18 + Math.sin(pk.bob) * 4;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = "rgba(232,198,89,0.18)"; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        if (pk.type === "heart") { ctx.fillStyle = "#c83b54"; ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("❤", 0, 1); }
        else if (pk.type === "crossbow") { ctx.strokeStyle = "#e8c659"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); }
        else if (pk.type === "scythe") { ctx.strokeStyle = "#6a5238"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, 9); ctx.lineTo(2, -9); ctx.stroke(); ctx.strokeStyle = "#c7ccd2"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, -9); ctx.quadraticCurveTo(-9, -9, -8, 0); ctx.stroke(); }
        else { ctx.fillStyle = "#bfe3ff"; ctx.fillRect(-5, -8, 10, 14); ctx.fillStyle = "#fff"; ctx.fillRect(-3, -11, 6, 4); }
        ctx.restore();
    }
}
