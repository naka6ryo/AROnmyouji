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
import { UIManager } from './UIManager.js';

class AROnmyoujiGame {
    constructor() {
        // モジュール初期化
        this.appState = new AppState();
        this.bleAdapter = new BleControllerAdapter();
        this.parser = new SensorFrameParser();
        this.motionInterpreter = new MotionInterpreter();
        this.gameWorld = new GameWorld();
        this.combatSystem = new CombatSystem(this.gameWorld, this.motionInterpreter);
        this.debugOverlay = new DebugOverlay();
        this.renderer = new Renderer('gameCanvas', this.debugOverlay);
        this.uiManager = new UIManager();

        // UI初期化
        this.uiManager.init();

        // カメラストリーム
        this.cameraStream = null;
        this.videoElement = document.getElementById('cameraVideo');

        // 直近フレーム
        this.latestFrame = null;

        // ゲームループ
        this.lastUpdateTime = 0;
        this.FIXED_DELTA_TIME = 1000 / 60; // 60 FPS
        this.isRunning = false;

        // ダブルヒット防止用
        this.lastEnemyHitTime = new Map();
        this.MIN_HIT_INTERVAL_MS = 100;

        // イベントハンドラ設定
        this.setupEventHandlers();

        console.log('[Game] 初期化完了');
        this.debugOverlay.logInfo('ゲーム初期化完了');
    }

    /**
     * イベントハンドラ設定
     */
    setupEventHandlers() {
        // UIイベント
        this.uiManager.bindEvents({
            onStartGame: () => this.onStartGame(),
            onRequestPermission: () => this.requestPermissions(),
            onConnectBLE: () => this.connectBLE(),
            onConfirmCalibration: () => this.confirmCalibration(),
            onRetry: () => this.onRetry(),
            onReconnect: () => this.onReconnect(),
            onRecalibrate: () => this.onRecalibrate(),
            onToggleDebug: () => this.debugOverlay.toggle()
        });

        // BLE コールバック
        this.bleAdapter.setOnDataCallback((data) => this.onBLEData(data));
        this.bleAdapter.setOnDisconnectCallback(() => this.onBLEDisconnect());

        // Renderer コールバック
        this.renderer.onSlashHitEnemy = (data) => this.onRendererSlashHit(data);

        // Motion Interpreter コールバック
        this.motionInterpreter.onSwingDetected = (swing) => this.onSwing(swing);
        this.motionInterpreter.onCircleDetected = (circle) => this.onCircle(circle);
        this.motionInterpreter.onPowerModeActivated = (power) => this.onPowerMode(power);
        this.motionInterpreter.onSwingTracerUpdate = (trajectory) => this.onSwingTracerUpdate(trajectory);
        this.motionInterpreter.onSwingStarted = () => this.onSwingStarted();

        // GameWorld コールバック
        this.gameWorld.onEnemySpawned = (enemy) => this.onEnemySpawned(enemy);
        this.gameWorld.onEnemyKilled = (data) => this.onEnemyKilled(data);
        this.gameWorld.onPlayerDamaged = (data) => this.onPlayerDamaged(data);
        this.gameWorld.onGameOver = (data) => this.onGameOver(data);
        this.gameWorld.onGameClear = (data) => this.onGameClear(data);

        // CombatSystem コールバック
        this.combatSystem.onHapticEvent = (event) => this.onHapticEvent(event);

        // DeviceOrientation
        this.deviceOrientationHandler = (e) => this.renderer.updateDeviceOrientation(e);
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
        this.uiManager.addPermissionLog('権限要求開始...');

        try {
            // モーション権限
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                this.uiManager.addPermissionLog('📱 iOS環境: requestPermission実行...');

                try {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    this.uiManager.addPermissionLog(`📱 requestPermission結果: ${permission}`);

                    if (permission === 'granted') {
                        this.uiManager.updatePermissionStatus('motion', 'granted');
                        this.uiManager.addPermissionLog('✓ モーション権限許可');
                        window.addEventListener('deviceorientation', this.deviceOrientationHandler);
                    } else if (permission === 'denied') {
                        this.uiManager.updatePermissionStatus('motion', 'denied');
                        throw new Error('モーション権限が拒否されました');
                    } else {
                        this.uiManager.updatePermissionStatus('motion', 'prompt');
                    }
                } catch (permissionError) {
                    this.uiManager.showPermissionError(permissionError.message);
                    throw permissionError;
                }
            } else {
                this.uiManager.updatePermissionStatus('motion', 'granted');
                this.uiManager.addPermissionLog('✓ 非iOS環境: 自動許可');
                window.addEventListener('deviceorientation', this.deviceOrientationHandler);
            }

            // カメラ権限
            this.uiManager.addPermissionLog('📷 カメラ権限要求中...');

            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            this.videoElement.srcObject = this.cameraStream;
            this.videoElement.muted = true;

            const tryPlay = async () => {
                try {
                    await this.videoElement.play();
                    this.debugOverlay.logInfo('カメラ映像再生開始');
                    return true;
                } catch (err) {
                    console.warn('video.play failed', err);
                    return false;
                }
            };

            let played = await tryPlay();
            if (!played) {
                const onLoaded = async () => {
                    await tryPlay();
                    this.videoElement.removeEventListener('loadedmetadata', onLoaded);
                };
                this.videoElement.addEventListener('loadedmetadata', onLoaded);
                setTimeout(() => this.videoElement.removeEventListener('loadedmetadata', onLoaded), 5000);
            }

            this.uiManager.updatePermissionStatus('camera', 'granted');
            this.uiManager.addPermissionLog('✓ カメラ権限取得成功');
            this.uiManager.addPermissionLog('✓ 全権限取得完了');

            this.appState.permissionGranted();

        } catch (error) {
            console.error(error);
            this.uiManager.showPermissionError(error.message);
            this.uiManager.addPermissionLog(`✗ エラー: ${error.message}`);
        }
    }

    /**
     * BLE接続
     */
    async connectBLE() {
        this.debugOverlay.logInfo('BLE接続開始');
        this.uiManager.updateBLEStatus('接続中...');

        try {
            await this.bleAdapter.connect();
            this.uiManager.updateBLEStatus('接続成功');
            this.debugOverlay.logInfo('BLE接続成功');
            this.appState.bleConnected();
        } catch (error) {
            this.uiManager.showBLEError(error.message);
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
        this.debugOverlay.logInfo(`キャリブレーション完了: ${pitch_deg.toFixed(1)}, ${yaw_deg.toFixed(1)}, ${roll_deg.toFixed(1)}`);

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

        if (this.appState.getCurrentState() === 'calibrate') {
            this.uiManager.updateCalibrationValues(frame.pitch_deg, frame.yaw_deg, frame.roll_deg);
        }

        if (this.appState.isGameplay()) {
            this.motionInterpreter.update(frame);
        }

        this.updateDebugInfo();
    }

    /**
     * BLE切断
     */
    onBLEDisconnect() {
        this.debugOverlay.logWarn('BLE切断検出');
    }

    onSwingStarted() {
        this.renderer.startSwingTracer();
    }

    onSwing(swing) {
        this.debugOverlay.logInfo(`斬撃: intensity=${swing.intensity.toFixed(2)}`);
        this.renderer.endSwingTracer();
        if (swing.trajectory && swing.trajectory.length >= 2) {
            const startPyr = swing.trajectory[0];
            const endPyr = swing.trajectory[swing.trajectory.length - 1];
            this.renderer.addSlashArcProjectile(startPyr, endPyr, swing.intensity);
        }
    }

    onSwingTracerUpdate(trajectory) {
        this.renderer.updateSwingTracer(trajectory);
    }

    onRendererSlashHit(data) {
        const enemy = data.enemy;
        const intensity = data.intensity;
        const isCritical = intensity >= this.combatSystem.CRITICAL_INTENSITY_THRESHOLD;
        const now = performance.now();

        const lastHitTime = this.lastEnemyHitTime.get(enemy.id);
        if (lastHitTime && (now - lastHitTime) < this.MIN_HIT_INTERVAL_MS) {
            return;
        }

        const existingEnemy = this.gameWorld.getEnemies().find(e => e.id === enemy.id);
        if (!existingEnemy) return;

        const damage = this.motionInterpreter.isPowerMode ? this.combatSystem.powerDamage : this.combatSystem.normalDamage;
        const killed = this.gameWorld.damageEnemy(enemy.id, damage);

        this.lastEnemyHitTime.set(enemy.id, now);

        if (this.combatSystem.onHit) {
            this.combatSystem.onHit({ enemy, damage, killed, isCritical });
        }

        if (killed) {
            this.lastEnemyHitTime.delete(enemy.id);
        }

        this.combatSystem.sendHitHaptic(isCritical);
        this.updateHUD(); // HUD更新
    }

    onCircle(circle) {
        this.debugOverlay.logInfo('円ジェスチャ検出');
        const viewDir = this.renderer.getViewDirection();
        this.combatSystem.fireOfuda(viewDir);
    }

    onPowerMode(power) {
        this.debugOverlay.logInfo('強化モード発動');
        this.combatSystem.sendPowerModeHaptic();
    }

    onEnemySpawned(enemy) {
        this.renderer.addEnemy(enemy);
    }

    onEnemyKilled(data) {
        this.renderer.removeEnemy(data.enemy.id);
        this.updateHUD();
    }

    onPlayerDamaged(data) {
        this.combatSystem.sendDamageHaptic();
        if (data.enemy) {
            this.uiManager.triggerDamageEffect();
            this.renderer.removeEnemy(data.enemy.id, { playerDamage: true });

            // remove indicator
            // Note: UIManager.updateEnemyIndicators calls will clean up next frame usually,
            // but we can rely on updateHUD calling updateEnemyIndicators if needed.
        }
        this.updateHUD();
    }

    onGameOver(data) {
        this.isRunning = false;
        this.uiManager.showResult('ゲームオーバー', data.killCount, this.gameWorld.gameTime / 1000);
        this.appState.endGame();
    }

    onGameClear(data) {
        this.isRunning = false;
        this.uiManager.showResult('クリア！', data.killCount, data.time / 1000);
        this.appState.endGame();
    }

    async onHapticEvent(event) {
        if (event.data.pulses) {
            await this.bleAdapter.sendHapticPulses(event.data.pulses, event.data.interval);
        } else {
            await this.bleAdapter.sendHapticCommand(event.data.strength, event.data.duration);
        }
        this.debugOverlay.update({ hapticEvent: event.type });
    }

    onRetry() {
        this.renderer.dispose();
        this.debugOverlay.clearLogs();
        this.appState.retry();
        this.startGameplay();
    }

    onReconnect() {
        this.bleAdapter.disconnect();
        this.appState.reconnect();
    }

    onRecalibrate() {
        this.appState.recalibrate();
    }

    gameLoop() {
        if (!this.isRunning) return;

        const now = performance.now();
        const deltaTime = now - this.lastUpdateTime;

        if (deltaTime >= this.FIXED_DELTA_TIME) {
            this.lastUpdateTime = now;

            this.gameWorld.update(this.FIXED_DELTA_TIME);
            const viewDir = this.renderer.getViewDirection();
            this.combatSystem.update(this.FIXED_DELTA_TIME, viewDir);

            this.updateHUD(viewDir);
            this.renderer.updateEnemies(this.gameWorld.getEnemies());
        }

        this.renderer.render(this.FIXED_DELTA_TIME, this.gameWorld.getEnemies());
        requestAnimationFrame(() => this.gameLoop());
    }

    updateHUD(viewDir) {
        // Stats
        this.uiManager.updateHUD(
            this.gameWorld.getGameStats(),
            this.gameWorld.getPlayerState()
        );

        // Power Mode
        const powerState = this.motionInterpreter.getPowerModeState();
        this.uiManager.updatePowerMode(powerState.active, powerState.remaining);

        // Enemy Indicators
        if (viewDir) {
            this.uiManager.updateEnemyIndicators(
                this.gameWorld.getEnemies(),
                viewDir,
                {
                    halfHorz: this.renderer.getHalfFovHorizontalDegrees(),
                    halfVert: this.renderer.getHalfFovDegrees()
                },
                (pos) => this.renderer.projectToNdc(pos),
                (enemy) => this.gameWorld.getEnemyDirection(enemy) // !!! getEnemyDirection returns DIRECTION, not Position. 
            );
        }
    }

    // Debug info update
    updateDebugInfo() {
        if (this.latestFrame) {
            this.debugOverlay.update({
                angle: `P:${this.latestFrame.pitch_deg.toFixed(0)} Y:${this.latestFrame.yaw_deg.toFixed(0)} R:${this.latestFrame.roll_deg.toFixed(0)}`,
                accel: `A:${this.latestFrame.a_mag.toFixed(2)}`
            });
        }

        const swingState = this.motionInterpreter.getSwingState();
        this.debugOverlay.update({
            swing: `${swingState.state} (Int:${swingState.lastIntensity.toFixed(2)})`
        });

        const circleInfo = this.motionInterpreter.getCircleDebugInfo();
        if (circleInfo.valid) {
            this.debugOverlay.update({
                circle: `L:${circleInfo.length.toFixed(1)} C:${circleInfo.closure.toFixed(1)} R:${circleInfo.rotation.toFixed(1)}`
            });
        }
    }
}

// 起動
window.addEventListener('load', () => {
    window.game = new AROnmyoujiGame();
});
