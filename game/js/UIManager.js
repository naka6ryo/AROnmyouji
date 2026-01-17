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
            confirmCalibrationButton: document.getElementById('confirmCalibrationButton'),

            // Gameplay HUD
            playerHP: document.getElementById('playerHP'),
            killCount: document.getElementById('killCount'),
            timeLeft: document.getElementById('timeLeft'),
            hudPowerMode: document.getElementById('hudPowerMode'),
            powerModeTime: document.getElementById('powerModeTime'),
            enemyIndicators: document.getElementById('enemyIndicators'),

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

        // Calibrate
        this.bindClick(this.elements.confirmCalibrationButton, handlers.onConfirmCalibration);

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
        if (this.elements.playerHP) this.elements.playerHP.textContent = `HP: ${playerState.hp} / ${playerState.maxHP}`;
        if (this.elements.killCount) this.elements.killCount.textContent = `撃破: ${stats.killCount}`;
        if (this.elements.timeLeft) this.elements.timeLeft.textContent = `残り時間: ${stats.remainingTime.toFixed(0)}秒`;
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
            this.positionIndicator(indicatorEl, yawDiff, pitchDiff, halfHorz, halfVert);
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
    }

    positionIndicator(el, yawDiff, pitchDiff, halfHorz, halfVert) {
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
            arrow.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
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
