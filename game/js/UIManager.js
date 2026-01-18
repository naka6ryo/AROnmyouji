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
            permissionDebugLog: document.getElementById('permissionDebugLog'),

            // BLE Connect
            connectBleButton: document.getElementById('connectBleButton'),
            bleStatus: document.getElementById('bleStatus'),
            bleError: document.getElementById('bleError'),

            // Calibrate
            calibPitch: document.getElementById('calibPitch'),
            calibYaw: document.getElementById('calibYaw'),
            calibRoll: document.getElementById('calibRoll'),
            resetCalibrationButton: document.getElementById('resetCalibrationButton'),
            startCalibrationButton: document.getElementById('startCalibrationButton'),

            // Gameplay HUD
            playerHP: document.getElementById('playerHP'),
            hpBarFill: document.getElementById('hpBarFill'),
            // Start overlay copies
            playerHPStart: document.getElementById('playerHPStart'),
            hpBarFillStart: document.getElementById('hpBarFillStart'),
            killCountStart: document.getElementById('killCountStart'),
            timeLeftStart: document.getElementById('timeLeftStart'),
            killCount: document.getElementById('killCount'),
            // Audio debug/test
            audioTestButton: document.getElementById('audioTestButton'),
            audioStatus: document.getElementById('audioStatus'),
            audioTestLog: document.getElementById('audioTestLog'),
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
            resultTitle: document.getElementById('resultTitle'),
            resultKills: document.getElementById('resultKills'),
            resultTime: document.getElementById('resultTime'),
            retryButton: document.getElementById('retryButton'),
            reconnectButton: document.getElementById('reconnectButton'),
            recalibrateButton: document.getElementById('recalibrateButton'),

            // Debug
            toggleDebugButton: document.getElementById('toggleDebugButton'),
            toggleDebugButtonResult: document.getElementById('toggleDebugButtonResult')
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

        // Gameplay screen start (in-scene)
        this.bindClick(this.elements.sceneStartButton, handlers.onStartInScene);
        // Audio test button
        this.bindClick(this.elements.audioTestButton, handlers.onAudioTest);

        // Result
        this.bindClick(this.elements.retryButton, handlers.onRetry);
        this.bindClick(this.elements.reconnectButton, handlers.onReconnect);
        this.bindClick(this.elements.recalibrateButton, handlers.onRecalibrate);

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
        // status: 'granted', 'denied', 'prompt', 'unknown'
        const el = type === 'camera' ? this.elements.cameraStatus : this.elements.motionStatus;
        if (!el) return;

        let icon = status === 'granted' ? '✓' : (status === 'denied' ? '✗' : '?');
        let text = type === 'camera' ? '📷 カメラ: ' : '📱 モーション: ';

        if (message) {
            el.textContent = `${text} ${message}`;
        } else {
            el.textContent = `${text} ${status} ${icon}`;
        }
    }

    showPermissionError(message) {
        if (this.elements.permissionError) {
            this.elements.permissionError.textContent = `エラー: ${message}`;
        }
    }

    addPermissionLog(message) {
        const log = this.elements.permissionDebugLog;
        if (!log) return;

        const timestamp = new Date().toLocaleTimeString('ja-JP');
        const entry = document.createElement('div');
        entry.textContent = `[${timestamp}] ${message}`;
        entry.style.padding = '0.3rem';
        entry.style.borderBottom = '1px solid #333';

        log.appendChild(entry);
        log.parentElement.scrollTop = log.parentElement.scrollHeight;
    }

    // --- BLE Screen Updates ---

    updateBLEStatus(status, message) {
        if (this.elements.bleStatus) {
            this.elements.bleStatus.textContent = message || status;
        }
    }

    showBLEError(message) {
        if (this.elements.bleError) {
            this.elements.bleError.textContent = `接続エラー: ${message}`;
        }
    }

    // --- Calibration Screen Updates ---

    updateCalibrationValues(pitch, yaw, roll) {
        if (this.elements.calibPitch) this.elements.calibPitch.textContent = pitch.toFixed(1);
        if (this.elements.calibYaw) this.elements.calibYaw.textContent = yaw.toFixed(1);
        if (this.elements.calibRoll) this.elements.calibRoll.textContent = roll.toFixed(1);
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

    updateAudioStatus(msg) {
        const el = this.elements.audioStatus;
        if (el) el.textContent = `Audio: ${msg}`;
    }

    appendAudioLog(msg) {
        const log = this.elements.audioTestLog;
        if (!log) return;
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        entry.style.fontSize = '12px';
        entry.style.marginTop = '4px';
        log.appendChild(entry);
        // limit log size
        while (log.childNodes.length > 8) log.removeChild(log.firstChild);
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

    showResult(title, kills, time) {
        if (this.elements.resultTitle) this.elements.resultTitle.textContent = title;
        if (this.elements.resultKills) this.elements.resultKills.textContent = kills;
        if (this.elements.resultTime) this.elements.resultTime.textContent = time.toFixed(1);

        this.clearEnemyIndicators();
    }
}
