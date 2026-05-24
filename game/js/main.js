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
import { soundManager } from './SoundManager.js';

const PERFORMANCE_CONFIG = {
    HUD_UPDATE_INTERVAL_MS: 100,
    INDICATOR_UPDATE_INTERVAL_MS: 66,
    DEBUG_UPDATE_INTERVAL_MS: 250,
    CAMERA_MAX_WIDTH: 1280,
    CAMERA_MAX_HEIGHT: 720,
    CAMERA_MAX_FPS: 30
};

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
        this.soundManager = soundManager;

        // Calibration display baseline (for reset behavior)
        this.calibrationDisplayBaseline = null;
        this.isCalibrationCompleting = false;
        this.isCalibrationYawLocked = false;
        this.calibrationLockedYaw = null;
        this.calibrationRenderFrame = null;
        this.lastCalibrationRenderTime = 0;
        // UI初期化
        this.uiManager.init();

        // AppState の変化を監視して UI のインラインスタイルや再配置を補正する
        this.appState.onStateChanged = this.onAppStateChanged.bind(this);

        // カメラストリーム
        this.cameraStream = null;
        this.videoElement = document.getElementById('cameraVideo');

        // 直近フレーム
        this.latestFrame = null;

        // ゲームループ
        this.lastUpdateTime = 0;
        this.FIXED_DELTA_TIME = 1000 / 60; // 60 FPS
        this.isRunning = false;
        this.lastHudUpdateTime = 0;
        this.lastIndicatorUpdateTime = 0;
        this.lastDebugUpdateTime = 0;

        // ダブルヒット防止用
        this.lastEnemyHitTime = new Map();
        this.MIN_HIT_INTERVAL_MS = 100;

        // イベントハンドラ設定
        this.setupEventHandlers();

        console.log('[Game] 初期化完了');
        this.debugOverlay.logInfo('ゲーム初期化完了');
    }

    /**
     * AppState 変更時の補助処理
     * スプラッシュが UIManager によりインラインで固定されている場合に
     * 明示的に非表示にし、権限画面を確実に表示する。
     */
    onAppStateChanged(newState) {
        try {
            // スプラッシュは UIManager 経由で確実に消す
            if (this.uiManager && typeof this.uiManager.hideSplashScreen === 'function') {
                this.uiManager.hideSplashScreen();
            }

            // さらに万全のため、スプラッシュ要素のインライン表示を明示的に消す
            const splashEl = document.getElementById('splashScreen');
            if (splashEl) {
                splashEl.classList.remove('active');
                splashEl.classList.add('hidden');
                try { splashEl.style.display = 'none'; } catch (e) { }
                try { splashEl.style.pointerEvents = 'none'; } catch (e) { }
            }

            // 権限画面に遷移する場合は display を確実に設定しておく
            if (newState === this.appState.states.S1_PERMISSION) {
                const perm = document.getElementById('permissionScreen');
                if (perm) {
                    perm.classList.remove('hidden');
                    perm.classList.add('active');
                    try { perm.style.display = 'flex'; } catch (e) { }
                    try { perm.style.pointerEvents = 'auto'; } catch (e) { }
                }
            }

            if (newState === this.appState.states.S3_CALIBRATE) {
                this.enterCalibrationStage();
            } else {
                this.exitCalibrationStage();
            }
        } catch (e) {
            console.warn('[AppStateHandler] onAppStateChanged error', e);
        }
    }

    /**
     * イベントハンドラ設定
     */
    setupEventHandlers() {
        // UIイベント
        this.uiManager.bindEvents({
            onStartGame: () => this.onStartGame(),
            onStartInScene: () => this.onStartInScene(),
            onRequestPermission: () => this.requestPermissions(),
            onConnectBLE: () => this.connectBLE(),
            onConfirmCalibration: () => this.confirmCalibration(),
            onResetCalibration: () => this.onResetCalibration(),
            onReturnToTitle: () => this.onReturnToTitle(), // New
            onTitleStartGame: () => this.onTitleStartGame(), // New
            onCancel: () => this.onCancel(), // Added Cancel Button Handler
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
        this.renderer.onCalibrationTargetHit = (data) => this.onCalibrationTargetHit(data);

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

    enterCalibrationStage() {
        this.isCalibrationCompleting = false;
        this.isCalibrationYawLocked = false;
        this.calibrationLockedYaw = null;
        this.lastCalibrationRenderTime = performance.now();
        if (this.motionInterpreter) {
            this.motionInterpreter.reset();
            this.motionInterpreter.isCalibrated = false;
        }
        if (this.renderer) {
            this.renderer.setCalibrationMode(true);
        }
        this.startCalibrationRenderLoop();
    }

    exitCalibrationStage() {
        this.stopCalibrationRenderLoop();
        if (this.renderer) {
            this.renderer.setCalibrationMode(false);
        }
    }

    startCalibrationRenderLoop() {
        if (this.calibrationRenderFrame) return;

        const tick = () => {
            if (this.appState.getCurrentState() !== this.appState.states.S3_CALIBRATE) {
                this.calibrationRenderFrame = null;
                return;
            }

            const now = performance.now();
            const deltaTime = Math.min(now - this.lastCalibrationRenderTime, 100);
            this.lastCalibrationRenderTime = now;
            this.renderer.render(deltaTime, []);
            this.calibrationRenderFrame = requestAnimationFrame(tick);
        };

        this.calibrationRenderFrame = requestAnimationFrame(tick);
    }

    stopCalibrationRenderLoop() {
        if (this.calibrationRenderFrame) {
            cancelAnimationFrame(this.calibrationRenderFrame);
            this.calibrationRenderFrame = null;
        }
    }

    confirmCalibration() {
        if (this.isCalibrationCompleting) return;
        if (!this.latestFrame) {
            this.debugOverlay.logWarn('キャリブレーション: フレームデータなし');
            return;
        }

        if (!this.isCalibrationYawLocked) {
            this.lockCalibrationYaw(this.latestFrame.yaw_deg, 'fallback button');
        }

        this.completeCalibrationTransition();
        return;

        this.isCalibrationCompleting = true;

        const { pitch_deg, yaw_deg, roll_deg } = this.latestFrame;

        // Ensure front-reset (display baseline) is applied each time the user
        // confirms calibration. This guarantees that after returning from
        // Title Screen 2 and re-entering calibration, pressing the start
        // button will reset the controller's front orientation.
        // Apply display baseline / reset only for yaw axis
        this.calibrationDisplayBaseline = {
            yaw: yaw_deg,
            onlyYaw: true
        };
        try { if (this.motionInterpreter) this.motionInterpreter.isCalibrated = false; } catch (e) { }

        // Calibrate motion interpreter for yaw only (pitch/roll unchanged)
        this.motionInterpreter.calibrate(undefined, yaw_deg, undefined);
        this.debugOverlay.logInfo(`キャリブレーション完了 (ヨーのみ補正): yaw=${yaw_deg.toFixed(1)} (front yaw reset applied)`);

        // 校正完了 -> ゲーム画面へ遷移するが、ゲームはまだ開始しない
        this.uiManager.playScreenTransition(() => {
            this.appState.calibrationComplete();
            // ここでスタートボタンを表示確実にONにする
            this.uiManager.toggleSceneStartButton(true);
        });
    }

    /**
     * ゲーム画面内のスタートボタンから呼ばれる処理。
     * カウントダウンをUIに表示してから `startGameplay()` を呼ぶ。
     */
    lockCalibrationYaw(yawDeg, source) {
        if (typeof yawDeg !== 'number') return false;

        const yaw = this.unwrapAngleDeg(yawDeg);
        this.calibrationDisplayBaseline = {
            yaw,
            onlyYaw: true
        };
        this.calibrationLockedYaw = yaw;
        this.isCalibrationYawLocked = true;

        try { if (this.motionInterpreter) this.motionInterpreter.isCalibrated = false; } catch (e) { }
        this.motionInterpreter.calibrate(undefined, yaw, undefined);
        this.debugOverlay.logInfo(`Calibration yaw locked (${source}): yaw=${yaw.toFixed(1)}`);
        return true;
    }

    completeCalibrationTransition() {
        if (this.isCalibrationCompleting) return;
        this.isCalibrationCompleting = true;

        this.uiManager.playScreenTransition(() => {
            this.appState.calibrationComplete();
            this.uiManager.toggleSceneStartButton(true);
        });
    }

    onStartInScene() {
        this.exitCalibrationStage();
        this.debugOverlay.logInfo('シーン内スタートボタン押下');

        // スタートボタンを隠す
        this.uiManager.toggleSceneStartButton(false);

        try {
            // unlock first to ensure user gesture grants playback
            this.soundManager.unlock();
            this.soundManager.initAudioContext();
            // kick off load if not already loaded
            const needLoad = ((this.soundManager.buffers && this.soundManager.buffers.size === 0) &&
                (this.soundManager.sounds && this.soundManager.sounds.size === 0));
            if (needLoad) {
                this.soundManager.load({
                    polygon_burst: 'assets/sfx/polygon_burst.mp3',
                    explosion: 'assets/sfx/explosion.mp3',
                    attack_swipe: 'assets/sfx/atttack.mp3',
                    button: 'assets/sfx/Button.mp3',
                    tv_turn_off: 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3'
                }).then(() => this.debugOverlay.logInfo('SFXロード完了')).catch(e => console.warn('sound load failed', e));
            }
        } catch (e) {
            console.warn('sound init/load failed', e);
        }

        // Play CRT Boot Sequence, then Countdown, then Start
        this.uiManager.playBootSequence(() => {
            // カウントダウン表示後にゲームを開始
            // 表示基準は開始時点で不要にする
            this.calibrationDisplayBaseline = null;
            this.uiManager.showCountdown(3, () => {
                this.startGameplay();
            });
        });
    }

    /**
     * キャンセルボタン（任務完了扱い）
     */
    onCancel() {
        this.debugOverlay.logInfo('キャンセルボタン押下: 任務完了扱い');
        // Treat as game clear
        const data = {
            killCount: this.gameWorld.getGameStats().killCount,
            time: this.gameWorld.gameTime
        };
        this.onGameClear(data);
    }

    /**
     * ゲーム開始 (GameWorld開始)
     */
    onStartGame() {
        // ... (unchanged)
        this.debugOverlay.logInfo('ゲーム開始ボタン押下');
        try {
            // unlock を最優先で呼ぶ（ユーザージェスチャに紐付ける）
            this.soundManager.unlock();
            this.soundManager.initAudioContext();
            this.soundManager.load({
                polygon_burst: 'assets/sfx/polygon_burst.mp3',
                explosion: 'assets/sfx/explosion.mp3',
                attack_swipe: 'assets/sfx/atttack.mp3',
                button: 'assets/sfx/Button.mp3',
                tv_turn_off: 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3'
            }).then(() => this.debugOverlay.logInfo('SFXロード完了')).catch(e => console.warn('sound load failed', e));
        } catch (e) {
            console.warn('sound init/load failed', e);
        }
        this.uiManager.playScreenTransition(() => {
            this.appState.startGame();
        });
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

            this.cameraStream = await this.getCameraStream();
            this.videoElement.srcObject = this.cameraStream;
            this.videoElement.muted = true;

            // Check if we are using environment camera and remove mirror effect
            try {
                const track = this.cameraStream.getVideoTracks()[0];
                const settings = track.getSettings();
                if (settings.facingMode === 'environment') {
                    this.videoElement.classList.remove('scale-x-[-1]');
                    this.debugOverlay.logInfo('背面カメラ検出: ミラーリング解除');
                }
            } catch (e) {
                console.warn('Camera settings check failed', e);
            }

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

            this.uiManager.playScreenTransition(() => {
                this.appState.permissionGranted();
            });

        } catch (error) {
            console.error(error);
            this.uiManager.showPermissionError(error.message);
            this.uiManager.addPermissionLog(`✗ エラー: ${error.message}`);
        }
    }

    /**
     * BLE接続
     */
    async getCameraStream() {
        const optimizedConstraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: PERFORMANCE_CONFIG.CAMERA_MAX_WIDTH, max: PERFORMANCE_CONFIG.CAMERA_MAX_WIDTH },
                height: { ideal: PERFORMANCE_CONFIG.CAMERA_MAX_HEIGHT, max: PERFORMANCE_CONFIG.CAMERA_MAX_HEIGHT },
                frameRate: { ideal: PERFORMANCE_CONFIG.CAMERA_MAX_FPS, max: PERFORMANCE_CONFIG.CAMERA_MAX_FPS }
            }
        };

        try {
            return await navigator.mediaDevices.getUserMedia(optimizedConstraints);
        } catch (error) {
            console.warn('[Camera] optimized constraints failed; falling back', error);
            return navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
        }
    }

    async connectBLE() {
        this.debugOverlay.logInfo('BLE接続開始');
        this.uiManager.updateBLEStatus('接続中...');

        try {
            await this.bleAdapter.connect();
            this.uiManager.updateBLEStatus('接続成功');
            this.debugOverlay.logInfo('BLE接続成功');
            this.uiManager.playScreenTransition(() => {
                this.appState.bleConnected();
            });
        } catch (error) {
            this.uiManager.showBLEError(error.message);
            this.debugOverlay.logError(`BLE接続エラー: ${error.message}`);
        }
    }

    /**
     * ゲームプレイ開始
     */
    startGameplay() {
        this.exitCalibrationStage();

        // 念のためスタートボタンを隠す
        this.uiManager.toggleSceneStartButton(false);

        // Reset motion interpreter (safety check to ensure no carry-over stiffness)
        if (this.motionInterpreter) this.motionInterpreter.reset();

        // Ensure audio context is initialized and SFX loading started
        try {
            this.soundManager.initAudioContext();
            const needLoad = ((this.soundManager.buffers && this.soundManager.buffers.size === 0) &&
                (this.soundManager.sounds && this.soundManager.sounds.size === 0));
            if (needLoad) {
                this.soundManager.load({
                    polygon_burst: 'assets/sfx/polygon_burst.mp3',
                    explosion: 'assets/sfx/explosion.mp3',
                    attack_swipe: 'assets/sfx/atttack.mp3',
                    button: 'assets/sfx/Button.mp3',
                    tv_turn_off: 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3'
                }).then(() => this.debugOverlay.logInfo('SFXロード完了')).catch(e => console.warn('sound load failed', e));
            }
        } catch (e) {
            console.warn('sound init/load in startGameplay failed', e);
        }

        this.gameWorld.startGame();
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
        this.lastHudUpdateTime = 0;
        this.lastIndicatorUpdateTime = 0;
        this.lastDebugUpdateTime = 0;
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
            this.motionInterpreter.update(frame);
        }

        if (this.appState.isGameplay()) {
            this.motionInterpreter.update(frame);
        }

        this.maybeUpdateDebugInfo();
    }

    /**
     * BLE切断
     */
    onBLEDisconnect() {
        this.debugOverlay.logWarn('BLE切断検出');
    }

    unwrapAngleDeg(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    onSwingStarted() {
        this.renderer.startSwingTracer();
    }

    onSwing(swing) {
        this.debugOverlay.logInfo(`斬撃: intensity=${swing.intensity.toFixed(2)}`);
        this.renderer.endSwingTracer();
        // 攻撃（スイング）音を再生
        try {
            const rate = Math.min(1.6, 0.9 + swing.intensity * 0.25);
            this.soundManager.play('attack_swipe', { volume: 0.7, playbackRate: rate });
        } catch (e) { }

        if (this.appState.getCurrentState() === this.appState.states.S3_CALIBRATE) {
            this.fireCalibrationSlash(swing);
            return;
        }

        if (swing.trajectory && swing.trajectory.length >= 2) {
            const startPyr = swing.trajectory[0];
            const endPyr = swing.trajectory[swing.trajectory.length - 1];
            this.renderer.addSlashArcProjectile(startPyr, endPyr, swing.intensity);
        }
    }

    fireCalibrationSlash(swing) {
        if (!swing.trajectory || swing.trajectory.length < 2 || this.isCalibrationCompleting) return;

        const averageYaw = this.averageCalibrationSwingYaw(swing.trajectory);
        this.lockCalibrationYaw(averageYaw, 'swing average');

        const correctedTrajectory = this.applyLockedCalibrationYawToTrajectory(swing.trajectory);
        const startPyr = correctedTrajectory[0];
        const endPyr = correctedTrajectory[correctedTrajectory.length - 1];
        this.renderer.addCalibrationSlashProjectile(startPyr, endPyr, swing.intensity);
    }

    applyLockedCalibrationYawToTrajectory(trajectory) {
        const yawBase = typeof this.calibrationLockedYaw === 'number' ? this.calibrationLockedYaw : 0;
        return trajectory.map(point => ({
            ...point,
            yaw: this.unwrapAngleDeg((typeof point.rawYaw === 'number' ? point.rawYaw : point.yaw) - yawBase)
        }));
    }

    averageCalibrationSwingYaw(trajectory) {
        const yaws = trajectory
            .map(point => (typeof point.rawYaw === 'number' ? point.rawYaw : point.yaw))
            .filter(value => typeof value === 'number')
            .map(value => value * Math.PI / 180);

        if (!yaws.length) {
            return this.latestFrame ? this.latestFrame.yaw_deg : 0;
        }

        const sum = yaws.reduce((acc, rad) => {
            acc.sin += Math.sin(rad);
            acc.cos += Math.cos(rad);
            return acc;
        }, { sin: 0, cos: 0 });

        return this.unwrapAngleDeg(Math.atan2(sum.sin / yaws.length, sum.cos / yaws.length) * 180 / Math.PI);
    }

    onSwingTracerUpdate(trajectory) {
        this.renderer.updateSwingTracer(trajectory);
    }

    onCalibrationTargetHit(data) {
        if (this.appState.getCurrentState() !== this.appState.states.S3_CALIBRATE) return;
        if (this.isCalibrationCompleting) return;

        try { this.soundManager.play('button', { volume: 0.65 }); } catch (e) { }
        this.debugOverlay.logInfo('Calibration target hit');
        if (!this.isCalibrationYawLocked && this.latestFrame) {
            this.lockCalibrationYaw(this.latestFrame.yaw_deg, 'target hit fallback');
        }
        this.completeCalibrationTransition();
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
        this.updateHUD(undefined, { forceHud: true, forceIndicators: true }); // HUD更新
    }

    onCircle(circle) {
        if (!this.appState.isGameplay()) return;
        this.debugOverlay.logInfo('円ジェスチャ検出');
        const viewDir = this.renderer.getViewDirection();
        this.combatSystem.fireOfuda(viewDir);
    }

    onPowerMode(power) {
        if (!this.appState.isGameplay()) return;
        this.debugOverlay.logInfo('強化モード発動');
        this.combatSystem.sendPowerModeHaptic();
    }

    onEnemySpawned(enemy) {
        this.renderer.addEnemy(enemy);
    }

    onEnemyKilled(data) {
        this.renderer.removeEnemy(data.enemy.id);
        // 敵撃破サウンド
        try { this.soundManager.play('polygon_burst', { volume: 0.9 }); } catch (e) { }
        this.updateHUD(undefined, { forceHud: true, forceIndicators: true });
    }

    onPlayerDamaged(data) {
        this.combatSystem.sendDamageHaptic();
        // 被弾時爆発音
        try { this.soundManager.play('explosion', { volume: 0.8 }); } catch (e) { }
        if (data.enemy) {
            this.uiManager.triggerDamageEffect();
            this.renderer.removeEnemy(data.enemy.id, { playerDamage: true });

            // remove indicator
            // Note: UIManager.updateEnemyIndicators calls will clean up next frame usually,
            // but we can rely on updateHUD calling updateEnemyIndicators if needed.
        }
        this.updateHUD(undefined, { forceHud: true, forceIndicators: true });
    }

    onGameOver(data) {
        this.isRunning = false;
        // 1. TV Turn Off
        this.uiManager.playTvTurnOffAnimation(() => {
            // 2. Screen Transition (Glitch/Noise)
            this.uiManager.playScreenTransition(() => {
                // 3. Show Result
                this.uiManager.showResult('ゲームオーバー', data.killCount, this.gameWorld.gameTime / 1000);
                this.appState.endGame();
            });
        });
    }

    onGameClear(data) {
        this.isRunning = false;
        // 1. TV Turn Off
        this.uiManager.playTvTurnOffAnimation(() => {
            // 2. Screen Transition (Glitch/Noise)
            this.uiManager.playScreenTransition(() => {
                // 3. Show Result
                this.uiManager.showResult('クリア！', data.killCount, data.time / 1000);
                this.appState.endGame();
            });
        });
    }

    async onHapticEvent(event) {
        if (event.data.pulses) {
            await this.bleAdapter.sendHapticPulses(event.data.pulses, event.data.interval);
        } else {
            await this.bleAdapter.sendHapticCommand(event.data.strength, event.data.duration);
        }
        this.debugOverlay.update({ hapticEvent: event.type });
    }

    onReturnToTitle() {
        // Result -> Title Screen 2
        this.debugOverlay.logInfo('タイトル2へ移動');

        // Stop game loop and clear gameplay visuals
        try {
            // Stop the loop
            this.isRunning = false;

            // Reset motion interpreter state (clears trails, active swings, gestures)
            if (this.motionInterpreter) this.motionInterpreter.reset();

            // Ensure TV effects persist on title
            try {
                const globalTv = document.getElementById('global-tv-effects');
                if (globalTv) {
                    globalTv.classList.add('tv-effect-on');
                    // force visible
                    globalTv.style.display = '';
                    globalTv.style.opacity = '';
                }
            } catch (e) { }

            // Reset Renderer logic (keep context, clear scene)
            try {
                if (this.renderer) {
                    this.renderer.reset();

                    // keep canvas hidden while on title
                    if (this.renderer.canvas) {
                        this.renderer.canvas.classList.add('hidden');
                        this.renderer.canvas.style.pointerEvents = 'none';
                    }
                }
            } catch (e) { console.warn('renderer reset failed', e); }

            // Clear in-memory enemies and indicators

            // Clear in-memory enemies and indicators
            // Clear in-memory enemies and stats
            try {
                if (this.gameWorld) this.gameWorld.reset();
            } catch (e) { }
            try { this.uiManager.clearEnemyIndicators(); } catch (e) { }

            // Hide gameplay HUD overlays if present
            try { this.uiManager.toggleSceneStartButton(false); } catch (e) { }
        } catch (e) {
            console.warn('onReturnToTitle cleanup error', e);
        }

        // Finally, show Title Screen 2
        this.uiManager.showTitleScreen2();
    }

    onTitleStartGame() {
        // Title Screen 2 -> Game Start Sequence
        this.debugOverlay.logInfo('タイトル2からゲーム開始');
        this.uiManager.hideTitleScreen2();

        // Use existing start sequence logic
        this.onStartInScene();
    }

    gameLoop() {
        if (!this.isRunning) return;

        const now = performance.now();
        // Calculate actual delta time in ms
        const actualDelta = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        // Cap delta to prevent massive jumps (e.g., max 100ms = 10fps min)
        // This prevents "spiral of death" or physics explosions on resume.
        const safeDelta = Math.min(actualDelta, 100);

        this.gameWorld.update(safeDelta);
        const viewDir = this.renderer.getViewDirection();
        this.combatSystem.update(safeDelta, viewDir);

        const enemies = this.gameWorld.getEnemies();
        this.updateHUD(viewDir);
        this.renderer.updateEnemies(enemies);

        // Renderer expects seconds usually? No, passed FIXED_DELTA_TIME which is ms (16.66).
        // Let's verify usage in Renderer.render
        this.renderer.render(safeDelta, enemies);
        requestAnimationFrame(() => this.gameLoop());
    }

    // ... (updateHUD, updateDebugInfo unchanged)

    onRetry() {
        // Legacy support if needed, but we use onReturnToTitle mostly now
        this.renderer.dispose();
        this.debugOverlay.clearLogs();
        this.appState.retry();
        this.startGameplay();
    }

    onReconnect() {
        this.uiManager.hideTitleScreen2(); // Ensure Title 2 is hidden
        try { this.bleAdapter.disconnect(); } catch (e) { }

        // Play transition effect + SFX, then switch to BLE Connect screen
        this.uiManager.playScreenTransition(() => {
            this.appState.reconnect();
        });
    }

    onRecalibrate() {
        this.uiManager.hideTitleScreen2(); // Ensure Title 2 is hidden
        // 再キャリブレーション：既存の校正フラグをクリアしてキャリブレーション画面へ
        try { if (this.motionInterpreter) this.motionInterpreter.isCalibrated = false; } catch (e) { }
        // 画面表示用基準をクリアしてキャリブレーション画面へ
        this.calibrationDisplayBaseline = null;

        // Play transition effect + SFX, then switch to Calibration screen
        this.uiManager.playScreenTransition(() => {
            this.appState.recalibrate();
            this.debugOverlay.logInfo('再キャリブレーションモードへ移行');
        });
    }

    onResetCalibration() {
        // Reset: set display baseline to current device orientation so displayed euler
        // angles become relative to device pose at reset time.
        if (!this.latestFrame) {
            this.debugOverlay.logWarn('リセット: フレームデータなし');
            return;
        }

        this.calibrationDisplayBaseline = {
            pitch: this.latestFrame.pitch_deg,
            yaw: this.latestFrame.yaw_deg,
            roll: this.latestFrame.roll_deg
        };

        // Ensure interpreter is not fully calibrated yet
        try { if (this.motionInterpreter) this.motionInterpreter.isCalibrated = false; } catch (e) { }

        // Ensure we are in calibrate screen
        this.appState.recalibrate();

        // Update UI immediately to show zeros (or very small residuals)
        this.uiManager.updateCalibrationValues(0, 0, 0);
        this.debugOverlay.logInfo('キャリブレーション表示基準をリセットしました');
    }

    updateHUD(viewDir, options = {}) {
        const now = performance.now();
        const forceHud = !!options.forceHud;
        const forceIndicators = !!options.forceIndicators;
        if (!viewDir && forceIndicators) {
            viewDir = this.renderer.getViewDirection();
        }

        // Stats
        if (forceHud || now - this.lastHudUpdateTime >= PERFORMANCE_CONFIG.HUD_UPDATE_INTERVAL_MS) {
            this.lastHudUpdateTime = now;
            this.uiManager.updateHUD(
                this.gameWorld.getGameStats(),
                this.gameWorld.getPlayerState()
            );

            // Power Mode
            const powerState = this.motionInterpreter.getPowerModeState();
            this.uiManager.updatePowerMode(powerState.active, powerState.remaining);
        }

        // Enemy Indicators
        if (viewDir && (forceIndicators || now - this.lastIndicatorUpdateTime >= PERFORMANCE_CONFIG.INDICATOR_UPDATE_INTERVAL_MS)) {
            this.lastIndicatorUpdateTime = now;
            this.uiManager.updateEnemyIndicators(
                this.gameWorld.getEnemies(),
                viewDir,
                {
                    halfHorz: this.renderer.getHalfFovHorizontalDegrees(),
                    halfVert: this.renderer.getHalfFovDegrees()
                },
                (pos) => this.renderer.projectToNdc(pos),
                (enemy) => this.gameWorld.getEnemyDirection(enemy), // !!! getEnemyDirection returns DIRECTION, not Position.
                this.renderer.getCameraBasis()
            );
        }
    }

    maybeUpdateDebugInfo() {
        const now = performance.now();
        if (now - this.lastDebugUpdateTime < PERFORMANCE_CONFIG.DEBUG_UPDATE_INTERVAL_MS) return;
        this.lastDebugUpdateTime = now;
        this.updateDebugInfo();
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
    // If loading completed earlier, show splash via UIManager
    try {
        if (window.__loadingComplete && window.game && window.game.uiManager && typeof window.game.uiManager.showSplashScreen === 'function') {
            window.game.uiManager.showSplashScreen();
        }
    } catch (e) { }
});
