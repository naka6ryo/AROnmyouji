/**
 * AppState.js
 * S0-S5の状態機械と画面遷移を管理するクラス
 */

export class AppState {
    constructor() {
        // 状態定義
        this.states = {
            S0_SPLASH: 'splash',
            S1_PERMISSION: 'permission',
            S2_BLE_CONNECT: 'bleConnect',
            S3_CALIBRATE: 'calibrate',
            S4_GAMEPLAY: 'gameplay',
            S5_RESULT: 'result'
        };
        
        this.currentState = this.states.S0_SPLASH;
        
        // 画面要素
        this.screens = {
            splash: document.getElementById('splashScreen'),
            permission: document.getElementById('permissionScreen'),
            bleConnect: document.getElementById('bleConnectScreen'),
            calibrate: document.getElementById('calibrateScreen'),
            gameplay: document.getElementById('gameplayScreen'),
            result: document.getElementById('resultScreen')
        };
        
        // コールバック
        this.onStateChanged = null;
    }
    
    /**
     * 状態を変更
     */
    changeState(newState) {
        console.log(`[AppState] 状態遷移: ${this.currentState} -> ${newState}`);
        
        // 現在の画面を非表示
        if (this.screens[this.currentState]) {
            this.screens[this.currentState].classList.remove('active');
            // Tailwind の `hidden` ユーティリティが優先される場合があるため
            // 明示的に隠すクラスを付与して確実に非表示にする
            this.screens[this.currentState].classList.add('hidden');
        }
        
        // 新しい画面を表示
        this.currentState = newState;
        if (this.screens[newState]) {
            // もし `hidden` が付与されている場合はまず外す
            this.screens[newState].classList.remove('hidden');
            this.screens[newState].classList.add('active');
        }
        
        // コールバック
        if (this.onStateChanged) {
            this.onStateChanged(newState);
        }
    }
    
    /**
     * Splash -> Permission
     */
    startGame() {
        this.changeState(this.states.S1_PERMISSION);
    }
    
    /**
     * Permission -> BleConnect
     */
    permissionGranted() {
        this.changeState(this.states.S2_BLE_CONNECT);
    }
    
    /**
     * BleConnect -> Calibrate
     */
    bleConnected() {
        this.changeState(this.states.S3_CALIBRATE);
    }
    
    /**
     * Calibrate -> Gameplay
     */
    calibrationComplete() {
        this.changeState(this.states.S4_GAMEPLAY);
    }
    
    /**
     * Gameplay -> Result
     */
    endGame() {
        this.changeState(this.states.S5_RESULT);
    }
    
    /**
     * Result -> BleConnect（再接続）
     */
    reconnect() {
        this.changeState(this.states.S2_BLE_CONNECT);
    }
    
    /**
     * Result -> Calibrate（再キャリブレーション）
     */
    recalibrate() {
        this.changeState(this.states.S3_CALIBRATE);
    }
    
    /**
     * Result -> Gameplay（リトライ）
     */
    retry() {
        this.changeState(this.states.S4_GAMEPLAY);
    }
    
    /**
     * 現在の状態を取得
     */
    getCurrentState() {
        return this.currentState;
    }
    
    /**
     * ゲームプレイ中かどうか
     */
    isGameplay() {
        return this.currentState === this.states.S4_GAMEPLAY;
    }
}
