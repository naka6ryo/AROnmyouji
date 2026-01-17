/**
 * main.js
 * AR陰陽師 - メインエントリーポイント
 * すべてのモジュールを統合し、ゲームループを管理
 */

import { AppState } from './AppState.js';
import { BleControllerAdapter } from './BleControllerAdapter.js';
import { SensorFrameParser } from './SensorFrameParser.js';
import { MotionInterpreter } from './MotionInterpreter.js';
import { GameWorld } from './GameWorld.js';
import { CombatSystem } from './CombatSystem.js';
import { Renderer } from './Renderer.js';
import { DebugOverlay } from './DebugOverlay.js';

class AROnmyoujiGame {
    constructor() {
        // モジュール初期化
        this.appState = new AppState();
        this.bleAdapter = new BleControllerAdapter();
        this.parser = new SensorFrameParser();
        this.motionInterpreter = new MotionInterpreter();
        this.gameWorld = new GameWorld();
        this.combatSystem = new CombatSystem(this.gameWorld, this.motionInterpreter);
        this.renderer = new Renderer('gameCanvas');
        this.debugOverlay = new DebugOverlay();
        
        // カメラストリーム
        this.cameraStream = null;
        this.videoElement = document.getElementById('cameraVideo');
        
        // 直近フレーム
        this.latestFrame = null;
        
        // ゲームループ
        this.lastUpdateTime = 0;
        this.FIXED_DELTA_TIME = 1000 / 60; // 60 FPS
        this.isRunning = false;
        
        // UI要素
        this.initUIElements();
        
        // イベントハンドラ設定
        this.setupEventHandlers();
        
        // デバッグ長押し用
        this.debugPressTimer = null;
        
        console.log('[Game] 初期化完了');
        this.debugOverlay.logInfo('ゲーム初期化完了');
    }
    
    /**
     * UI要素の取得
     */
    initUIElements() {
        this.ui = {
            // Splash
            startButton: document.getElementById('startButton'),
            
            // Permission
            requestPermissionButton: document.getElementById('requestPermissionButton'),
            cameraStatus: document.getElementById('cameraStatus'),
            motionStatus: document.getElementById('motionStatus'),
            permissionError: document.getElementById('permissionError'),
            
            // BLE Connect
            connectBleButton: document.getElementById('connectBleButton'),
            bleStatus: document.getElementById('bleStatus'),
            bleError: document.getElementById('bleError'),
            
            // Calibrate
            calibPitch: document.getElementById('calibPitch'),
            calibYaw: document.getElementById('calibYaw'),
            calibRoll: document.getElementById('calibRoll'),
            confirmCalibrationButton: document.getElementById('confirmCalibrationButton'),
            
            // Gameplay HUD
            playerHP: document.getElementById('playerHP'),
            killCount: document.getElementById('killCount'),
            timeLeft: document.getElementById('timeLeft'),
            hudPowerMode: document.getElementById('hudPowerMode'),
            powerModeTime: document.getElementById('powerModeTime'),
            
            // Result
            resultTitle: document.getElementById('resultTitle'),
            resultKills: document.getElementById('resultKills'),
            resultTime: document.getElementById('resultTime'),
            retryButton: document.getElementById('retryButton'),
            reconnectButton: document.getElementById('reconnectButton'),
            recalibrateButton: document.getElementById('recalibrateButton'),
            
            // Debug
            toggleDebugButton: document.getElementById('toggleDebugButton')
        };
    }
    
    /**
     * イベントハンドラ設定
     */
    setupEventHandlers() {
        // Splash
        this.ui.startButton.addEventListener('click', () => this.onStartGame());
        
        // Permission
        this.ui.requestPermissionButton.addEventListener('click', () => this.requestPermissions());
        
        // BLE Connect
        this.ui.connectBleButton.addEventListener('click', () => this.connectBLE());
        
        // Calibrate
        this.ui.confirmCalibrationButton.addEventListener('click', () => this.confirmCalibration());
        
        // Result
        this.ui.retryButton.addEventListener('click', () => this.onRetry());
        this.ui.reconnectButton.addEventListener('click', () => this.onReconnect());
        this.ui.recalibrateButton.addEventListener('click', () => this.onRecalibrate());
        
        // Debug toggle（3秒長押し）
        this.ui.toggleDebugButton.addEventListener('pointerdown', () => {
            this.debugPressTimer = setTimeout(() => {
                this.debugOverlay.toggle();
            }, 3000);
        });
        this.ui.toggleDebugButton.addEventListener('pointerup', () => {
            if (this.debugPressTimer) {
                clearTimeout(this.debugPressTimer);
                this.debugPressTimer = null;
            }
        });
        
        // BLE コールバック
        this.bleAdapter.setOnDataCallback((data) => this.onBLEData(data));
        this.bleAdapter.setOnDisconnectCallback(() => this.onBLEDisconnect());
        
        // Motion Interpreter コールバック
        this.motionInterpreter.onSwingDetected = (swing) => this.onSwing(swing);
        this.motionInterpreter.onCircleDetected = (circle) => this.onCircle(circle);
        this.motionInterpreter.onPowerModeActivated = (power) => this.onPowerMode(power);
        
        // GameWorld コールバック
        this.gameWorld.onEnemySpawned = (enemy) => this.onEnemySpawned(enemy);
        this.gameWorld.onEnemyKilled = (data) => this.onEnemyKilled(data);
        this.gameWorld.onPlayerDamaged = (data) => this.onPlayerDamaged(data);
        this.gameWorld.onGameOver = (data) => this.onGameOver(data);
        this.gameWorld.onGameClear = (data) => this.onGameClear(data);
        
        // CombatSystem コールバック
        this.combatSystem.onHapticEvent = (event) => this.onHapticEvent(event);
        
        // DeviceOrientation（端末姿勢）
        window.addEventListener('deviceorientation', (e) => this.renderer.updateDeviceOrientation(e));
    }
    
    /**
     * ゲーム開始
     */
    onStartGame() {
        this.debugOverlay.logInfo('ゲーム開始ボタン押下');
        this.appState.startGame();
    }
    
    /**
     * 権限要求
     */
    async requestPermissions() {
        this.debugOverlay.logInfo('権限要求開始');
        
        try {
            // カメラ権限
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            this.videoElement.srcObject = this.cameraStream;
            this.ui.cameraStatus.textContent = '📷 カメラ: 許可';
            this.debugOverlay.logInfo('カメラ権限: 許可');
            
            // モーション権限（iOS対応）
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this.ui.motionStatus.textContent = '📱 モーション: 許可';
                    this.debugOverlay.logInfo('モーション権限: 許可');
                } else {
                    throw new Error('モーション権限が拒否されました');
                }
            } else {
                // 非iOS環境ではデフォルトで許可とみなす
                this.ui.motionStatus.textContent = '📱 モーション: 許可';
                this.debugOverlay.logInfo('モーション権限: 自動許可（非iOS）');
            }
            
            // 次の状態へ
            this.appState.permissionGranted();
            
        } catch (error) {
            this.ui.permissionError.textContent = `エラー: ${error.message}`;
            this.debugOverlay.logError(`権限エラー: ${error.message}`);
        }
    }
    
    /**
     * BLE接続
     */
    async connectBLE() {
        this.debugOverlay.logInfo('BLE接続開始');
        this.ui.bleStatus.textContent = '接続中...';
        
        try {
            await this.bleAdapter.connect();
            this.ui.bleStatus.textContent = '接続成功';
            this.debugOverlay.logInfo('BLE接続成功');
            
            // 次の状態へ
            this.appState.bleConnected();
            
        } catch (error) {
            this.ui.bleError.textContent = `接続エラー: ${error.message}`;
            this.debugOverlay.logError(`BLE接続エラー: ${error.message}`);
        }
    }
    
    /**
     * キャリブレーション確定
     */
    confirmCalibration() {
        if (!this.latestFrame) {
            this.debugOverlay.logWarn('キャリブレーション: フレームデータなし');
            return;
        }
        
        const { pitch_deg, yaw_deg, roll_deg } = this.latestFrame;
        this.motionInterpreter.calibrate(pitch_deg, yaw_deg, roll_deg);
        this.debugOverlay.logInfo(`キャリブレーション完了: pitch=${pitch_deg.toFixed(1)}, yaw=${yaw_deg.toFixed(1)}, roll=${roll_deg.toFixed(1)}`);
        
        // ゲームプレイ開始
        this.appState.calibrationComplete();
        this.startGameplay();
    }
    
    /**
     * ゲームプレイ開始
     */
    startGameplay() {
        this.gameWorld.startGame();
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
        this.gameLoop();
        this.debugOverlay.logInfo('ゲームプレイ開始');
    }
    
    /**
     * BLEデータ受信
     */
    onBLEData(data) {
        const frame = this.parser.parseFrame(data);
        if (!frame) return;
        
        this.latestFrame = frame;
        
        // キャリブレーション画面でのリアルタイム表示
        if (this.appState.getCurrentState() === 'calibrate') {
            this.ui.calibPitch.textContent = frame.pitch_deg.toFixed(1);
            this.ui.calibYaw.textContent = frame.yaw_deg.toFixed(1);
            this.ui.calibRoll.textContent = frame.roll_deg.toFixed(1);
        }
        
        // ゲームプレイ中の処理
        if (this.appState.isGameplay()) {
            this.motionInterpreter.update(frame);
        }
        
        // デバッグ更新
        this.updateDebugInfo();
    }
    
    /**
     * BLE切断
     */
    onBLEDisconnect() {
        this.debugOverlay.logWarn('BLE切断検出');
        // 必要に応じて再接続画面へ遷移
    }
    
    /**
     * 斬撃検出
     */
    onSwing(swing) {
        this.debugOverlay.logInfo(`斬撃検出: intensity=${swing.intensity.toFixed(2)}`);
        this.combatSystem.handleSwing(swing);
    }
    
    /**
     * 円ジェスチャ検出
     */
    onCircle(circle) {
        this.debugOverlay.logInfo('円ジェスチャ検出（札発射）');
        const viewDir = this.renderer.getViewDirection();
        this.combatSystem.fireOfuda(viewDir);
    }
    
    /**
     * 強化モード発動
     */
    onPowerMode(power) {
        this.debugOverlay.logInfo('強化モード発動');
        this.combatSystem.sendPowerModeHaptic();
    }
    
    /**
     * 敵スポーン
     */
    onEnemySpawned(enemy) {
        this.renderer.addEnemy(enemy);
    }
    
    /**
     * 敵撃破
     */
    onEnemyKilled(data) {
        this.renderer.removeEnemy(data.enemy.id);
        this.updateHUD();
    }
    
    /**
     * プレイヤー被弾
     */
    onPlayerDamaged(data) {
        this.debugOverlay.logWarn(`被弾: HP=${data.hp}`);
        this.combatSystem.sendDamageHaptic();
        this.updateHUD();
    }
    
    /**
     * ゲームオーバー
     */
    onGameOver(data) {
        this.debugOverlay.logInfo(`ゲームオーバー: 撃破数=${data.killCount}`);
        this.isRunning = false;
        this.showResult('ゲームオーバー', data.killCount, this.gameWorld.gameTime / 1000);
    }
    
    /**
     * ゲームクリア
     */
    onGameClear(data) {
        this.debugOverlay.logInfo(`ゲームクリア: 撃破数=${data.killCount}`);
        this.isRunning = false;
        this.showResult('クリア！', data.killCount, data.time / 1000);
    }
    
    /**
     * 触覚イベント
     */
    async onHapticEvent(event) {
        if (event.data.pulses) {
            // 複数パルス
            await this.bleAdapter.sendHapticPulses(event.data.pulses, event.data.interval);
        } else {
            // 単一パルス
            await this.bleAdapter.sendHapticCommand(event.data.strength, event.data.duration);
        }
        
        this.debugOverlay.update({ hapticEvent: event.type });
    }
    
    /**
     * リザルト表示
     */
    showResult(title, kills, time) {
        this.ui.resultTitle.textContent = title;
        this.ui.resultKills.textContent = kills;
        this.ui.resultTime.textContent = time.toFixed(1);
        this.appState.endGame();
    }
    
    /**
     * リトライ
     */
    onRetry() {
        this.debugOverlay.logInfo('リトライ');
        this.appState.retry();
        this.startGameplay();
    }
    
    /**
     * 再接続
     */
    onReconnect() {
        this.debugOverlay.logInfo('再接続');
        this.bleAdapter.disconnect();
        this.appState.reconnect();
    }
    
    /**
     * 再キャリブレーション
     */
    onRecalibrate() {
        this.debugOverlay.logInfo('再キャリブレーション');
        this.appState.recalibrate();
    }
    
    /**
     * ゲームループ
     */
    gameLoop() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        const deltaTime = now - this.lastUpdateTime;
        
        // 固定Δtで更新
        if (deltaTime >= this.FIXED_DELTA_TIME) {
            this.lastUpdateTime = now;
            
            // ゲーム更新
            this.gameWorld.update(this.FIXED_DELTA_TIME);
            
            // 戦闘システム更新
            const viewDir = this.renderer.getViewDirection();
            this.combatSystem.update(this.FIXED_DELTA_TIME, viewDir);
            
            // レンダラー更新
            this.renderer.updateEnemies(this.gameWorld.getEnemies());
            
            // HUD更新
            this.updateHUD();
        }
        
        // 描画
        this.renderer.render();
        
        // 次のフレーム
        requestAnimationFrame(() => this.gameLoop());
    }
    
    /**
     * HUD更新
     */
    updateHUD() {
        const playerState = this.gameWorld.getPlayerState();
        const stats = this.gameWorld.getGameStats();
        const powerMode = this.motionInterpreter.getPowerModeState();
        
        this.ui.playerHP.textContent = playerState.hp;
        this.ui.killCount.textContent = stats.killCount;
        this.ui.timeLeft.textContent = Math.ceil(stats.remainingTime);
        
        // 強化モード
        if (powerMode.active) {
            this.ui.hudPowerMode.classList.remove('hidden');
            this.ui.powerModeTime.textContent = Math.ceil(powerMode.remaining / 1000);
        } else {
            this.ui.hudPowerMode.classList.add('hidden');
        }
    }
    
    /**
     * デバッグ情報更新
     */
    updateDebugInfo() {
        if (!this.latestFrame) return;
        
        const stats = this.parser.getStats();
        const swingState = this.motionInterpreter.getSwingState();
        const circleDebug = this.motionInterpreter.getCircleDebugInfo();
        
        this.debugOverlay.update({
            bleConnected: this.bleAdapter.getConnectionState(),
            receiveHz: stats.receiveHz,
            droppedFrames: stats.droppedFrames,
            dropRate: stats.dropRate,
            a_mag: this.latestFrame.a_mag,
            pitch: this.latestFrame.pitch_deg,
            yaw: this.latestFrame.yaw_deg,
            roll: this.latestFrame.roll_deg,
            swingState: swingState.state,
            cooldownRemaining: swingState.cooldownRemaining,
            circleDebug: circleDebug
        });
    }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
    const game = new AROnmyoujiGame();
    console.log('[Main] アプリケーション起動');
});
