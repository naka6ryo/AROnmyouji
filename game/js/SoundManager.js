/**
 * SoundManager.js
 * シンプルなサウンドローダー／プレイヤー (HTMLAudioElementベース)
 */

export class SoundManager {
    constructor() {
        this.sounds = new Map(); // HTMLAudio fallback
        this.buffers = new Map(); // WebAudio decoded buffers
        this.enabled = true;
        this.audioContext = null;
        this.gainNode = null;
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
                gain.gain.value = (opts.volume !== undefined) ? opts.volume : 1.0;
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
            if (opts.volume !== undefined) instance.volume = opts.volume;
            if (opts.playbackRate !== undefined) instance.playbackRate = opts.playbackRate;
            instance.play().catch(err => {
                console.warn('[SoundManager] play failed', key, err);
            });
        } catch (e) {
            console.warn('[SoundManager] play exception', e);
        }
    }

    setEnabled(v) { this.enabled = !!v; }
}

export const soundManager = new SoundManager();
