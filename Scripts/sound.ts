/*
 * Stake Night — Web Audio sound effects and a tiny synth bassline. No asset files; every
 * sound is generated. Tolerates browsers with no AudioContext (stays silent).
 */
namespace SN {
    export const Sound = (function () {
        const ACtor: typeof AudioContext | undefined =
            (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
            || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        let ctxA: AudioContext | null = null; let master: GainNode | null = null;
        let muted = readMuted(); let musicId = 0; let musicStep = 0;
        function readMuted(): boolean { try { return localStorage.getItem("sn-muted") === "1"; } catch { return false; } }
        function writeMuted(v: boolean): void { try { localStorage.setItem("sn-muted", v ? "1" : "0"); } catch { /* no storage */ } }
        function ensure(): void {
            if (ctxA || !ACtor) { return; }
            try { ctxA = new ACtor(); master = ctxA.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctxA.destination); }
            catch { ctxA = null; master = null; }
        }
        function resume(): void { ensure(); if (ctxA && ctxA.state === "suspended") { ctxA.resume().catch(() => { /* ignore */ }); } }
        function blip(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
            if (!ctxA || !master || muted) { return; }
            const t = ctxA.currentTime; const o = ctxA.createOscillator(); const g = ctxA.createGain();
            o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
        }
        function burst(dur: number, vol: number): void {
            if (!ctxA || !master || muted) { return; }
            const t = ctxA.currentTime; const n = Math.max(1, Math.floor(ctxA.sampleRate * dur));
            const buf = ctxA.createBuffer(1, n, ctxA.sampleRate); const data = buf.getChannelData(0);
            for (let i = 0; i < n; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / n); }
            const src = ctxA.createBufferSource(); src.buffer = buf; const g = ctxA.createGain();
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            const hp = ctxA.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700;
            src.connect(hp); hp.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
        }
        const sfx = {
            hit() { burst(0.09, 0.5); blip(420, 90, 0.10, "square", 0.18); },
            finisher() { burst(0.14, 0.5); blip(300, 70, 0.20, "sawtooth", 0.3); blip(160, 60, 0.24, "square", 0.16); },
            whiff() { blip(300, 150, 0.08, "sine", 0.12); },
            hurt() { blip(220, 55, 0.30, "sawtooth", 0.35); },
            pickup() { blip(520, 990, 0.14, "triangle", 0.30); },
            jump() { blip(300, 620, 0.10, "square", 0.16); },
            shoot() { blip(900, 300, 0.08, "square", 0.18); },
            stage() { blip(440, 880, 0.25, "triangle", 0.22); },
            levelup() { blip(523, 1046, 0.18, "square", 0.25); blip(784, 1568, 0.22, "square", 0.18); },
            bossIn() { blip(120, 55, 0.70, "sawtooth", 0.40); },
            bossDown() { burst(0.5, 0.5); blip(220, 40, 0.60, "sawtooth", 0.40); },
            over() { blip(440, 90, 0.60, "triangle", 0.30); },
            win() { blip(523, 784, 0.18, "square", 0.22); blip(659, 988, 0.22, "square", 0.2); },
            ui() { blip(620, 620, 0.05, "square", 0.12); },
        };
        const BASS = [110.00, 110.00, 130.81, 146.83, 110.00, 98.00, 130.81, 164.81];
        function startMusic(): void {
            if (!ctxA || musicId) { return; }
            musicStep = 0;
            musicId = (setInterval(function () {
                if (!ctxA || muted) { return; }
                const f = BASS[musicStep % BASS.length]; musicStep++;
                blip(f, f, 0.22, "triangle", 0.06);
                if (musicStep % 4 === 0) { blip(f * 2, f * 2, 0.10, "sine", 0.025); }
            }, 300) as unknown) as number;
        }
        function stopMusic(): void { if (musicId) { clearInterval(musicId); musicId = 0; } }
        function toggleMute(): boolean { muted = !muted; writeMuted(muted); if (master) { master.gain.value = muted ? 0 : 0.5; } return muted; }
        function isMuted(): boolean { return muted; }
        return { resume, sfx, startMusic, stopMusic, toggleMute, isMuted };
    })();
}
