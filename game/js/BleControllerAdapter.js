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
            console.log('[BLE] 接続成功');
            
            return true;
        } catch (error) {
            console.error('[BLE] 接続エラー:', error);
            throw error;
        }
    }
    
    /**
     * センサーデータ受信ハンドラ
     */
    handleSensorData(dataView) {
        if (this.onDataCallback) {
            // DataViewを配列に変換
            const byteArray = new Uint8Array(dataView.buffer);
            this.onDataCallback(byteArray);
        }
    }
    
    /**
     * 切断ハンドラ
     */
    handleDisconnect() {
        console.log('[BLE] 切断されました');
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
            console.warn('[BLE] 触覚コマンド送信失敗: 未接続');
            return false;
        }
        
        // レート制限チェック
        const now = performance.now();
        if (now - this.lastHapticSendTime < this.HAPTIC_MIN_INTERVAL) {
            console.log('[BLE] 触覚コマンド: レート制限によりスキップ');
            return false;
        }
        
        try {
            // 2バイトのコマンド作成
            const command = new Uint8Array([
                Math.min(255, Math.max(0, strength)),
                Math.min(255, Math.max(0, duration))
            ]);
            
            await this.hapticCharacteristic.writeValue(command);
            this.lastHapticSendTime = now;
            
            console.log(`[BLE] 触覚コマンド送信: strength=${strength}, duration=${duration * 10}ms`);
            return true;
        } catch (error) {
            console.error('[BLE] 触覚コマンド送信エラー:', error);
            return false;
        }
    }
    
    /**
     * 複数パルスの触覚送信（クリティカルヒット、強化開始用）
     * @param {Array} pulses - [{strength, duration}, ...]
     * @param {number} interval - パルス間隔（ms）
     */
    async sendHapticPulses(pulses, interval) {
        for (let i = 0; i < pulses.length; i++) {
            const pulse = pulses[i];
            await this.sendHapticCommand(pulse.strength, pulse.duration);
            
            if (i < pulses.length - 1) {
                // 次のパルスまで待機
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }
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
}
