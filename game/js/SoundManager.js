/**
 * SoundManager.js
 * シンプルなサウンドローダー／プレイヤー (HTMLAudioElementベース)
 */

export class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.enabled = true;
    }

    /**
     * サウンド一覧をロードする。キー->URL のオブジェクトを渡す。
     * ユーザー操作の後に呼ぶと自動再生制限を回避しやすい。
     */
    load(map) {
        for (const key in map) {
            try {
                const audio = new Audio(map[key]);
                audio.preload = 'auto';
                audio.load();
                this.sounds.set(key, audio);
            } catch (e) {
                console.warn('[SoundManager] load failed', key, map[key], e);
            }
        }
    }

    /** 再生 */
    play(key, opts = {}) {
        if (!this.enabled) return;
        const audio = this.sounds.get(key);
        if (!audio) {
            console.warn('[SoundManager] sound not loaded:', key);
            return;
        }

        try {
            // clone for overlapping playback
            const instance = audio.cloneNode();
            if (opts.volume !== undefined) instance.volume = opts.volume;
            if (opts.playbackRate !== undefined) instance.playbackRate = opts.playbackRate;
            instance.play().catch(err => {
                // 再生エラーは警告
                console.warn('[SoundManager] play failed', key, err);
            });
        } catch (e) {
            console.warn('[SoundManager] play exception', e);
        }
    }

    setEnabled(v) { this.enabled = !!v; }
}

export const soundManager = new SoundManager();
