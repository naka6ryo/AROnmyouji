/**
 * SensorFrameParser.js
 * 15バイトフレームのパース、スケール復元、seq欠落計測を行うクラス
 */

export class SensorFrameParser {
    constructor() {
        this.lastSeq = null;
        this.totalFrames = 0;
        this.droppedFrames = 0;
        
        // 受信Hz計測用
        this.frameTimestamps = [];
        this.MAX_TIMESTAMP_HISTORY = 60; // 60フレーム分の履歴
    }
    
    /**
     * 15バイトフレームをパースする
     * フォーマット:
     * - header (1byte): 0x53
     * - seq (1byte): 0-255循環
     * - ax, ay, az (各2bytes, int16): 加速度×100
     * - pitch, yaw, roll (各2bytes, int16): 角度×10
     * - flags (1byte): 予約
     * 
     * @param {Uint8Array} data - 15バイトのセンサーデータ
     * @returns {Object|null} パースされたフレームまたはnull
     */
    parseFrame(data) {
        if (data.length !== 15) {
            console.warn('[Parser] フレームサイズ異常:', data.length);
            return null;
        }
        
        // ヘッダーチェック
        const header = data[0];
        if (header !== 0x53) {
            console.warn('[Parser] ヘッダー不正:', header.toString(16));
            return null;
        }
        
        // シーケンス番号
        const seq = data[1];
        
        // 欠落計測
        if (this.lastSeq !== null) {
            const expectedSeq = (this.lastSeq + 1) % 256;
            if (seq !== expectedSeq) {
                // 欠落を検出
                let dropped = (seq - expectedSeq + 256) % 256;
                this.droppedFrames += dropped;
                console.log(`[Parser] フレーム欠落検出: 期待=${expectedSeq}, 実際=${seq}, 欠落数=${dropped}`);
            }
        }
        this.lastSeq = seq;
        this.totalFrames++;
        
        // 加速度データ（int16, リトルエンディアン）
        const ax_raw = this.readInt16LE(data, 2);
        const ay_raw = this.readInt16LE(data, 4);
        const az_raw = this.readInt16LE(data, 6);
        
        // 姿勢データ（int16, リトルエンディアン）
        const pitch_raw = this.readInt16LE(data, 8);
        const yaw_raw = this.readInt16LE(data, 10);
        const roll_raw = this.readInt16LE(data, 12);
        
        // フラグ
        const flags = data[14];
        
        // スケール復元
        const ax_g = ax_raw / 100.0;
        const ay_g = ay_raw / 100.0;
        const az_g = az_raw / 100.0;
        
        const pitch_deg = -(pitch_raw / 10.0); // 符号反転（上に傾けたら上向きに飛ぶように）
        const yaw_deg = yaw_raw / 10.0;
        const roll_deg = roll_raw / 10.0;
        
        // 加速度大きさ
        const a_mag = Math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g);
        
        // 受信時刻を記録（Hz計測用）
        const now = performance.now();
        this.frameTimestamps.push(now);
        if (this.frameTimestamps.length > this.MAX_TIMESTAMP_HISTORY) {
            this.frameTimestamps.shift();
        }
        
        return {
            seq,
            ax_g,
            ay_g,
            az_g,
            a_mag,
            pitch_deg,
            yaw_deg,
            roll_deg,
            flags,
            timestamp: now
        };
    }
    
    /**
     * int16をリトルエンディアンで読み取る
     */
    readInt16LE(data, offset) {
        const low = data[offset];
        const high = data[offset + 1];
        const value = (high << 8) | low;
        // 符号拡張
        return value > 32767 ? value - 65536 : value;
    }
    
    /**
     * 受信Hzを計算（移動平均）
     */
    getReceiveHz() {
        if (this.frameTimestamps.length < 2) {
            return 0;
        }
        
        const duration = this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0];
        const frameCount = this.frameTimestamps.length - 1;
        
        if (duration === 0) {
            return 0;
        }
        
        return (frameCount / duration) * 1000; // Hz
    }
    
    /**
     * 欠落率を計算
     */
    getDropRate() {
        if (this.totalFrames === 0) {
            return 0;
        }
        return (this.droppedFrames / (this.totalFrames + this.droppedFrames)) * 100;
    }
    
    /**
     * 統計情報を取得
     */
    getStats() {
        return {
            totalFrames: this.totalFrames,
            droppedFrames: this.droppedFrames,
            dropRate: this.getDropRate(),
            receiveHz: this.getReceiveHz()
        };
    }
    
    /**
     * 統計をリセット
     */
    resetStats() {
        this.lastSeq = null;
        this.totalFrames = 0;
        this.droppedFrames = 0;
        this.frameTimestamps = [];
    }
}
