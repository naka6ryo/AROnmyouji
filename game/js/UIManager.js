/**
 * UIManager.js
 * DOM要素の管理、イベントバインディング、画面更新を行うクラス
 */

export class UIManager {
    constructor() {
        this.elements = {};
        this.enemyIndicatorMap = new Map(); // enemyId -> element
    }

    /**
     * UI要素の初期化
     */
    init() {
        this.elements = {
            // Splash
            startButton: document.getElementById('startButton'),

            // Permission
            requestPermissionButton: document.getElementById('requestPermissionButton'),
            cameraStatus: document.getElementById('cameraStatus'),
            motionStatus: document.getElementById('motionStatus'),
            permissionError: document.getElementById('permissionError'),
            // Replaced default log area with footer status text
            permissionDebugLogStatus: document.getElementById('permissionDebugLogStatus'),

            // BLE Connect
            connectBleButton: document.getElementById('connectBleButton'),
            bleStatus: document.getElementById('bleStatus'),
            bleError: document.getElementById('bleError'),
            bleFooterStatus: document.getElementById('bleFooterStatus'),
            bleError: document.getElementById('bleError'),

            // Calibrate
            calibPitch: document.getElementById('calibPitch'),
            calibYaw: document.getElementById('calibYaw'),
            calibRoll: document.getElementById('calibRoll'),
            calibPitchBars: document.getElementById('calibPitchBars'),
            calibYawBars: document.getElementById('calibYawBars'),
            calibRollBars: document.getElementById('calibRollBars'),
            resetCalibrationButton: document.getElementById('resetCalibrationButton'),
            startCalibrationButton: document.getElementById('startCalibrationButton'),

            // Title Screen 2 (New)
            titleScreen2: document.getElementById('titleScreen2'),
            titleStartButton: document.getElementById('titleStartButton'),
            titleReconnectButton: document.getElementById('titleReconnectButton'),
            titleRecalibrateButton: document.getElementById('titleRecalibrateButton'),

            // Gameplay HUD
            playerHP: document.getElementById('playerHP'),
            hpBarFill: document.getElementById('hpBarFill'),
            // Start overlay copies
            playerHPStart: document.getElementById('playerHPStart'),
            hpBarFillStart: document.getElementById('hpBarFillStart'),
            killCountStart: document.getElementById('killCountStart'),
            timeLeftStart: document.getElementById('timeLeftStart'),
            killCount: document.getElementById('killCount'),
            // (audio debug UI removed)
            timeLeft: document.getElementById('timeLeft'),
            hudPowerMode: document.getElementById('hudPowerMode'),
            powerModeTime: document.getElementById('powerModeTime'),
            enemyIndicators: document.getElementById('enemyIndicators'),
            // Scene start and countdown
            sceneStartButton: document.getElementById('sceneStartButton'),
            countdownOverlay: document.getElementById('countdownOverlay'),
            countdownValue: document.getElementById('countdownValue'),
            startOverlay: document.getElementById('startOverlay'),
            // Top center HUD
            elapsedTimeDisplay: document.getElementById('elapsedTimeDisplay'),
            defeatedDisplay: document.getElementById('defeatedDisplay'),
            // Vertical HP
            verticalHpFill: document.getElementById('verticalHpFill'),
            verticalHpNum: document.getElementById('verticalHpNum'),
            verticalHpMax: document.getElementById('verticalHpMax'),

            // Effects
            flashOverlay: document.getElementById('flash-overlay'),
            damageVignette: document.getElementById('damage-vignette'),
            uiContainer: document.getElementById('uiContainer'),

            // Result
            // Legacy simple result (kept for compatibility)
            resultScreen: document.getElementById('resultScreen'),
            resultTitle: document.getElementById('resultTitle'),
            resultKills: document.getElementById('resultKills'),
            resultTime: document.getElementById('resultTime'),

            // New Mission Result - Success
            missionCompletedScreen: document.getElementById('missionCompletedScreen'),
            completedScore: document.getElementById('completedScore'),
            completedKills: document.getElementById('completedKills'),
            completedTime: document.getElementById('completedTime'),
            returnToTitleButtonSuccess: document.getElementById('returnToTitleButtonSuccess'),

            // New Mission Result - Failure
            missionFailScreen: document.getElementById('missionFailScreen'),
            failScore: document.getElementById('failScore'),
            failKills: document.getElementById('failKills'),
            failTime: document.getElementById('failTime'),
            returnToTitleButtonFail: document.getElementById('returnToTitleButtonFail'),
            // Old buttons removed: retryButton, reconnectButton, recalibrateButton

            // Debug
            toggleDebugButton: document.getElementById('toggleDebugButton'),
            toggleDebugButtonResult: document.getElementById('toggleDebugButtonResult'),

            // CRT Boot & Hologram
            crtMainDisplay: document.getElementById('crt-main-display'),
            hologramText: document.getElementById('hologramText')
        };
    }

    /**
     * イベントハンドラの設定
     */
    bindEvents(handlers) {
        if (!handlers) return;

        // Splash
        this.bindClick(this.elements.startButton, handlers.onStartGame);

        // Permission
        this.bindClick(this.elements.requestPermissionButton, handlers.onRequestPermission);

        // BLE Connect
        this.bindClick(this.elements.connectBleButton, handlers.onConnectBLE);

        // Calibrate: リセット（再キャリブ）と確定（ゲーム開始）を分離
        this.bindClick(this.elements.resetCalibrationButton, handlers.onResetCalibration);
        this.bindClick(this.elements.startCalibrationButton, handlers.onConfirmCalibration);

        // Title Screen 2 (New)
        // Title02 のプレイボタンは 「キャリブレーション画面へ遷移」 にする（フローチャートに合わせる）
        this.bindClick(this.elements.titleStartButton, handlers.onRecalibrate);
        this.bindClick(this.elements.titleReconnectButton, handlers.onReconnect);
        this.bindClick(this.elements.titleRecalibrateButton, handlers.onRecalibrate);

        // Gameplay screen start (in-scene)
        this.bindClick(this.elements.sceneStartButton, handlers.onStartInScene);

        // Result (Updated)
        // Bind both success and failure return buttons if present
        this.bindClick(this.elements.returnToTitleButtonSuccess, handlers.onReturnToTitle);
        this.bindClick(this.elements.returnToTitleButtonFail, handlers.onReturnToTitle);

        // Debug
        this.bindClick(this.elements.toggleDebugButton, handlers.onToggleDebug);
        this.bindClick(this.elements.toggleDebugButtonResult, handlers.onToggleDebug);
    }

    bindClick(element, handler) {
        if (element && handler) {
            element.addEventListener('click', handler);
        }
    }

    // --- Permission Screen Updates ---

    updatePermissionStatus(type, status, message) {
        // type: 'camera' or 'motion'
        const el = type === 'camera' ? this.elements.cameraStatus : this.elements.motionStatus;
        if (!el) return;

        if (status === 'granted') {
            el.textContent = '[ OK ]';
            el.classList.remove('animate-pulse', 'text-primary'); // Remove pulse/red
            el.classList.add('text-ink-black');
        } else if (status === 'denied') {
            el.textContent = '[ DENIED ]';
            el.classList.remove('animate-pulse');
            el.classList.add('text-gray-400');
        } else {
            // Pending/Prompt
            if (message) el.textContent = `[ ${message} ]`;
        }
    }

    showPermissionError(message) {
        if (this.elements.permissionError) {
            this.elements.permissionError.textContent = `ERROR: ${message}`;
        }
    }

    addPermissionLog(message) {
        // Log to console
        console.log(`[Permission] ${message}`);

        // Update footer status text (single line only)
        const statusEl = this.elements.permissionDebugLogStatus;
        if (statusEl) {
            statusEl.textContent = message.toUpperCase();
        }
    }

    // --- BLE Screen Updates ---

    updateBLEStatus(status, message) {
        if (this.elements.bleStatus) {
            // Check if status implies success (e.g. "Connected")
            const isConnected = (status === '接続成功' || status === 'Connected' || message === '接続成功');

            if (isConnected) {
                this.elements.bleStatus.textContent = '[ CONNECTED ]';
                this.elements.bleStatus.classList.remove('animate-pulse', 'text-primary');
                this.elements.bleStatus.classList.add('text-ink-black');
            } else {
                // Formatting for display
                const displayMsg = message || status;
                this.elements.bleStatus.textContent = `[ ${displayMsg.toUpperCase()} ]`;
                this.elements.bleStatus.classList.add('animate-pulse', 'text-primary');
                this.elements.bleStatus.classList.remove('text-ink-black');
            }
        }

        // Also update footer
        if (this.elements.bleFooterStatus) {
            this.elements.bleFooterStatus.textContent = (message || status).toUpperCase();
        }
    }

    showBLEError(message) {
        if (this.elements.bleError) {
            this.elements.bleError.textContent = `ERROR: ${message}`;
        }
    }

    // --- Calibration Screen Updates ---

    updateCalibrationValues(pitch, yaw, roll) {
        if (this.elements.calibPitch) this.elements.calibPitch.textContent = `${pitch.toFixed(1)}°`;
        if (this.elements.calibYaw) this.elements.calibYaw.textContent = `${yaw.toFixed(1)}°`;
        if (this.elements.calibRoll) this.elements.calibRoll.textContent = `${roll.toFixed(1)}°`;

        this._updateBarDisplay(this.elements.calibPitchBars, pitch);
        this._updateBarDisplay(this.elements.calibYawBars, yaw);
        this._updateBarDisplay(this.elements.calibRollBars, roll);
    }

    _updateBarDisplay(container, value) {
        if (!container) return;

        // Calculate number of active bars (Max 15)
        // Assume 90 degrees is full scale, so approx 6 degrees per bar.
        const maxBars = 15;
        const degPerBar = 6;
        const activeCount = Math.min(maxBars, Math.ceil(Math.abs(value) / degPerBar));

        // Get all bar divs
        const bars = container.children;
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            if (i < activeCount) {
                // Active: bg-primary and shadow
                bar.className = 'w-1 h-2 bg-primary shadow-[0_0_4px_#FF0000]';
            } else {
                // Inactive: bg-ink-black/10
                bar.className = 'w-1 h-2 bg-ink-black/10';
            }
        }
    }

    // --- HUD Updates ---

    updateHUD(stats, playerState) {
        // メインHUDの数値更新
        if (this.elements.playerHP) this.elements.playerHP.textContent = `${playerState.hp} / ${playerState.maxHP}`;
        if (this.elements.killCount) this.elements.killCount.textContent = `${stats.killCount}`;
        if (this.elements.timeLeft) this.elements.timeLeft.textContent = `${stats.remainingTime.toFixed(0)}`;

        // HPバーの更新（メイン）
        if (this.elements.hpBarFill) {
            const pct = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.elements.hpBarFill.style.width = `${pct * 100}%`;
        }

        // スタートオーバーレイ用の数値同期（もし表示中なら同じ値を表示）
        if (this.elements.playerHPStart) this.elements.playerHPStart.textContent = `${playerState.hp} / ${playerState.maxHP}`;
        if (this.elements.killCountStart) this.elements.killCountStart.textContent = `${stats.killCount}`;
        if (this.elements.timeLeftStart) this.elements.timeLeftStart.textContent = `${stats.remainingTime.toFixed(0)}`;
        if (this.elements.hpBarFillStart) {
            const pct2 = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.elements.hpBarFillStart.style.width = `${pct2 * 100}%`;
        }

        // Top center HUD (Elapsed / Defeated)
        if (this.elements.elapsedTimeDisplay) {
            const elapsedSec = (stats.gameTime || 0) / 1000;
            const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
            const ss = String(Math.floor(elapsedSec % 60)).padStart(2, '0');
            this.elements.elapsedTimeDisplay.textContent = `${mm}:${ss}`;
        }
        if (this.elements.defeatedDisplay) {
            this.elements.defeatedDisplay.textContent = `${stats.killCount}`;
        }

        // Vertical HP update
        if (this.elements.verticalHpFill) {
            const pct = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.elements.verticalHpFill.style.height = `${pct * 100}%`;
        }
        if (this.elements.verticalHpNum) this.elements.verticalHpNum.textContent = `${playerState.hp}`;
        if (this.elements.verticalHpMax) this.elements.verticalHpMax.textContent = `${playerState.maxHP}`;
    }

    updatePowerMode(active, remainingTime) {
        if (this.elements.hudPowerMode) {
            this.elements.hudPowerMode.style.display = active ? 'block' : 'none';
        }
        if (this.elements.powerModeTime && active) {
            this.elements.powerModeTime.textContent = (remainingTime / 1000).toFixed(1);
        }
    }

    // --- Effects ---

    triggerDamageEffect() {
        const flash = this.elements.flashOverlay;
        const vignette = this.elements.damageVignette;
        const container = this.elements.uiContainer;

        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => { flash.style.opacity = '0'; }, 80);
        }
        if (vignette) {
            vignette.style.transition = 'opacity 0.05s ease-out';
            vignette.style.opacity = '1';
            setTimeout(() => {
                vignette.style.transition = 'opacity 2.5s ease-in';
                vignette.style.opacity = '0';
            }, 200);
        }
        if (container) {
            container.classList.remove('shake-screen');
            void container.offsetWidth; // reflow
            container.classList.add('shake-screen');
        }
        // モバイル端末の振動（対応している場合）
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                // 短い振動パターン: 100ms - 40ms - 100ms
                navigator.vibrate([100, 40, 100]);
            }
        } catch (e) {
            // 安全のため例外は無視
            console.warn('vibrate failed', e);
        }
    }

    // --- Enemy Indicators ---

    clearEnemyIndicators() {
        if (this.elements.enemyIndicators) {
            this.elements.enemyIndicators.innerHTML = '';
        }
        this.enemyIndicatorMap.clear();
    }

    updateEnemyIndicators(enemies, viewDir, fovInfo, projectToNdcFunc, getEnemyWorldPosFunc) {
        const container = this.elements.enemyIndicators;
        if (!container) return;

        const existingIds = new Set(this.enemyIndicatorMap.keys());
        const { halfHorz, halfVert } = fovInfo;

        const viewYaw = Math.atan2(viewDir.x, viewDir.z);
        const viewElev = Math.atan2(viewDir.y, Math.sqrt(viewDir.x * viewDir.x + viewDir.z * viewDir.z));

        for (const enemy of enemies) {
            // Screen check
            const worldPos = getEnemyWorldPosFunc(enemy);
            const ndc = projectToNdcFunc(worldPos);
            const margin = 0.1;
            const onScreen = ndc.z < 0 && ndc.z >= -1 && ndc.x >= -1 + margin && ndc.x <= 1 - margin && ndc.y >= -1 + margin && ndc.y <= 1 - margin;

            const existing = this.enemyIndicatorMap.get(enemy.id);
            if (onScreen) {
                if (existing) {
                    container.removeChild(existing);
                    this.enemyIndicatorMap.delete(enemy.id);
                }
                continue;
            }

            // Calculate direction
            const enemyDir = {
                x: worldPos.x, // Assuming getEnemyWorldPosFunc returns vector relative to center, which works for direction calculation if origin is same
                y: worldPos.y,
                z: worldPos.z
            };
            // Note: getEnemyWorldPosFunc returns Cartesian coords, so we can use them directly for atan2
            const enemyYaw = Math.atan2(enemyDir.x, enemyDir.z);
            const enemyElev = Math.atan2(enemyDir.y, Math.sqrt(enemyDir.x * enemyDir.x + enemyDir.z * enemyDir.z));

            let yawDiff = (enemyYaw - viewYaw) * 180 / Math.PI;
            let pitchDiff = (enemyElev - viewElev) * 180 / Math.PI;
            yawDiff = this.normalizeAngleDeg(yawDiff);
            pitchDiff = this.normalizeAngleDeg(pitchDiff);

            const indicatorEl = existing || this.createEnemyIndicator(container);
            this.positionIndicator(indicatorEl, yawDiff, pitchDiff, halfHorz, halfVert, enemy);
            this.updateIndicatorLabel(indicatorEl, enemy);

            this.enemyIndicatorMap.set(enemy.id, indicatorEl);
            existingIds.delete(enemy.id);
        }

        // Remove stale
        for (const staleId of existingIds) {
            const el = this.enemyIndicatorMap.get(staleId);
            if (el && el.parentElement === container) {
                container.removeChild(el);
            }
            this.enemyIndicatorMap.delete(staleId);
        }
    }

    toggleSceneStartButton(show) {
        const btn = this.elements.sceneStartButton;
        const overlay = this.elements.startOverlay;
        if (btn) {
            btn.style.display = show ? 'block' : 'none';
            btn.style.pointerEvents = show ? 'auto' : 'none';
        }
        if (overlay) {
            // Note: overlay is now at top level with flex display in class when active
            overlay.style.display = show ? 'flex' : 'none';
            overlay.style.pointerEvents = show ? 'auto' : 'none';
            if (show) overlay.classList.remove('hidden'); else overlay.classList.add('hidden');
        }
    }

    /**
     * カウントダウン表示を開始する。
     * countFrom: number (例: 3)
     * onComplete: 呼び出し後に実行されるコールバック
     */
    showCountdown(countFrom, onComplete) {
        const overlay = this.elements.countdownOverlay;
        const valueEl = this.elements.countdownValue;
        if (!overlay || !valueEl) {
            if (onComplete) onComplete();
            return;
        }

        // Ensure visible using inline styles to avoid Tailwind/class conflicts
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto';

        let current = countFrom;
        valueEl.textContent = String(current);

        // clear any existing countdown timer
        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }

        const tick = () => {
            current -= 1;
            if (current <= 0) {
                overlay.style.display = 'none';
                overlay.style.pointerEvents = 'none';
                valueEl.textContent = '';
                this._countdownTimer = null;
                if (onComplete) onComplete();
                return;
            }
            valueEl.textContent = String(current);
            this._countdownTimer = setTimeout(tick, 1000);
        };

        this._countdownTimer = setTimeout(tick, 1000);
    }

    hideCountdown() {
        const overlay = this.elements.countdownOverlay;
        const valueEl = this.elements.countdownValue;
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.pointerEvents = 'none';
        }
        if (valueEl) valueEl.textContent = '';
        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }
    }


    createEnemyIndicator(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'enemy-indicator';
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        const label = document.createElement('div');
        label.className = 'label';
        wrapper.appendChild(arrow);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
        return wrapper;
    }

    updateIndicatorLabel(el, enemy) {
        const label = el.querySelector('.label');
        if (label) {
            // 距離を表示
            label.textContent = `${enemy.distance.toFixed(1)}m`;
        }

        // 矢印の色を距離に応じて緑 -> 赤 に補間
        const arrow = el.querySelector('.arrow');
        if (arrow && enemy && typeof enemy.distance === 'number') {
            const minDist = 0.9;
            const maxDist = 4.0;
            const dist = Math.max(minDist, Math.min(maxDist, enemy.distance));
            const t = Math.max(0, Math.min(1, (maxDist - dist) / (maxDist - minDist)));
            const hue = (1 - t) * 120; // 120=green, 0=red
            const color = `hsl(${hue}, 80%, 50%)`;
            arrow.style.borderBottomColor = color;
            arrow.style.filter = `drop-shadow(0 0 8px ${color})`;
            if (label) {
                label.style.color = color;
            }
        }
    }

    positionIndicator(el, yawDiff, pitchDiff, halfHorz, halfVert, enemy) {
        const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
        const normYaw = Math.abs(yawDiff) / halfHorz;
        const normPitch = Math.abs(pitchDiff) / halfVert;

        let xPct = 50;
        let yPct = 50;
        let rotation = 0;
        const marginPct = 6;

        if (normYaw >= normPitch) {
            // Horizontal edge
            const verticalShift = clamp(pitchDiff / halfVert, -1, 1) * 45;
            yPct = 50 - verticalShift * 0.5;
            if (yawDiff > 0) {
                xPct = 100 - marginPct;
                rotation = 90;
            } else {
                xPct = marginPct;
                rotation = -90;
            }
        } else {
            // Vertical edge
            const horizontalShift = clamp(yawDiff / halfHorz, -1, 1) * 45;
            xPct = 50 + horizontalShift * 0.5;
            if (pitchDiff > 0) {
                yPct = marginPct;
                rotation = 0;
            } else {
                yPct = 100 - marginPct;
                rotation = 180;
            }
        }

        el.style.left = `${xPct}%`;
        el.style.top = `${yPct}%`;
        const arrow = el.querySelector('.arrow');
        if (arrow) {
            // スケールを距離に応じて変化させる
            // 敵距離が近いほど t -> 1 (赤・大きく)、遠いほど t -> 0 (緑・小さめ)
            const minDist = 0.9; // EnemyManager.ENEMY_HIT_DISTANCE と整合
            const maxDist = 4.0; // 表示上の最大参照距離
            const dist = (enemy && typeof enemy.distance === 'number') ? enemy.distance : maxDist;
            const t = Math.max(0, Math.min(1, (maxDist - dist) / (maxDist - minDist)));
            const minScale = 0.9;
            const maxScale = 1.8;
            const scale = minScale + t * (maxScale - minScale);

            arrow.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;
        }
    }

    normalizeAngleDeg(deg) {
        while (deg > 180) deg -= 360;
        while (deg < -180) deg += 360;
        return deg;
    }

    // --- Result Screen ---

    // Show mission result. time is seconds.
    showResult(title, kills, timeSeconds) {
        // compute score = elapsed_ms * kills
        const elapsedMs = Math.round((timeSeconds || 0) * 1000);
        const score = Math.round(elapsedMs * (kills || 0));

        const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // Clear indicators and hide any existing mission screens
        this.clearEnemyIndicators();
        if (this.elements.resultScreen) this.elements.resultScreen.classList.add('hidden');
        if (this.elements.missionCompletedScreen) this.elements.missionCompletedScreen.classList.add('hidden');
        if (this.elements.missionFailScreen) this.elements.missionFailScreen.classList.add('hidden');

        const isSuccess = /クリア|Clear|任務完了/.test(title);

        // Show success screen
        if (isSuccess && this.elements.missionCompletedScreen) {
            this.elements.missionCompletedScreen.classList.remove('hidden');
            if (this.elements.completedScore) this.elements.completedScore.textContent = fmt(score);
            if (this.elements.completedKills) this.elements.completedKills.textContent = `${kills} KILLS`;
            if (this.elements.completedTime) {
                // display as HH:MM:SS if possible or fallback
                const sec = Math.floor(timeSeconds || 0);
                const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
                const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                const ss = String(sec % 60).padStart(2, '0');
                this.elements.completedTime.textContent = `${hh}:${mm}:${ss}`;
            }
        }

        // Show failure screen
        if (!isSuccess && this.elements.missionFailScreen) {
            this.elements.missionFailScreen.classList.remove('hidden');
            if (this.elements.failScore) this.elements.failScore.textContent = fmt(score);
            if (this.elements.failKills) this.elements.failKills.textContent = `${kills} KILLS`;
            if (this.elements.failTime) {
                const sec = Math.floor(timeSeconds || 0);
                const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
                const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                const ss = String(sec % 60).padStart(2, '0');
                this.elements.failTime.textContent = `${hh}:${mm}:${ss}`;
            }
        }
    }

    // --- Title Screen 2 ---

    showTitleScreen2() {
        // Hide other screens
        if (this.elements.resultScreen) this.elements.resultScreen.classList.add('hidden');
        // Do NOT hide the entire CRT container (it contains Title2). Only hide camera and canvas below.
        const videoEl = document.getElementById('cameraVideo');
        const canvasEl = document.getElementById('gameCanvas');
        if (videoEl) videoEl.style.display = 'none';
        if (canvasEl) canvasEl.style.display = 'none';

        // Prepare Title Screen 2 visual (background image + button layout)
        const titleEl = this.elements.titleScreen2;
        const startBtn = this.elements.titleStartButton;
        const reconnectBtn = this.elements.titleReconnectButton;

        if (titleEl) {
            // If title element is nested inside a hidden gameplay container, reparent it to <body>
            // and set fullscreen fixed styles so it can be visible independent of parent layout.
            if (!titleEl._origParent) {
                try {
                    titleEl._origParent = titleEl.parentNode;
                    titleEl._origNext = titleEl.nextSibling;
                    document.body.appendChild(titleEl);
                    // Prepare fixed fullscreen but keep it hidden until animation completes
                    Object.assign(titleEl.style, {
                        position: 'fixed',
                        left: '0',
                        top: '0',
                        width: '100%',
                        height: '100%',
                        display: 'none',
                        zIndex: '99999',
                        pointerEvents: 'auto'
                    });
                } catch (e) {
                    // fall back silently if reparenting fails
                    console.warn('reparent titleScreen2 failed', e);
                }
            }
            // We use an <img> element for the title background to avoid
            // CSS background-image double-loading and layout shifts.
            // Ensure no padding from .screen affects fullscreen layout
            titleEl.style.padding = '0';
            titleEl.style.background = 'transparent';
            titleEl.style.display = 'none'; // will be shown after boot sequence

            // Ensure buttons are placed: left-bottom Play, right-bottom Reconnect
            if (startBtn) {
                startBtn.style.position = 'absolute';
                startBtn.style.left = '4%';
                startBtn.style.bottom = '4%';
                startBtn.style.zIndex = '30';
            }
            if (reconnectBtn) {
                reconnectBtn.style.position = 'absolute';
                reconnectBtn.style.right = '4%';
                reconnectBtn.style.bottom = '4%';
                reconnectBtn.style.zIndex = '30';
            }

            // We'll insert a temporary image inside the CRT container so that
            // the CRT "turn on" animation reveals the image (same as loading->title).
            const globalTv = document.getElementById('global-tv-effects');
            const origGlobalTvOpacity = globalTv ? globalTv.style.opacity : null;
            const crtDisplay = this.elements.crtMainDisplay;

            // Prepare UI-side bg image (hidden until CRT finishes)
            let bgImg = document.getElementById('title02Img');
            if (!bgImg) {
                bgImg = document.createElement('img');
                bgImg.id = 'title02Img';
                bgImg.alt = 'Title 02';
                bgImg.className = 'title-02-bg';
                titleEl.insertBefore(bgImg, titleEl.firstChild);
            }
            bgImg.src = 'assets/picture/Title02.jpg';
            // Make UI title image fixed to viewport so it's unaffected by parent padding
            bgImg.style.position = 'fixed';
            bgImg.style.left = '0';
            bgImg.style.top = '0';
            bgImg.style.width = '100vw';
            bgImg.style.height = '100vh';
            bgImg.style.objectFit = 'cover';
            bgImg.style.zIndex = '60';
            bgImg.style.pointerEvents = 'none';
            // keep UI image hidden until CRT reveals image
            bgImg.style.opacity = '0';
            bgImg.style.transition = '';

            // Create a temporary CRT-side image so CRT animation affects it
            let crtImg = null;
            try {
                    if (crtDisplay) {
                    crtImg = document.getElementById('title02CrtImg');
                    if (!crtImg) {
                        crtImg = document.createElement('img');
                        crtImg.id = 'title02CrtImg';
                        crtImg.alt = 'Title 02 CRT';
                        // insert as first child so it sits above video/canvas but under overlays
                        crtDisplay.insertBefore(crtImg, crtDisplay.firstChild);
                    }
                    crtImg.src = 'assets/picture/Title02.jpg';
                    // Ensure CRT-side image also occupies full viewport (fixed) so no parent padding shows
                    crtImg.style.position = 'fixed';
                    crtImg.style.left = '0';
                    crtImg.style.top = '0';
                    crtImg.style.width = '100vw';
                    crtImg.style.height = '100vh';
                    // allow the image to stretch to container to enable vertical squash effect
                    crtImg.style.objectFit = 'fill';
                    crtImg.style.zIndex = '59';
                    crtImg.style.pointerEvents = 'none';
                    // Ensure it's fully visible so CRT turn-on affects its brightness/contrast
                    crtImg.style.opacity = '1';
                    crtImg.style.filter = '';
                        // Prepare animation class so it receives the CRT stretch/brightness animation
                        try {
                            crtImg.classList.remove('crt-img-animated');
                            void crtImg.offsetWidth;
                            crtImg.classList.add('crt-img-animated');
                        } catch (e) { }
                }
            } catch (e) {
                console.warn('failed to insert crt-side title img', e);
                crtImg = null;
            }

            // Start CRT boot; when complete, remove temporary crt image and reveal UI title
            this.playBootSequence(() => {
                // Ensure background color doesn't block image
                titleEl.style.backgroundColor = 'transparent';

                // Ensure TV effects remain active: apply tv-effect-on to global overlay
                if (globalTv) globalTv.classList.add('tv-effect-on');

                // Reveal UI title image (no fade) and show title overlay
                if (bgImg) {
                    bgImg.style.opacity = '1';
                }
                titleEl.classList.remove('hidden');
                titleEl.style.display = 'flex';
                titleEl.style.pointerEvents = 'auto';
                // Place title under global TV overlay so TV effects remain visible
                titleEl.style.zIndex = '60';

                // Make UI minimal: hide all buttons/labels except invisible hit areas
                try {
                    // Hide visible UI children (texts, overlays) under titleEl
                    const children = Array.from(titleEl.children);
                    children.forEach(ch => {
                        if (ch.id !== 'title02Img' && ch.id !== 'titleStartButton' && ch.id !== 'titleReconnectButton') {
                            // keep element in DOM but visually hidden
                            ch.style.display = 'none';
                        }
                    });

                    // Create transparent hit areas (do not move original buttons)
                    const ensureHitArea = (id, left, right, bottom, widthPct, heightPct) => {
                        let el = document.getElementById(id);
                        if (!el) {
                            el = document.createElement('div');
                            el.id = id;
                            titleEl.appendChild(el);
                        }
                        Object.assign(el.style, {
                            position: 'absolute',
                            left: left || '',
                            right: right || '',
                            bottom: bottom || '4%',
                            width: widthPct || '28%',
                            height: heightPct || '18%',
                            zIndex: '70', // above title image, below global-tv-effects (80)
                            background: 'transparent',
                            pointerEvents: 'auto'
                        });
                        el.setAttribute('aria-hidden', 'true');
                        return el;
                    };

                    // Left-bottom Play area (matches visual in attachment)
                    const playHit = ensureHitArea('titlePlayHit', '4%', '', '6%', '34%', '18%');
                    // Right-bottom Reconnect area
                    const reconnectHit = ensureHitArea('titleReconnectHit', '', '4%', '6%', '26%', '14%');

                    // Wire hit areas to existing buttons via .click() so bound handlers run
                    if (playHit && startBtn) {
                        playHit.onclick = () => { startBtn.click(); };
                    }
                    if (reconnectHit && reconnectBtn) {
                        reconnectHit.onclick = () => { reconnectBtn.click(); };
                    }
                } catch (e) {
                    console.warn('failed to simplify title UI', e);
                }

                // Remove temporary CRT image now that UI title is visible
                try {
                    if (crtImg && crtImg.parentElement) crtImg.parentElement.removeChild(crtImg);
                } catch (e) { /* ignore */ }
            }, false);
        }
    }

    /**
     * Show Splash Screen with CRT boot reveal similar to Title Screen 2.
     * Uses a UI-side image and a temporary CRT-side image so the CRT boot
     * animation affects the visual. Safe to call even if elements are missing.
     */
    showSplashScreen() {
        const splashEl = document.getElementById('splashScreen');
        const splashContent = document.getElementById('splashContent');
        const crtDisplay = this.elements.crtMainDisplay || document.getElementById('crt-main-display');
        const globalTv = document.getElementById('global-tv-effects');

        if (!splashEl) return;

        // Ensure splashContent is visible (override any `opacity-0` class)
        try {
            if (splashContent) {
                splashContent.classList.remove('opacity-0');
                splashContent.style.opacity = '1';
                splashContent.style.transition = 'opacity 0.4s ease-out';
            }
        } catch (e) { }

        // Ensure splash element is at top-level and visible
        try {
            if (!splashEl._origParent) {
                splashEl._origParent = splashEl.parentNode;
                splashEl._origNext = splashEl.nextSibling;
                document.body.appendChild(splashEl);
                Object.assign(splashEl.style, {
                    position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', zIndex: '60', pointerEvents: 'auto'
                });
            }
        } catch (e) { }

        // Ensure existing splash image (if any) is preserved and forced visible after CRT
        let existingImg = null;
        if (splashContent) existingImg = splashContent.querySelector('img');
        // If no existing image, create a UI-side image as fallback
        let uiImg = document.getElementById('splashUiImg');
        if (!existingImg) {
            if (!uiImg) {
                uiImg = document.createElement('img');
                uiImg.id = 'splashUiImg';
                uiImg.className = 'image-width-based';
                uiImg.alt = 'Splash';
                if (splashContent) splashContent.insertBefore(uiImg, splashContent.firstChild);
                else splashEl.insertBefore(uiImg, splashEl.firstChild);
            }
            uiImg.src = 'assets/picture/Title.jpg';
            uiImg.style.opacity = '0';
            uiImg.style.transition = 'opacity 0.4s ease-out';
            uiImg.style.zIndex = '50';
            uiImg.style.pointerEvents = 'none';
        } else {
            // Ensure original image fills viewport and stays visible after the animation
            try {
                existingImg.style.position = 'fixed';
                existingImg.style.left = '0';
                existingImg.style.top = '0';
                existingImg.style.width = '100vw';
                existingImg.style.height = '100vh';
                existingImg.style.objectFit = 'cover';
                existingImg.style.zIndex = '50';
                existingImg.style.pointerEvents = 'none';
                existingImg.style.opacity = '0';
                existingImg.style.transition = 'opacity 0.4s ease-out';
            } catch (e) { }
        }

        // Create CRT-side image to receive CRT animation
        let crtImg = null;
        try {
            if (crtDisplay) {
                crtImg = document.getElementById('splashCrtImg');
                if (!crtImg) {
                    crtImg = document.createElement('img');
                    crtImg.id = 'splashCrtImg';
                    crtImg.alt = 'Splash CRT';
                    crtDisplay.insertBefore(crtImg, crtDisplay.firstChild);
                }
                crtImg.src = 'assets/picture/Title.jpg';
                crtImg.style.position = 'fixed';
                crtImg.style.left = '0';
                crtImg.style.top = '0';
                crtImg.style.width = '100vw';
                crtImg.style.height = '100vh';
                crtImg.style.objectFit = 'fill';
                crtImg.style.zIndex = '59';
                crtImg.style.pointerEvents = 'none';
                crtImg.style.opacity = '1';
                try { crtImg.classList.remove('crt-img-animated'); void crtImg.offsetWidth; crtImg.classList.add('crt-img-animated'); } catch (e) { }
            }
        } catch (e) { crtImg = null; }

        // Ensure global TV overlay visible
        if (globalTv) { globalTv.classList.add('tv-effect-on'); globalTv.style.display = ''; globalTv.style.opacity = ''; }

        // Start CRT boot; reveal image immediately after CRT turn-on animation (so user sees switch right after effect)
        const revealDelayMs = 1250; // slightly after 1.2s CRT CSS animation
        let revealTimer = null;

        revealTimer = setTimeout(() => {
            try {
                const imgToReveal = existingImg || uiImg;
                if (imgToReveal) imgToReveal.style.opacity = '1';
                splashEl.classList.add('active');
                splashEl.style.display = 'block';
                splashEl.style.pointerEvents = 'auto';
                const startBtn = document.getElementById('startButton');
                if (startBtn) startBtn.style.zIndex = '70';
            } catch (e) { }
        }, revealDelayMs);

        this.playBootSequence(() => {
            // If revealTimer still pending, clear it and ensure image is shown
            try { if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; } } catch (e) {}

            try {
                const imgToReveal = existingImg || uiImg;
                if (imgToReveal) imgToReveal.style.opacity = '1';
                splashEl.classList.add('active');
                splashEl.style.display = 'block';
                splashEl.style.pointerEvents = 'auto';
                const startBtn = document.getElementById('startButton');
                if (startBtn) startBtn.style.zIndex = '70';
            } catch (e) { }

            // Remove temporary CRT-side image
            try { if (crtImg && crtImg.parentElement) crtImg.parentElement.removeChild(crtImg); } catch (e) { }
        }, false);
    }

    hideSplashScreen() {
        const splashEl = document.getElementById('splashScreen');
        const uiImg = document.getElementById('splashUiImg');
        if (uiImg && uiImg.parentElement) uiImg.parentElement.removeChild(uiImg);
        if (splashEl) {
            splashEl.classList.remove('active');
            splashEl.style.display = 'none';
            // restore if reparented
            try {
                if (splashEl._origParent) {
                    if (splashEl._origNext) splashEl._origParent.insertBefore(splashEl, splashEl._origNext);
                    else splashEl._origParent.appendChild(splashEl);
                    delete splashEl._origParent; delete splashEl._origNext;
                }
            } catch (e) { }
        }
    }

    hideTitleScreen2() {
        if (this.elements.titleScreen2) {
            this.elements.titleScreen2.classList.add('hidden');
            // clear inline styles added when showing
            this.elements.titleScreen2.style.display = '';
            const sb = this.elements.titleStartButton;
            const rb = this.elements.titleReconnectButton;
            if (sb) {
                sb.style.position = '';
                sb.style.left = '';
                sb.style.bottom = '';
                sb.style.zIndex = '';
                sb.style.width = '';
                sb.style.height = '';
                sb.style.background = '';
                sb.style.color = '';
                sb.style.border = '';
                sb.style.pointerEvents = '';
                sb.style.opacity = '';
            }
            if (rb) {
                rb.style.position = '';
                rb.style.right = '';
                rb.style.bottom = '';
                rb.style.zIndex = '';
                rb.style.width = '';
                rb.style.height = '';
                rb.style.background = '';
                rb.style.color = '';
                rb.style.border = '';
                rb.style.pointerEvents = '';
                rb.style.opacity = '';
            }

            // If we reparented the element to body earlier, restore it to original parent
            try {
                const titleEl = this.elements.titleScreen2;
                if (titleEl._origParent) {
                    if (titleEl._origNext) titleEl._origParent.insertBefore(titleEl, titleEl._origNext);
                    else titleEl._origParent.appendChild(titleEl);
                    // clear saved refs
                    delete titleEl._origParent;
                    delete titleEl._origNext;
                }
                // clear positioning inline styles
                titleEl.style.position = '';
                titleEl.style.left = '';
                titleEl.style.top = '';
                titleEl.style.width = '';
                titleEl.style.height = '';
                titleEl.style.zIndex = '';
                titleEl.style.pointerEvents = '';

                // restore any hidden children we visually hid earlier
                try {
                    const children = Array.from(titleEl.children);
                    children.forEach(ch => {
                        ch.style.display = '';
                    });
                } catch (e) { }
                // Remove hit-area overlays we created
                try {
                    const playHit = document.getElementById('titlePlayHit');
                    if (playHit && playHit.parentElement) playHit.parentElement.removeChild(playHit);
                    const reconnectHit = document.getElementById('titleReconnectHit');
                    if (reconnectHit && reconnectHit.parentElement) reconnectHit.parentElement.removeChild(reconnectHit);
                    // Also remove CRT-side temp image if still present
                    const crtTemp = document.getElementById('title02CrtImg');
                    if (crtTemp && crtTemp.parentElement) crtTemp.parentElement.removeChild(crtTemp);
                } catch (e) { }
            } catch (e) {
                // ignore
            }
        }
    }

    // --- CRT Boot Sequence ---
    // (Existing code follows)

    /**
     * ゲーム開始時のCRT起動演出 & ホログラム表示
     * @param {Function} onComplete - 演出完了後のコールバック
     */
    playBootSequence(onComplete, showCamera = true) {
        const crtDisplay = this.elements.crtMainDisplay;
        const hologram = this.elements.hologramText;
        const videoEl = document.getElementById('cameraVideo');
        const canvasEl = document.getElementById('gameCanvas');

        if (!crtDisplay) {
            if (onComplete) onComplete();
            return;
        }

        // Control camera / canvas visibility according to caller intent
        if (!showCamera) {
            if (videoEl) videoEl.style.display = 'none';
            if (canvasEl) canvasEl.style.display = 'none';
        }

        // Ensure display is visible (remove hidden)
        crtDisplay.classList.remove('hidden');

        // Insert explicit white-line overlay to guarantee the horizontal-line -> stretch visual
        let crtLineEl = null;
        try {
            crtLineEl = document.createElement('div');
            crtLineEl.className = 'crt-line-overlay';
            crtDisplay.appendChild(crtLineEl);
        } catch (e) {
            crtLineEl = null;
        }

        // 1. Trigger CRT Turn-On Animation
        crtDisplay.classList.remove('opacity-0');
        crtDisplay.classList.remove('crt-turn-on-active');
        void crtDisplay.offsetWidth; // Force reflow
        crtDisplay.classList.add('crt-turn-on-active');

        // Remove overlay after animation finishes (slightly after keyframe)
        if (crtLineEl) {
            setTimeout(() => {
                try { if (crtLineEl && crtLineEl.parentElement) crtLineEl.parentElement.removeChild(crtLineEl); } catch (e) {}
            }, 1400);
        }

        // 2. Hologram Sequence
        if (hologram) {
            hologram.className = 'hologram-fuda-text';
            void hologram.offsetWidth;

            setTimeout(() => { hologram.classList.add('hologram-in'); }, 600);
            setTimeout(() => {
                hologram.classList.remove('hologram-in');
                hologram.classList.add('hologram-idle');
            }, 1100);

            setTimeout(() => {
                // If caller requested camera visible, ensure it's shown now
                if (showCamera) {
                    if (videoEl) videoEl.style.display = '';
                    if (canvasEl) {
                        canvasEl.style.display = '';
                        canvasEl.classList.remove('hidden');
                    }
                }
                if (onComplete) onComplete();
            }, 2000);
        } else {
            setTimeout(() => {
                if (showCamera) {
                    if (videoEl) videoEl.style.display = '';
                    if (canvasEl) {
                        canvasEl.style.display = '';
                        canvasEl.classList.remove('hidden');
                    }
                }
                if (onComplete) onComplete();
            }, 2000);
        }
    }
}
