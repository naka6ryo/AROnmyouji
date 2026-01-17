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
            if (/iPhone|iPad|iPod/i.test(ua)) return 1.6; // iOS でややブースト
            if (/Android/i.test(ua)) return 1.4; // Android で少しブースト
        } catch (e) {
            // フォールバック
        }
        return 1.0;
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
}

export const soundManager = new SoundManager();
