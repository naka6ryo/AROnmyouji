/**
 * BleControllerAdapter.js
 * BLE接続、Notify購読、触覚コマンド送信を処理するクラス
 */

export class BleControllerAdapter {
    constructor() {
        // UUIDs（仕様書で定義された固定値）
        this.SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
        this.SENSOR_CHAR_UUID = '12345678-1234-1234-1234-123456789abd';
        this.HAPTIC_CHAR_UUID = '12345678-1234-1234-1234-123456789abe';
        
        this.device = null;
        this.server = null;
        this.service = null;
        this.sensorCharacteristic = null;
        this.hapticCharacteristic = null;
        
        this.isConnected = false;
        this.onDataCallback = null;
        this.onDisconnectCallback = null;
        
        // 触覚送信レート制限（最大10コマンド/秒）
        this.hapticQueue = [];
        this.lastHapticSendTime = 0;
        this.HAPTIC_MIN_INTERVAL = 100; // ms
        this.minSensorIntervalMs = 0;
        this.lastSensorCallbackTime = 0;
        this.sensorTimestamps = [];
        this.processedSensorTimestamps = [];
        this.skippedSensorFrames = 0;
        this.hapticSentCount = 0;
        this.hapticSkippedCount = 0;
        this.DEBUG_LOGS = false;
    }
    
    /**
     * BLE接続を開始（ユーザー操作起点）
     */
    async connect() {
        try {
            // BLEデバイスを要求
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.SERVICE_UUID] }]
            });
            
            // 切断イベントハンドラ
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });
            
            // GATTサーバーに接続
            this.server = await this.device.gatt.connect();
            
            // サービスを取得
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            
            // センサーCharacteristicを取得
            this.sensorCharacteristic = await this.service.getCharacteristic(this.SENSOR_CHAR_UUID);
            
            // 触覚CharacteristicをCharacteristicを取得
            this.hapticCharacteristic = await this.service.getCharacteristic(this.HAPTIC_CHAR_UUID);
            
            // Notify購読開始
            await this.sensorCharacteristic.startNotifications();
            this.sensorCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleSensorData(event.target.value);
            });
            
            this.isConnected = true;
            
            
            return true;
        } catch (error) {
            
            throw error;
        }
    }
    
    /**
     * センサーデータ受信ハンドラ
     */
    handleSensorData(dataView) {
        const now = performance.now();
        this.recordTimestamp(this.sensorTimestamps, now);
        if (this.minSensorIntervalMs > 0 && now - this.lastSensorCallbackTime < this.minSensorIntervalMs) {
            this.skippedSensorFrames++;
            return;
        }

        this.lastSensorCallbackTime = now;
        this.recordTimestamp(this.processedSensorTimestamps, now);
        if (this.onDataCallback) {
            // DataViewを配列に変換
            this.onDataCallback(dataView);
        }
    }

    recordTimestamp(list, now) {
        list.push(now);
        while (list.length > 90) list.shift();
    }

    getTimestampHz(list) {
        if (!list || list.length < 2) return 0;
        const duration = list[list.length - 1] - list[0];
        return duration > 0 ? ((list.length - 1) / duration) * 1000 : 0;
    }

    setSensorMinInterval(intervalMs = 0) {
        this.minSensorIntervalMs = Math.max(0, intervalMs || 0);
    }

    setPerformanceMode(mode) {
        const intervals = {
            normal: 1000 / 60,
            warm: 1000 / 45,
            hot: 1000 / 30
        };
        this.setSensorMinInterval(intervals[mode] || intervals.normal);
    }
    
    /**
     * 切断ハンドラ
     */
    handleDisconnect() {
        
        this.isConnected = false;
        
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }
    
    /**
     * センサーデータ受信時のコールバックを設定
     */
    setOnDataCallback(callback) {
        this.onDataCallback = callback;
    }
    
    /**
     * 切断時のコールバックを設定
     */
    setOnDisconnectCallback(callback) {
        this.onDisconnectCallback = callback;
    }
    
    /**
     * 触覚コマンドを送信（2バイト: strength, duration）
     * @param {number} strength - 0-255
     * @param {number} duration - 10ms単位、0-255（最大2550ms）
     */
    async sendHapticCommand(strength, duration) {
        if (!this.isConnected || !this.hapticCharacteristic) {
            
            return false;
        }
        
        // レート制限チェック
        const now = performance.now();
        if (now - this.lastHapticSendTime < this.HAPTIC_MIN_INTERVAL) {
            this.hapticSkippedCount++;
            return false;
        }
        
        try {
            // 2バイトのコマンド作成
            const command = new Uint8Array([
                Math.min(255, Math.max(0, strength)),
                Math.min(255, Math.max(0, duration))
            ]);
            
            await this.writeHapticValue(command, duration);
            this.lastHapticSendTime = now;
            this.hapticSentCount++;
            
            return true;
        } catch (error) {
            
            return false;
        }
    }
    
    /**
     * 複数パルスの触覚送信（クリティカルヒット、強化開始用）
     * @param {Array} pulses - [{strength, duration}, ...]
     * @param {number} interval - パルス間隔（ms）
     */
    async sendHapticPulses(pulses, interval) {
        if (!this.isConnected || !this.hapticCharacteristic) {
            
            return false;
        }

        try {
            // 直接 writeValue を連続で行い、sendHapticCommand のレート制限チェックを回避する
            for (let i = 0; i < pulses.length; i++) {
                const pulse = pulses[i];
                await this.waitForHapticSlot();
                const sent = await this.sendHapticCommand(pulse.strength, pulse.duration);
                if (!sent) return false;

                if (i < pulses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.max(this.HAPTIC_MIN_INTERVAL, interval || 0)));
                }
            }
            return true;
        } catch (error) {
            
            return false;
        }
    }

    async waitForHapticSlot() {
        const waitMs = this.HAPTIC_MIN_INTERVAL - (performance.now() - this.lastHapticSendTime);
        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    async writeHapticValue(command, duration) {
        if (duration <= 10 && typeof this.hapticCharacteristic.writeValueWithoutResponse === 'function') {
            return this.hapticCharacteristic.writeValueWithoutResponse(command);
        }
        return this.hapticCharacteristic.writeValue(command);
    }
    
    /**
     * 切断
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
    }
    
    /**
     * 接続状態を取得
     */
    getConnectionState() {
        return this.isConnected;
    }

    getStats() {
        return {
            rawReceiveHz: this.getTimestampHz(this.sensorTimestamps),
            callbackHz: this.getTimestampHz(this.processedSensorTimestamps),
            skippedSensorFrames: this.skippedSensorFrames,
            hapticSentCount: this.hapticSentCount,
            hapticSkippedCount: this.hapticSkippedCount
        };
    }
}
