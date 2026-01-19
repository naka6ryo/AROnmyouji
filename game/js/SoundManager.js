/**
 * SoundManager.js
 * シンプルなサウンドローダー／プレイヤー (HTMLAudioElementベース)
 */

export class SoundManager {
    constructor() {
        this.sounds = new Map(); // HTMLAudio fallback
        this.buffers = new Map(); // WebAudio decoded buffers
        this.buffersGain = new Map(); // per-buffer normalization gain
        this.enabled = true;
        this.audioContext = null;
        this.gainNode = null;
        // マスターゲイン: デバイスに応じて増幅（モバイルは通常低めに聞こえるため多少ブースト）
        this.masterGain = this._detectMasterGain();
    }

    _detectMasterGain() {
        try {
            const ua = navigator.userAgent || '';
            // ユーザー要望: モバイルでさらに大きく（概ね5倍相当）
            if (/iPhone|iPad|iPod/i.test(ua)) return 5.0; // iOS を約5倍にブースト
            if (/Android/i.test(ua)) return 4.0; // Android を約4倍にブースト
        } catch (e) {
            // フォールバック
        }
        return 3.5;
    }

    /** ユーザー操作の直後に呼んでAudioContextを作成／resumeする */
    initAudioContext() {
        try {
            if (!this.audioContext) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this.audioContext = new AC();
                this.gainNode = this.audioContext.createGain();
                this.gainNode.connect(this.audioContext.destination);
                // 初期ゲインは1
                this.gainNode.gain.value = 1.0;
            }

            // iOS では resume() を同期的に待たないほうがユーザージェスチャに紐づきやすい
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(e => {
                    console.warn('[SoundManager] resume failed', e);
                });
            }
        } catch (e) {
            console.warn('[SoundManager] initAudioContext failed', e);
        }
    }

    /**
     * ユーザージェスチャ内で呼び出してAudioContextのロック解除を試みる。
     * 小さな（無音）オシレーターを短時間再生してブラウザの再生許可を得る。
     */
    unlock() {
        try {
            this.initAudioContext();
            if (!this.audioContext) return;

            // Create a very short silent oscillator connected to a gain node with 0 volume.
            const osc = this.audioContext.createOscillator();
            const g = this.audioContext.createGain();
            g.gain.value = 0.0; // silent but counts as user-initiated audio
            osc.connect(g);
            g.connect(this.gainNode || this.audioContext.destination);
            // start and stop immediately (within user gesture)
            const now = this.audioContext.currentTime;
            osc.start(now);
            osc.stop(now + 0.03);
            // cleanup onended
            osc.onended = () => {
                try { osc.disconnect(); g.disconnect(); } catch (e) {}
            };
        } catch (e) {
            console.warn('[SoundManager] unlock failed', e);
        }
    }

    /**
     * サウンド一覧をロードする。キー->URL のオブジェクトを渡す。
     * WebAudio のデコードを試み、失敗したら HTMLAudio を使う。
     */
    async load(map) {
        for (const key in map) {
            const url = map[key];
            // try fetch+decode for WebAudio
            try {
                const resp = await fetch(url, { cache: 'no-cache' });
                if (!resp.ok) throw new Error('fetch failed');
                const arr = await resp.arrayBuffer();
                if (window.AudioContext || window.webkitAudioContext) {
                    await this.initAudioContext();
                        try {
                            const decoded = await this.audioContext.decodeAudioData(arr.slice(0));
                            // 正規化のためピーク値を測定
                            try {
                                let peak = 0;
                                for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
                                    const data = decoded.getChannelData(ch);
                                    for (let i = 0; i < data.length; i++) {
                                        const v = Math.abs(data[i]);
                                        if (v > peak) peak = v;
                                    }
                                }
                                // peak が小さいと音が小さいので、0.95/peak を掛けて正規化（上限は x4）
                                const normGain = (peak > 0) ? Math.min(4.0, 0.95 / peak) : 1.0;
                                this.buffersGain.set(key, normGain);
                            } catch (gerr) {
                                console.warn('[SoundManager] compute gain failed', key, gerr);
                            }
                            this.buffers.set(key, decoded);
                            continue; // decoded OK
                        } catch (err) {
                            console.warn('[SoundManager] decodeAudioData failed', key, err);
                        }
                }
            } catch (e) {
                console.warn('[SoundManager] webaudio fetch/decode failed', key, url, e);
            }

            // Fallback: HTMLAudioElement
            try {
                const audio = new Audio(url);
                audio.preload = 'auto';
                audio.load();
                this.sounds.set(key, audio);
            } catch (e) {
                console.warn('[SoundManager] load failed (audio element)', key, url, e);
            }
        }
    }

    /** 再生 */
    play(key, opts = {}) {
        if (!this.enabled) return;

        // Prefer WebAudio buffer playback
        const buffer = this.buffers.get(key);
        if (buffer && this.audioContext) {
            try {
                const src = this.audioContext.createBufferSource();
                src.buffer = buffer;
                if (opts.playbackRate !== undefined) src.playbackRate.value = opts.playbackRate;
                const gain = this.audioContext.createGain();
                const baseVol = (opts.volume !== undefined) ? opts.volume : 1.0;
                const norm = this.buffersGain.get(key) || 1.0;
                gain.gain.value = baseVol * norm * this.masterGain;
                src.connect(gain);
                gain.connect(this.gainNode || this.audioContext.destination);
                src.start(0);
                // cleanup
                src.onended = () => {
                    try { src.disconnect(); gain.disconnect(); } catch (e) {}
                };
                return;
            } catch (e) {
                console.warn('[SoundManager] webaudio play failed', key, e);
            }
        }

        // Fallback to HTMLAudioElement clone
        const audio = this.sounds.get(key);
        if (!audio) {
            console.warn('[SoundManager] sound not loaded:', key);
            return;
        }

        try {
            const instance = audio.cloneNode();
            // HTMLAudioは 0..1 の制約があるため masterGain と正規化を組み合わせて 0..1 に収める
            if (opts.volume !== undefined) instance.volume = Math.min(1.0, opts.volume * (this.buffersGain.get(key) || 1.0) * this.masterGain);
            if (opts.playbackRate !== undefined) instance.playbackRate = opts.playbackRate;
            instance.play().catch(err => {
                console.warn('[SoundManager] play failed', key, err);
            });
        } catch (e) {
            console.warn('[SoundManager] play exception', e);
        }
    }

    setEnabled(v) { this.enabled = !!v; }

    /**
     * Test playback that returns a Promise so callers (UI) can show result.
     * Resolves { method: 'webaudio'|'html' } or rejects with error.
     */
    playTest(key, opts = {}) {
        return new Promise((resolve, reject) => {
            try {
                const buffer = this.buffers.get(key);
                if (buffer && this.audioContext) {
                    try {
                        const src = this.audioContext.createBufferSource();
                        src.buffer = buffer;
                        if (opts.playbackRate !== undefined) src.playbackRate.value = opts.playbackRate;
                        const gain = this.audioContext.createGain();
                        const baseVol = (opts.volume !== undefined) ? opts.volume : 1.0;
                        const norm = this.buffersGain.get(key) || 1.0;
                        gain.gain.value = baseVol * norm * this.masterGain;
                        src.connect(gain);
                        gain.connect(this.gainNode || this.audioContext.destination);
                        // resolve when playback ends; do not disconnect immediately
                        src.onended = () => {
                            try { src.disconnect(); gain.disconnect(); } catch (e) {}
                            resolve({ method: 'webaudio' });
                        };
                        src.start(0);
                        // safety fallback: if onended doesn't fire (very short/test), resolve after 1500ms
                        const fallback = setTimeout(() => {
                            try { src.stop && src.stop(); src.disconnect(); gain.disconnect(); } catch (e) {}
                            resolve({ method: 'webaudio' });
                        }, 1500);
                        // clear fallback if ended earlier
                        const originalOnended = src.onended;
                        src.onended = () => {
                            clearTimeout(fallback);
                            try { src.disconnect(); gain.disconnect(); } catch (e) {}
                            resolve({ method: 'webaudio' });
                        };
                        return;
                    } catch (e) {
                        // fallthrough to try HTMLAudio fallback
                        console.warn('[SoundManager] webaudio playTest failed', key, e);
                    }
                }

                const audio = this.sounds.get(key);
                if (!audio) {
                    reject(new Error('sound not loaded'));
                    return;
                }

                const instance = audio.cloneNode();
                if (opts.volume !== undefined) instance.volume = Math.min(1.0, opts.volume * (this.buffersGain.get(key) || 1.0) * this.masterGain);
                if (opts.playbackRate !== undefined) instance.playbackRate = opts.playbackRate;
                const p = instance.play();
                if (p && typeof p.then === 'function') {
                    p.then(() => {
                        // resolve when ended
                        instance.addEventListener('ended', () => resolve({ method: 'html' }));
                    }).catch(err => reject(err));
                } else {
                    // older browsers: listen for ended or resolve after 1500ms
                    instance.addEventListener('ended', () => resolve({ method: 'html' }));
                    setTimeout(() => resolve({ method: 'html' }), 1500);
                }
            } catch (e) {
                reject(e);
            }
        });
    }
}

export const soundManager = new SoundManager();
