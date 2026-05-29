/**
 * UIManager.js
 * DOM要素の管理、イベントバインディング、画面更新を行うクラス
 */

import { soundManager } from './SoundManager.js';

const TUTORIAL_MAX_FPS = 30;
const TUTORIAL_MIN_FRAME_MS = 1000 / TUTORIAL_MAX_FPS;

export class UIManager {
    constructor() {
        this.elements = {};
        this.enemyIndicatorMap = new Map(); // enemyId -> element
        this._textCache = new WeakMap();
        this._styleCache = new WeakMap();
        this._barActiveCountCache = new WeakMap();
        this.circleFreezeOverlay = null;
        this.circleFreezeTimer = null;
        this.tutorialTimer = null;
        this.tutorialRaf = null;
        this.tutorialActive = false;
        this.tutorialPreloads = [];
        this.tutorialSpriteImages = new Map();
        this.titleHomeBackground = 'assets/picture/Title02.jpg';
        this.titleHomeFailureBackground = 'assets/picture/Title02_fail.jpg';
        this.useFailureTitleBackground = false;
        this._preloadedImages = new Map();
    }

    /**
     * 単一画像をプリロードして内部キャッシュに保持する
     * @param {string} src
     * @returns {Promise<Image>}
     */
    preloadImage(src) {
        if (!src) return Promise.resolve(null);
        if (this._preloadedImages.has(src)) {
            const cached = this._preloadedImages.get(src);
            if (cached && cached.complete) return Promise.resolve(cached);
            // else fallthrough to return existing promise
            if (cached && cached.__promise) return cached.__promise;
        }

        const img = new Image();
        const p = new Promise((resolve, reject) => {
            img.onload = () => { resolve(img); };
            img.onerror = () => { resolve(img); };// resolve even on error to avoid blocking flow
        });
        // store a placeholder with promise so duplicate calls reuse
        img.__promise = p;
        this._preloadedImages.set(src, img);
        img.src = src;
        return p;
    }

    /**
     * タイトル用背景画像を事前読み込みする（非同期だが呼び出しておく）
     */
    preloadTitleBackgrounds() {
        try {
            this.preloadImage(this.titleHomeBackground).catch(() => {});
            this.preloadImage(this.titleHomeFailureBackground).catch(() => {});
        } catch (e) { }
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
            startCalibrationButton: document.getElementById('startCalibrationButton'),

            // Title Screen 2 (New)
            titleScreen2: document.getElementById('titleScreen2'),
            titleStartButton: document.getElementById('titleStartButton'),
            titleReconnectButton: document.getElementById('titleReconnectButton'),
            titleRecalibrateButton: document.getElementById('titleRecalibrateButton'),

            // Gameplay HUD
            gameplayScreen: document.getElementById('gameplayScreen'),
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
            tutorialInstruction: document.getElementById('tutorialInstruction'),
            tutorialEnglish: document.getElementById('tutorialEnglish'),
            tutorialCanvas: document.getElementById('tutorialCanvas'),
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

            // CRT Boot & Hologram
            crtMainDisplay: document.getElementById('crt-main-display'),
            hologramText: document.getElementById('hologramText')
        };
        // 初期化時にタイトル背景をプリロードしておく
        try { this.preloadTitleBackgrounds(); } catch (e) { }
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

        // Calibrate: 確定（ゲーム開始）ボタンのみバインド
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

    }

    bindClick(element, handler) {
        if (element && handler) {
            element.addEventListener('click', (e) => {
                try {
                    // ユーザージェスチャに紐づけてAudioContextを解除し、クリック音を鳴らす
                    if (typeof soundManager !== 'undefined' && soundManager) {
                        try { soundManager.unlock(); soundManager.initAudioContext(); } catch (err) { }
                        try {
                            soundManager.load({
                                fluorescent_crackle: 'assets/sfx/Fluorescent_Light-Noise01-1(Crackle).mp3'
                            }).catch(() => { });
                        } catch (err) { }
                        try { soundManager.play('button', { volume: 0.6 }); } catch (err) { }
                    }
                } catch (err) {
                    // 無視
                }
                handler(e);
            });
        }
    }

    setTextIfChanged(element, value) {
        if (!element) return;
        const text = String(value);
        if (this._textCache.get(element) === text) return;
        element.textContent = text;
        this._textCache.set(element, text);
    }

    setStyleIfChanged(element, prop, value) {
        if (!element) return;
        let cache = this._styleCache.get(element);
        if (!cache) {
            cache = {};
            this._styleCache.set(element, cache);
        }
        if (cache[prop] === value) return;
        element.style[prop] = value;
        cache[prop] = value;
    }

    // --- Permission Screen Updates ---

    updatePermissionStatus(type, status, message) {
        // type: 'camera' or 'motion'
        const el = type === 'camera' ? this.elements.cameraStatus : this.elements.motionStatus;
        if (!el) return;

        if (status === 'granted') {
            this.setTextIfChanged(el, '[ OK ]');
            el.classList.remove('animate-pulse', 'text-primary'); // Remove pulse/red
            el.classList.add('text-ink-black');
        } else if (status === 'denied') {
            this.setTextIfChanged(el, '[ DENIED ]');
            el.classList.remove('animate-pulse');
            el.classList.add('text-gray-400');
        } else {
            // Pending/Prompt
            if (message) this.setTextIfChanged(el, `[ ${message} ]`);
        }
    }

    showPermissionError(message) {
        if (this.elements.permissionError) {
            this.setTextIfChanged(this.elements.permissionError, `ERROR: ${message}`);
        }
    }

    // --- BLE Screen Updates ---

    updateBLEStatus(status, message) {
        if (this.elements.bleStatus) {
            // Check if status implies success (e.g. "Connected")
            const isConnected = (status === '接続成功' || status === 'Connected' || message === '接続成功');

            if (isConnected) {
                this.setTextIfChanged(this.elements.bleStatus, '[ CONNECTED ]');
                this.elements.bleStatus.classList.remove('animate-pulse', 'text-primary');
                this.elements.bleStatus.classList.add('text-ink-black');
            } else {
                // Formatting for display
                const displayMsg = message || status;
                this.setTextIfChanged(this.elements.bleStatus, `[ ${displayMsg.toUpperCase()} ]`);
                this.elements.bleStatus.classList.add('animate-pulse', 'text-primary');
                this.elements.bleStatus.classList.remove('text-ink-black');
            }
        }

        // Also update footer
        if (this.elements.bleFooterStatus) {
            this.setTextIfChanged(this.elements.bleFooterStatus, (message || status).toUpperCase());
        }
    }

    showBLEError(message) {
        if (this.elements.bleError) {
            this.setTextIfChanged(this.elements.bleError, `ERROR: ${message}`);
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
        if (this._barActiveCountCache.get(container) === activeCount) return;
        this._barActiveCountCache.set(container, activeCount);

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
        this.setTextIfChanged(this.elements.playerHP, `${playerState.hp} / ${playerState.maxHP}`);
        this.setTextIfChanged(this.elements.killCount, `${stats.killCount}`);
        this.setTextIfChanged(this.elements.timeLeft, `${stats.remainingTime.toFixed(0)}`);

        // HPバーの更新（メイン）
        if (this.elements.hpBarFill) {
            const pct = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.setStyleIfChanged(this.elements.hpBarFill, 'width', `${pct * 100}%`);
        }

        // スタートオーバーレイ用の数値同期（もし表示中なら同じ値を表示）
        this.setTextIfChanged(this.elements.playerHPStart, `${playerState.hp} / ${playerState.maxHP}`);
        this.setTextIfChanged(this.elements.killCountStart, `${stats.killCount}`);
        this.setTextIfChanged(this.elements.timeLeftStart, `${stats.remainingTime.toFixed(0)}`);
        if (this.elements.hpBarFillStart) {
            const pct2 = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.setStyleIfChanged(this.elements.hpBarFillStart, 'width', `${pct2 * 100}%`);
        }

        // Top center HUD (Elapsed / Defeated)
        if (this.elements.elapsedTimeDisplay) {
            const remainingSec = Math.max(0, stats.remainingTime);
            const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
            const ss = String(Math.floor(remainingSec % 60)).padStart(2, '0');
            this.setTextIfChanged(this.elements.elapsedTimeDisplay, `${mm}:${ss}`);
        }
        if (this.elements.defeatedDisplay) {
            this.setTextIfChanged(this.elements.defeatedDisplay, `${stats.killCount}`);
        }

        // Vertical HP update
        if (this.elements.verticalHpFill) {
            const pct = Math.max(0, Math.min(1, playerState.hp / playerState.maxHP));
            this.setStyleIfChanged(this.elements.verticalHpFill, 'height', `${pct * 100}%`);
        }
        this.setTextIfChanged(this.elements.verticalHpNum, `${playerState.hp}`);
        this.setTextIfChanged(this.elements.verticalHpMax, `${playerState.maxHP}`);
    }

    updatePowerMode(active, remainingTime) {
        if (this.elements.hudPowerMode) {
            this.setStyleIfChanged(this.elements.hudPowerMode, 'display', active ? 'block' : 'none');
        }
        if (this.elements.powerModeTime && active) {
            this.setTextIfChanged(this.elements.powerModeTime, (remainingTime / 1000).toFixed(1));
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
                // 被弾時は断続的に3回振動させる: 80ms 振動, 40ms 間隔 を2回繰り返し計3回
                navigator.vibrate([80, 40, 80, 40, 80]);
            }
        } catch (e) {
            // 安全のため例外は無視
            
        }
    }

    triggerCircleFreezeEffect(durationMs = 3000) {
        const flash = this.elements.flashOverlay;
        const container = this.elements.uiContainer;

        if (flash) {
            const originalBackground = flash.style.backgroundColor;
            const originalMixBlendMode = flash.style.mixBlendMode;
            flash.style.backgroundColor = 'rgba(150, 230, 255, 0.95)';
            flash.style.mixBlendMode = 'screen';
            flash.style.opacity = '1';
            setTimeout(() => {
                flash.style.opacity = '0';
                flash.style.backgroundColor = originalBackground;
                flash.style.mixBlendMode = originalMixBlendMode;
            }, 140);
        }

        if (container) {
            container.classList.remove('freeze-screen');
            const raf = typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame
                : (callback) => setTimeout(callback, 16);

            const overlay = this.ensureCircleFreezeOverlay();
            overlay.querySelector('.circle-freeze-duration').textContent = `${(durationMs / 1000).toFixed(0)}秒`;
            overlay.classList.remove('active');
            raf(() => {
                container.classList.add('freeze-screen');
                overlay.classList.add('active');
            });

            if (this.circleFreezeTimer) clearTimeout(this.circleFreezeTimer);
            this.circleFreezeTimer = setTimeout(() => {
                overlay.classList.remove('active');
            }, 900);
        }

        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate([45, 35, 45]);
            }
        } catch (e) {
            
        }
    }

    ensureCircleFreezeOverlay() {
        if (this.circleFreezeOverlay && this.circleFreezeOverlay.parentElement) {
            return this.circleFreezeOverlay;
        }

        const overlay = document.createElement('div');
        overlay.className = 'circle-freeze-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="circle-freeze-sigil"></div>
            <div class="circle-freeze-label">氷封結界</div>
            <div class="circle-freeze-mantra">急急如律令</div>
            <div class="circle-freeze-duration">3秒</div>
        `;
        document.body.appendChild(overlay);
        this.circleFreezeOverlay = overlay;
        return overlay;
    }

    // --- Enemy Indicators ---

    clearEnemyIndicators() {
        if (this.elements.enemyIndicators) {
            this.elements.enemyIndicators.innerHTML = '';
        }
        this.enemyIndicatorMap.clear();
    }

    updateEnemyIndicators(enemies, viewDir, fovInfo, projectToNdcFunc, getEnemyWorldPosFunc, cameraBasis = null) {
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
            const margin = 0.02;
            // OpenGL NDC depth is -1 to 1. Check full range.
            const onScreen = ndc.z >= -1 && ndc.z <= 1 &&
                ndc.x >= -1 + margin && ndc.x <= 1 - margin &&
                ndc.y >= -1 + margin && ndc.y <= 1 - margin;

            const existing = this.enemyIndicatorMap.get(enemy.id);
            if (onScreen) {
                if (existing) {
                    container.removeChild(existing);
                    this.enemyIndicatorMap.delete(enemy.id);
                }
                continue;
            }

            // Calculate direction using Basis Vectors relative to View
            // This avoids Euler angle singularities and Left/Right confusion.

            // 1. Basis Vectors. Prefer the renderer's camera basis so roll is preserved.
            let fwd = cameraBasis && cameraBasis.forward ? cameraBasis.forward : { x: viewDir.x, y: viewDir.y, z: viewDir.z };
            let right = cameraBasis && cameraBasis.right ? cameraBasis.right : null;
            let up = cameraBasis && cameraBasis.up ? cameraBasis.up : null;

            const fwdLen = Math.sqrt(fwd.x * fwd.x + fwd.y * fwd.y + fwd.z * fwd.z) || 1;
            const fwdX = fwd.x / fwdLen;
            const fwdY = fwd.y / fwdLen;
            const fwdZ = fwd.z / fwdLen;

            if (!right || !up) {
                right = { x: -fwdZ, y: 0, z: fwdX };
                const rightLen = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
                if (rightLen < 0.001) {
                    right = { x: 1, y: 0, z: 0 };
                } else {
                    right.x /= rightLen; right.y /= rightLen; right.z /= rightLen;
                }
                up = {
                    x: right.y * fwdZ - right.z * fwdY,
                    y: right.z * fwdX - right.x * fwdZ,
                    z: right.x * fwdY - right.y * fwdX
                };
            }

            // 2. Enemy Direction Relative to Camera
            // worldPos is relative to camera (since it's computed from r, azim, elev)
            // or if it's world coords, we assume camera is at origin or we only care about direction.
            // Normalize enemy vector.
            const eVec = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
            const eLen = Math.sqrt(eVec.x * eVec.x + eVec.y * eVec.y + eVec.z * eVec.z);
            if (eLen > 0) { eVec.x /= eLen; eVec.y /= eLen; eVec.z /= eLen; }

            // 3. Project Enemy Vector onto Basis
            // vx = Dot(eVec, right)
            // vy = Dot(eVec, up)
            // vz = Dot(eVec, fwd) -- We use this to know if behind
            const vx = eVec.x * right.x + eVec.y * right.y + eVec.z * right.z;
            const vy = eVec.x * up.x + eVec.y * up.y + eVec.z * up.z;
            const vz = eVec.x * fwdX + eVec.y * fwdY + eVec.z * fwdZ;

            // 4. Calculate Screen Angle
            // atan2(vy, vx) gives angle in Camera Plane (Math usually: 0=Right, 90=Up)
            let rad = Math.atan2(vy, vx);

            // 5. Map to Screen Edge
            const marginPct = 6;
            let xPct;
            let yPct;
            let edgeX;
            let edgeY;

            if (vz < 0) {
                // Behind-camera enemies are pushed to the side so the player can turn
                // horizontally instead of chasing an arrow into the top edge.
                const sideThreshold = 0.08;
                const previousSide = existing && existing.dataset.behindSide
                    ? Number(existing.dataset.behindSide)
                    : 1;
                const side = Math.abs(vx) > sideThreshold ? (vx < 0 ? -1 : 1) : previousSide;
                edgeX = side;
                edgeY = Math.max(-0.35, Math.min(0.35, vy * 0.6));
                rad = Math.atan2(edgeY, edgeX);
                xPct = 50 + side * (50 - marginPct);
                yPct = Math.max(35, Math.min(65, 50 - edgeY * (50 - marginPct)));
            } else {
                const cosA = Math.cos(rad);
                const sinA = Math.sin(rad);
                const scale = 1.0 / Math.max(Math.abs(cosA), Math.abs(sinA), 0.0001);
                edgeX = cosA * scale;
                edgeY = sinA * scale;
                xPct = 50 + edgeX * (50 - marginPct);
                yPct = 50 - edgeY * (50 - marginPct);
            }

            // 6. Rotation
            // CSS 0 deg = Up.
            // Math 0 deg = Right.
            // We want Arrow to Point AT the enemy.
            // Vector (edgeX, edgeY) is direction TO enemy.
            // Angle of that vector = rad.
            // Math Angle -> CSS Angle:
            // Up (90) -> 0.   (90 - 90 = 0)
            // Right (0) -> 90. (90 - 0 = 90)
            // Left (180) -> -90. (90 - 180 = -90)
            const rotation = 90 - (rad * 180 / Math.PI);

            const indicatorEl = existing || this.createEnemyIndicator(container);
            if (vz < 0) {
                indicatorEl.dataset.behindSide = String(edgeX < 0 ? -1 : 1);
            } else {
                delete indicatorEl.dataset.behindSide;
            }

            this.setStyleIfChanged(indicatorEl, 'left', `${xPct}%`);
            this.setStyleIfChanged(indicatorEl, 'top', `${yPct}%`);

            const arrow = indicatorEl._arrow;
            if (arrow) {
                const minDist = 0.9;
                const maxDist = 4.0;
                const dist = (enemy && typeof enemy.distance === 'number') ? enemy.distance : maxDist;
                const t = Math.max(0, Math.min(1, (maxDist - dist) / (maxDist - minDist)));
                const minScale = 0.9;
                const maxScale = 1.8;
                const scaleVal = minScale + t * (maxScale - minScale);

                this.setStyleIfChanged(arrow, 'transform', `translate(-50%, -50%) rotate(${rotation}deg) scale(${scaleVal})`);
            }
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
        if (!show && this.tutorialTimer) {
            clearTimeout(this.tutorialTimer);
            this.tutorialTimer = null;
            this.tutorialActive = false;
        }
        if (!show && this.tutorialRaf) {
            cancelAnimationFrame(this.tutorialRaf);
            this.tutorialRaf = null;
        }
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

    showTutorialSequence(onComplete) {
        const overlay = this.elements.startOverlay;
        if (!overlay) {
            if (onComplete) onComplete();
            return;
        }

        const slides = [
            {
                instruction: '斬撃で敵を祓え',
                english: 'Banish enemies with a slash',
                sprite: 'assets/picture/Zangeki_spritesheet.jpg',
                frameCount: 22,
                frameWidth: 585,
                frameHeight: 877,
                columns: 6,
                frameMs: 80,
                loops: 3
            },
            {
                instruction: '円を描き敵を縫い留めよ',
                english: 'Draw a circle and pin enemies in place',
                sprite: 'assets/picture/Hyouketu_spritesheet.jpg',
                frameCount: 33,
                frameWidth: 585,
                frameHeight: 877,
                columns: 6,
                frameMs: 80,
                loops: 3
            }
        ];

        const applySlideText = (index) => {
            const slide = slides[index];
            if (!slide) return;
            this.setTextIfChanged(this.elements.tutorialInstruction, slide.instruction);
            this.setTextIfChanged(this.elements.tutorialEnglish, slide.english);
        };

        const clearTutorialCanvas = () => {
            const canvas = this.elements.tutorialCanvas;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
        };

        const loadSprite = (slide) => new Promise((resolve, reject) => {
            const cached = this.tutorialSpriteImages.get(slide.sprite);
            if (cached && cached.complete && cached.naturalWidth > 0) {
                resolve(cached);
                return;
            }

            const preloaded = window.__tutorialSpriteImages && window.__tutorialSpriteImages[slide.sprite];
            if (preloaded && preloaded.complete && preloaded.naturalWidth > 0) {
                this.tutorialSpriteImages.set(slide.sprite, preloaded);
                resolve(preloaded);
                return;
            }

            const image = new Image();
            image.onload = () => {
                this.tutorialSpriteImages.set(slide.sprite, image);
                resolve(image);
            };
            image.onerror = reject;
            image.src = slide.sprite;
        });

        const drawSpriteFrame = (ctx, canvas, image, slide, frameIndex) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const nextWidth = Math.max(1, Math.round(rect.width * dpr));
            const nextHeight = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
                canvas.width = nextWidth;
                canvas.height = nextHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const scale = Math.min(canvas.width / slide.frameWidth, canvas.height / slide.frameHeight);
            const drawWidth = slide.frameWidth * scale;
            const drawHeight = slide.frameHeight * scale;
            const dx = (canvas.width - drawWidth) / 2;
            const dy = 0;
            const sx = (frameIndex % slide.columns) * slide.frameWidth;
            const sy = Math.floor(frameIndex / slide.columns) * slide.frameHeight;

            ctx.drawImage(
                image,
                sx,
                sy,
                slide.frameWidth,
                slide.frameHeight,
                dx,
                dy,
                drawWidth,
                drawHeight
            );
        };

        const playTutorialSprite = async (slide) => {
            const canvas = this.elements.tutorialCanvas;
            if (!canvas) return { loops: 0, drawnFrames: 0 };

            const ctx = canvas.getContext('2d');
            if (!ctx) return { loops: 0, drawnFrames: 0 };

            const image = await loadSprite(slide);
            if (!this.tutorialActive) return { loops: 0, drawnFrames: 0 };

            return new Promise((resolve) => {
                let frameIndex = 0;
                let loopCount = 0;
                let lastFrameAt = 0;
                let drawnFrames = 0;
                const effectiveFrameMs = Math.max(slide.frameMs, TUTORIAL_MIN_FRAME_MS);

                const finish = () => {
                    this.tutorialRaf = null;
                    resolve({ loops: loopCount, drawnFrames });
                };

                const tick = (now) => {
                    if (!this.tutorialActive) {
                        finish();
                        return;
                    }

                    if (!lastFrameAt || now - lastFrameAt >= effectiveFrameMs) {
                        drawSpriteFrame(ctx, canvas, image, slide, frameIndex);
                        drawnFrames += 1;
                        lastFrameAt = now;

                        frameIndex += 1;
                        if (frameIndex >= slide.frameCount) {
                            frameIndex = 0;
                            loopCount += 1;
                            if (loopCount >= slide.loops) {
                                this.tutorialTimer = setTimeout(finish, effectiveFrameMs);
                                return;
                            }
                        }
                    }

                    this.tutorialRaf = requestAnimationFrame(tick);
                };

                this.tutorialRaf = requestAnimationFrame(tick);
            });
        };

        slides.forEach(slide => {
            loadSprite(slide).catch(() => { });
        });

        if (this.tutorialTimer) {
            clearTimeout(this.tutorialTimer);
            this.tutorialTimer = null;
        }
        if (this.tutorialRaf) {
            cancelAnimationFrame(this.tutorialRaf);
            this.tutorialRaf = null;
        }
        this.tutorialActive = true;

        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';

        const transitionTotalMs = 1400;
        const transitionMidpointMs = 130;
        const transitionTailMs = transitionTotalMs - transitionMidpointMs;

        applySlideText(0);
        clearTutorialCanvas();

        this.tutorialTimer = setTimeout(async () => {
            if (!this.tutorialActive) return;

            await playTutorialSprite(slides[0]);
            if (!this.tutorialActive) return;

            this.playScreenTransition(() => {
                applySlideText(1);
                clearTutorialCanvas();

                this.tutorialTimer = setTimeout(async () => {
                    if (!this.tutorialActive) return;

                    await playTutorialSprite(slides[1]);
                    if (!this.tutorialActive) return;

                    this.tutorialTimer = null;
                    this.tutorialActive = false;
                    if (onComplete) onComplete();
                }, transitionTailMs);
            });
        }, transitionTailMs);
    }
    showCountdown(countFrom, onComplete) {
        const overlay = this.elements.countdownOverlay;
        const valueEl = this.elements.countdownValue;
        if (!overlay || !valueEl) {
            
            if (onComplete) onComplete();
            return;
        }

        

        // IMPERATIVE: Remove 'hidden' class first because CSS has !important
        overlay.classList.remove('hidden');

        // Force layout styles inline
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'auto';
        // z-index managed by CSS/HTML now (z-75) to be under TV effects


        // Ensure parent gameplay screen is visible if it exists
        if (this.elements.gameplayScreen) {
            this.elements.gameplayScreen.classList.remove('hidden');
        }

        // Reset styles (in case it was red before)
        valueEl.style.color = '';
        valueEl.style.fontSize = ''; // Reset font size
        valueEl.classList.remove('text-red-600', 'drop-shadow-[0_0_30px_rgba(255,0,0,1)]');
        // Ensure default white text styles are present if needed, though HTML has them.

        let current = countFrom;

        // Helper to convert Arabic numerals to 漢数字 and trigger animation
        const numMap = { 0: '零', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十' };
        const toKanji = (n) => {
            const num = parseInt(String(n), 10);
            return (numMap[num] !== undefined) ? numMap[num] : String(n);
        };

        // Helper to trigger animation
        const updateText = (text) => {
            // If text is numeric, convert to 漢数字 for display
            const isNumeric = (/^\d+$/.test(String(text)));
            const display = isNumeric ? toKanji(text) : text;

            // Apply content and ensure outline hologram style (white stroke) is used
            valueEl.textContent = display;
            valueEl.classList.remove('hologram-tick');
            valueEl.classList.remove('animate-pulse'); // Remove default Pulse

            if (!valueEl.classList.contains('hologram-effect')) {
                valueEl.classList.add('hologram-effect');
            }
            // Ensure font remains consistent
            valueEl.style.fontFamily = "'Shippori Mincho', serif";
            // Clear any inline fill so CSS transparent fill + stroke applies
            valueEl.style.color = '';

            void valueEl.offsetWidth; // Force reflow
            valueEl.classList.add('hologram-tick');
        };

        updateText(String(current));

        // Play countdown start SFX immediately when countdown begins
        try {
            const audioKey = 'countdown';
            const assetPath = 'assets/sfx/Countdown02-2.mp3';
            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
            try {
                if (mgr && typeof mgr.play === 'function') {
                    mgr.play(audioKey, { volume: 0.95 });
                    
                } else if (mgr && typeof mgr.load === 'function') {
                    mgr.load({ [audioKey]: assetPath }).then(() => { try { mgr.play(audioKey, { volume: 0.95 });  } catch (e) { } }).catch(e => {  });
                } else {
                    const a = document.createElement('audio');
                    a.src = assetPath;
                    a.preload = 'auto';
                    a.volume = 0.95;
                    a.play().catch(() => { });
                }
            } catch (e) {  }
        } catch (e) {  }

        // clear any existing countdown timer
        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }

        const tick = () => {
            
            current -= 1;
            if (current <= 0) {
                // Show "状況開始"
                
                updateText('状況開始');

                // Color override for "situation start" is redundant if we use hologram-effect (transparent with stroke)
                // But we can adjust the stroke color for emphasis?
                // The CSS defines red stroke, so it matches the red requirement.
                // We just ensure font size is large.
                valueEl.style.fontSize = '4rem';
                // Remove the old red color set since hologram overrides it with transparent + stroke
                valueEl.style.color = '';
                valueEl.classList.remove('drop-shadow-[0_0_30px_rgba(255,0,0,1)]'); // This was for the old red text

                // Hold for 1 second then finish
                this._countdownTimer = setTimeout(() => {
                    
                    overlay.style.display = 'none';
                    overlay.classList.add('hidden'); // Add hidden back
                    overlay.style.pointerEvents = 'none';
                    valueEl.textContent = '';
                    // Reset styles after hide
                    valueEl.style.color = '';
                    valueEl.style.fontSize = '';
                    valueEl.classList.remove('drop-shadow-[0_0_30px_rgba(255,0,0,1)]');

                    valueEl.classList.remove('hologram-tick'); // Clean up
                    // Keep hologram-effect for next time or remove it?
                    // Better to reset clean.
                    valueEl.classList.remove('hologram-effect');

                    this._countdownTimer = null;
                    if (onComplete) onComplete();
                }, 1000);
                return;
            }
            updateText(String(current));
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

    showDefeatedNotice(onComplete) {
        const overlay = this.elements.countdownOverlay;
        const valueEl = this.elements.countdownValue;
        if (!overlay || !valueEl) {
            if (onComplete) onComplete();
            return;
        }

        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }

        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'none';

        valueEl.textContent = '撃破';
        valueEl.style.fontFamily = "'Shippori Mincho', serif";
        valueEl.style.fontSize = '4rem';
        valueEl.style.color = '';
        valueEl.style.webkitTextStroke = '2px rgba(255, 50, 50, 0.95)';
        valueEl.style.filter = 'drop-shadow(0 0 2px rgba(255, 0, 0, 0.9)) drop-shadow(0 0 8px rgba(255, 0, 0, 0.65))';
        valueEl.classList.add('hologram-effect');
        valueEl.classList.remove('hologram-tick');
        void valueEl.offsetWidth;
        valueEl.classList.add('hologram-tick');

        this._countdownTimer = setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = 'none';
            valueEl.textContent = '';
            valueEl.style.color = '';
            valueEl.style.fontSize = '';
            valueEl.style.webkitTextStroke = '';
            valueEl.style.filter = '';
            valueEl.classList.remove('hologram-tick');
            valueEl.classList.remove('hologram-effect');
            this._countdownTimer = null;
            if (onComplete) onComplete();
        }, 900);
    }

    /**
     * Show "状況完了" using the countdown overlay style but without audio.
     */
    showSituationComplete(onComplete) {
        const overlay = this.elements.countdownOverlay;
        const valueEl = this.elements.countdownValue;
        if (!overlay || !valueEl) {
            if (onComplete) onComplete();
            return;
        }

        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }

        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'none';

        valueEl.textContent = '状況完了';
        valueEl.style.fontFamily = "'Shippori Mincho', serif";
        valueEl.style.fontSize = '4rem';
        valueEl.style.color = '';
        valueEl.classList.add('hologram-effect');
        valueEl.classList.remove('hologram-tick');
        void valueEl.offsetWidth;
        valueEl.classList.add('hologram-tick');

        // 状況完了SE
        try {
            const audioKey = 'mission_complete';
            const assetPath = 'assets/sfx/決定ボタンを押す49.mp3';
            const mgr = (typeof window !== 'undefined' && window.soundManager)
                ? window.soundManager
                : (typeof soundManager !== 'undefined' ? soundManager : null);

            if (mgr && typeof mgr.play === 'function') {
                try {
                    mgr.play(audioKey, { volume: 1.0 });
                } catch (playErr) {
                    if (typeof mgr.load === 'function') {
                        mgr.load({ [audioKey]: assetPath })
                            .then(() => {
                                try { mgr.play(audioKey, { volume: 1.0 }); } catch (e) { }
                            })
                            .catch(() => {
                                const a = new Audio(assetPath);
                                a.preload = 'auto';
                                a.volume = 1.0;
                                a.play().catch(() => { });
                            });
                    }
                }
            } else {
                const a = new Audio(assetPath);
                a.preload = 'auto';
                a.volume = 1.0;
                a.play().catch(() => { });
            }
        } catch (e) { }

        this._countdownTimer = setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = 'none';
            valueEl.textContent = '';
            valueEl.style.fontSize = '';
            valueEl.classList.remove('hologram-tick');
            valueEl.classList.remove('hologram-effect');
            this._countdownTimer = null;
            if (onComplete) onComplete();
        }, 1000);
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
        wrapper._arrow = arrow;
        wrapper._label = label;
        container.appendChild(wrapper);
        return wrapper;
    }

    updateIndicatorLabel(el, enemy) {
        const label = el._label;
        if (label) {
            // 距離を表示
            this.setTextIfChanged(label, `${enemy.distance.toFixed(1)}m`);
        }

        // 矢印の色を距離に応じて緑 -> 赤 に補間
        const arrow = el._arrow;
        if (arrow && enemy && typeof enemy.distance === 'number') {
            const minDist = 0.9;
            const maxDist = 4.0;
            const dangerDist = 1.8;
            const blinkStart = 0.62;
            const dist = Math.max(minDist, Math.min(maxDist, enemy.distance));
            const t = Math.max(0, Math.min(1, (maxDist - dist) / (maxDist - minDist)));
            const hue = (1 - t) * 120; // 120=green, 0=red
            const lightness = 58 + t * 8;
            const color = `hsl(${hue}, 95%, ${lightness}%)`;
            const glow = 10 + t * 22;
            const coreGlow = 5 + t * 10;
            const isBlinking = t >= blinkStart;
            const blinkIntensity = isBlinking ? Math.max(0, (t - blinkStart) / (1 - blinkStart)) : 0;
            const whiteEdgePx = isBlinking ? 3.5 + blinkIntensity * 2.5 : 0;
            const whiteEdgeAlpha = isBlinking ? 0.95 + blinkIntensity * 0.05 : 0;
            const blinkSpeed = 0.52 - blinkIntensity * 0.32;
            this.setStyleIfChanged(arrow, 'borderBottomColor', color);
            this.setStyleIfChanged(arrow, 'filter', `drop-shadow(0 0 1px rgba(255, 255, 255, ${whiteEdgeAlpha})) drop-shadow(0 0 ${whiteEdgePx}px rgba(255, 255, 255, ${whiteEdgeAlpha})) drop-shadow(0 0 ${coreGlow}px ${color}) drop-shadow(0 0 ${glow}px ${color})`);
            this.setStyleIfChanged(el, 'zIndex', String(100 + Math.round(t * 900)));
            el.classList.toggle('danger', enemy.distance <= dangerDist);
            el.classList.toggle('blinking', isBlinking);
            el.classList.remove('critical');
            this.setStyleIfChanged(arrow, 'animationDuration', isBlinking ? `${blinkSpeed.toFixed(2)}s` : '');
            if (label) {
                this.setStyleIfChanged(label, 'color', color);
            }
        } else {
            this.setStyleIfChanged(el, 'zIndex', '100');
            el.classList.remove('danger');
            el.classList.remove('blinking');
            el.classList.remove('critical');
            this.setStyleIfChanged(arrow, 'animationDuration', '');
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

        // ベクトル計算による連続的な位置・回転制御
        // 正規化されたオフセット (-1 ~ 1 がFOV範囲、それ以上は画面外)
        const vx = yawDiff / halfHorz;
        const vy = pitchDiff / halfVert; // pitchDiff > 0 is Up

        // 画面の中心から見た方向 (ラジアン)
        // 数学的には +X=Right, +Y=Up. atan2(y, x)
        const rad = Math.atan2(vy, vx);

        // 画面端への投影
        // ベクトルの最大成分で割ることで、[-1, 1]のボックス境界上にマッピングする
        // ゼロ除算防止
        const absVx = Math.abs(vx);
        const absVy = Math.abs(vy);
        const scale = 1.0 / Math.max(absVx, absVy, 0.0001);

        // 境界上の位置 (-1 ~ 1)
        const edgeX = vx * scale;
        const edgeY = vy * scale;

        // CSS %座標への変換
        // edgeX: -1(Left) -> 1(Right) => 50 + edgeX * (50 - margin)
        // edgeY: -1(Bottom) -> 1(Top) => 50 - edgeY * (50 - margin)  (CSS Y is Down)
        // marginPct is already defined above
        xPct = 50 + edgeX * (50 - marginPct);
        yPct = 50 - edgeY * (50 - marginPct);

        // 回転 (CSS rotateは時計回り, 0deg=Up)
        // atan2(1, 0) = 90deg (Up) -> 0deg required -> 90 - 90 = 0
        // atan2(0, 1) = 0deg (Right) -> 90deg required -> 90 - 0 = 90
        rotation = 90 - (rad * 180 / Math.PI);

        this.setStyleIfChanged(el, 'left', `${xPct}%`);
        this.setStyleIfChanged(el, 'top', `${yPct}%`);
        const arrow = el._arrow;
        if (arrow) {
            // スケールを距離に応じて変化させる
            // 敵距離が近いほど t -> 1 (赤・大きく)、遠いほど t -> 0 (緑・小さめ)
            const minDist = 0.9; // EnemyManager.ENEMY_HIT_DISTANCE と整合
            const maxDist = 4.0; // 表示上の最大参照距離
            const dist = (enemy && typeof enemy.distance === 'number') ? enemy.distance : maxDist;
            const t = Math.max(0, Math.min(1, (maxDist - dist) / (maxDist - minDist)));
            const minScale = 0.9;
            const maxScale = 1.8;
            const scaleVal = minScale + t * (maxScale - minScale);

            this.setStyleIfChanged(arrow, 'transform', `translate(-50%, -50%) rotate(${rotation}deg) scale(${scaleVal})`);
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
        if (this.elements.gameplayScreen) this.elements.gameplayScreen.classList.add('hidden');

        const isSuccess = /クリア|Clear|任務完了/.test(title);
        this.useFailureTitleBackground = !isSuccess;
        // 表示前にタイトル背景をプリロードしておく（Result -> Title の遅延対策）
        try { this.preloadTitleBackgrounds(); } catch (e) { }

        // Play fluorescent crackle when showing result screens
        try {
            const audioKey = 'fluorescent_crackle';
            const assetPath = 'assets/sfx/Fluorescent_Light-Noise01-1(Crackle).mp3';
            try { if (typeof soundManager !== 'undefined') soundManager.initAudioContext(); } catch (e) { }
            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
            try {
                if (mgr && typeof mgr.play === 'function') {
                    mgr.play(audioKey, { volume: 0.55 });
                } else if (mgr && typeof mgr.load === 'function') {
                    mgr.load({ [audioKey]: assetPath }).then(() => { try { mgr.play(audioKey, { volume: 0.55 }); } catch (e) { } }).catch(e => {  });
                } else {
                    const a = document.createElement('audio');
                    a.src = assetPath;
                    a.preload = 'auto';
                    a.volume = 0.55;
                    a.play().catch(() => { });
                }
            } catch (e) {  }
        } catch (e) { }

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
        if (this.elements.missionCompletedScreen) this.elements.missionCompletedScreen.classList.add('hidden');
        if (this.elements.missionFailScreen) this.elements.missionFailScreen.classList.add('hidden');
        if (this.elements.gameplayScreen) this.elements.gameplayScreen.classList.add('hidden');
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
            // Remove utility classes if present to avoid tailwind width/fit overrides
            try { bgImg.classList.remove('w-full', 'h-full', 'object-cover'); } catch (e) { }
            const titleBackgroundSrc = this.useFailureTitleBackground
                ? this.titleHomeFailureBackground
                : this.titleHomeBackground;
            bgImg.src = titleBackgroundSrc;
            // Make UI title image fixed to viewport so it's unaffected by parent padding
            // Scale to match viewport height while preserving aspect ratio
            bgImg.style.position = 'fixed';
            bgImg.style.left = '50%';
            bgImg.style.top = '0';
            bgImg.style.height = '100vh';
            bgImg.style.width = 'auto';
            bgImg.style.maxWidth = '100vw';
            bgImg.style.transform = 'translateX(-50%)';
            bgImg.style.zIndex = '60';
            bgImg.style.pointerEvents = 'none';
            try { bgImg.style.setProperty('object-fit', 'contain', 'important'); } catch (e) { }
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
                    try { crtImg.classList.remove('w-full', 'h-full', 'object-cover'); } catch (e) { }
                    crtImg.src = titleBackgroundSrc;
                    // Ensure CRT-side image also occupies full viewport (fixed) so no parent padding shows
                    // Scale CRT-side image to match viewport height, preserve aspect ratio
                    crtImg.style.position = 'fixed';
                    crtImg.style.left = '50%';
                    crtImg.style.top = '0';
                    crtImg.style.height = '100vh';
                    crtImg.style.width = 'auto';
                    crtImg.style.maxWidth = '100vw';
                    crtImg.style.transform = 'translateX(-50%)';
                    crtImg.style.zIndex = '59';
                    crtImg.style.pointerEvents = 'none';
                    try { crtImg.style.setProperty('object-fit', 'contain', 'important'); } catch (e) { }
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
                
                crtImg = null;
            }

            // Start CRT boot; when complete, remove temporary crt image and reveal UI title
            // Play TV turn-off SFX at the moment title appears (simultaneous with boot animation)
            let tvPlayPromise = Promise.resolve();
            try {
                if (typeof soundManager !== 'undefined' && soundManager) {
                    try { soundManager.initAudioContext(); } catch (e) { }
                    try { soundManager.unlock(); } catch (e) { }

                    const audioKey = 'tv_turn_off';
                    const assetPath = 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3';

                    // If available, use playTest which resolves when playback ends
                    if (typeof soundManager.playTest === 'function') {
                        try {
                            tvPlayPromise = soundManager.playTest(audioKey, { volume: 0.9 }).catch(err => {  });
                        } catch (e) {
                            
                            tvPlayPromise = Promise.resolve();
                        }
                    } else {
                        // Fallback: attempt to play immediately or load then play, and resolve after estimated duration
                        try {
                            try {
                                soundManager.play(audioKey, { volume: 0.9 });
                            } catch (e) {
                                try {
                                    soundManager.load({ [audioKey]: assetPath }).then(() => { try { soundManager.play(audioKey, { volume: 0.9 }); } catch (e) { } }).catch(() => { });
                                } catch (e) { }
                            }
                        } catch (e) { }
                        tvPlayPromise = new Promise(resolve => setTimeout(resolve, 1200));
                    }
                }
            } catch (e) {  }

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

                // Start looped TV signal noise and reduce other sounds to half volume AFTER tv_turn_off finishes
                try {
                    tvPlayPromise.then(() => {
                        try {
                            if (!this._titleSignalStarted) {
                                this._titleSignalStarted = true;
                                const audioKey = 'tv_signal_noise';
                                const assetPath = 'assets/sfx/TV-Signal_Noise01-3(Retro).mp3';
                                try { if (typeof soundManager !== 'undefined') soundManager.initAudioContext(); } catch (e) { }

                                // Halve masterGain so other sounds become half as loud
                                try {
                                    if (typeof soundManager !== 'undefined' && typeof soundManager.masterGain === 'number') {
                                        soundManager.masterGain = soundManager.masterGain * 0.5;
                                        
                                    }
                                } catch (e) {  }

                                // Try WebAudio loop if buffer available
                                try {
                                    const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
                                    try {
                                        
                                    } catch (e) { }
                                    try { if (mgr && typeof mgr.unlock === 'function') { mgr.unlock(); } } catch (e) { }
                                    if (mgr && mgr.buffers && mgr.buffers.has && mgr.buffers.has(audioKey) && mgr.audioContext) {
                                        try {
                                            const ctx = mgr.audioContext;
                                            const src = ctx.createBufferSource();
                                            src.buffer = mgr.buffers.get(audioKey);
                                            src.loop = true;
                                            // Create a gain node that bypasses the manager.masterGain effect
                                            const loopGain = ctx.createGain();
                                            // Set loop gain to compensate for masterGain halving so loop is audible
                                            const desiredRelative = 1.0; // keep loop near original level
                                            const appliedMaster = (mgr.masterGain || 1.0);
                                            loopGain.gain.value = desiredRelative / Math.max(0.0001, appliedMaster);
                                            src.connect(loopGain);
                                            // Connect directly to destination to avoid masterGain path
                                            loopGain.connect(ctx.destination);
                                            try { src.start(0); } catch (e) { try { src.start(); } catch (e) { } }
                                            this._titleLoopSource = src;
                                            this._titleLoopGain = loopGain;
                                            
                                        } catch (e) {
                                            
                                        }
                                    } else {
                                        // HTMLAudio fallback: if manager has original audio element, clone and loop it, otherwise create a fresh element
                                        try {
                                            if (mgr && mgr.sounds && mgr.sounds.has && mgr.sounds.has(audioKey)) {
                                                const original = mgr.sounds.get(audioKey);
                                                const instance = original.cloneNode();
                                                instance.id = 'title-signal-audio';
                                                instance.loop = true;
                                                instance.preload = 'auto';
                                                instance.volume = 1.0;
                                                const p = instance.play();
                                                if (p && typeof p.then === 'function') p.catch(() => {});
                                                document.body.appendChild(instance);
                                                this._titleHtmlAudio = instance;
                                                
                                            } else {
                                                const a = document.createElement('audio');
                                                a.id = 'title-signal-audio';
                                                a.src = assetPath;
                                                a.loop = true;
                                                a.preload = 'auto';
                                                a.volume = 1.0; // play at full relative level; other sounds were halved
                                                const p = a.play();
                                                if (p && typeof p.then === 'function') p.catch(err => {  });
                                                document.body.appendChild(a);
                                                this._titleHtmlAudio = a;
                                                
                                            }
                                        } catch (e) {  }
                                    }
                                } catch (e) {  }
                            }
                        } catch (e) {  }
                    }).catch(e => {  });
                } catch (e) {  }

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
                uiImg.alt = 'Splash';
                if (splashContent) splashContent.insertBefore(uiImg, splashContent.firstChild);
                else splashEl.insertBefore(uiImg, splashEl.firstChild);
            }
            uiImg.src = 'assets/picture/Title.jpg';
            try { uiImg.classList.remove('w-full', 'h-full', 'object-cover'); } catch (e) { }
            // Scale UI-side splash image by viewport height, preserve aspect ratio
            uiImg.style.position = 'fixed';
            uiImg.style.left = '50%';
            uiImg.style.top = '0';
            uiImg.style.height = '100vh';
            uiImg.style.width = 'auto';
            uiImg.style.maxWidth = '100vw';
            uiImg.style.transform = 'translateX(-50%)';
            try { uiImg.style.setProperty('object-fit', 'contain', 'important'); } catch (e) { }
            uiImg.style.opacity = '0';
            uiImg.style.transition = 'opacity 0.4s ease-out';
            uiImg.style.zIndex = '50';
            uiImg.style.pointerEvents = 'none';
        } else {
            // Ensure original image is displayed height-first and centered
            try {
                // Remove utility classes that force width/height/object-fit before applying inline styles
                try { existingImg.classList.remove('w-full', 'h-full', 'object-cover'); } catch (e) { }
                existingImg.style.position = 'fixed';
                existingImg.style.left = '50%';
                existingImg.style.top = '0';
                existingImg.style.height = '100vh';
                existingImg.style.width = 'auto';
                existingImg.style.maxWidth = '100vw';
                existingImg.style.transform = 'translateX(-50%)';
                try { existingImg.style.setProperty('object-fit', 'contain', 'important'); } catch (e) { }
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
                try { crtImg.classList.remove('w-full', 'h-full', 'object-cover'); } catch (e) { }
                crtImg.src = 'assets/picture/Title.jpg';
                // CRT-side splash image: height-first, preserve aspect ratio, centered
                crtImg.style.position = 'fixed';
                crtImg.style.left = '50%';
                crtImg.style.top = '0';
                crtImg.style.height = '100vh';
                crtImg.style.width = 'auto';
                crtImg.style.maxWidth = '100vw';
                crtImg.style.transform = 'translateX(-50%)';
                crtImg.style.zIndex = '59';
                crtImg.style.pointerEvents = 'none';
                try { crtImg.style.setProperty('object-fit', 'contain', 'important'); } catch (e) { }
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
                if (startBtn) {
                    // Ensure start button is positioned above background and clickable
                    startBtn.style.position = 'fixed';
                    // Use pixel-based sizing computed from viewport to avoid percentage resolving to 0
                    try {
                        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
                        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
                        const leftPx = Math.floor(vw * 0.04);
                        const bottomPx = Math.floor(vh * 0.04);
                        const widthPx = Math.min(250, Math.max(64, Math.floor(vw * 0.35)));
                        const heightPx = Math.min(100, Math.max(40, Math.floor(vh * 0.10)));
                        startBtn.style.left = leftPx + 'px';
                        startBtn.style.right = 'auto';
                        startBtn.style.bottom = bottomPx + 'px';
                        startBtn.style.width = widthPx + 'px';
                        startBtn.style.height = heightPx + 'px';
                    } catch (e) {
                        // Fallback to safe defaults
                        startBtn.style.left = '4%';
                        startBtn.style.bottom = '4%';
                        startBtn.style.width = '250px';
                        startBtn.style.height = '60px';
                    }
                    startBtn.style.zIndex = '95';
                    startBtn.style.pointerEvents = 'auto';
                }
            } catch (e) { }
        }, revealDelayMs);

        // Store timer so hideSplashScreen can cancel pending reveal
        try { if (splashEl) splashEl._revealTimer = revealTimer; } catch (e) { }

        // Try to play TV turn-off SFX when splash is revealed (covers initial load->title transition)
        try {
            const audioKey = 'tv_turn_off';
            const assetPath = 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3';
            try { if (typeof soundManager !== 'undefined' && soundManager) { try { soundManager.unlock(); } catch (e) { } } } catch (e) { }

            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);

            // Build a promise that resolves when tv_turn_off playback finishes (or shortly after)
            let tvPlayPromise = Promise.resolve();
            try {
                if (mgr && typeof mgr.playTest === 'function') {
                    tvPlayPromise = mgr.playTest(audioKey, { volume: 0.9 }).catch(err => {  });
                } else {
                    // fallback: attempt to play then resolve after short delay
                    try {
                        if (mgr && typeof mgr.play === 'function') {
                            mgr.play(audioKey, { volume: 0.9 });
                        } else if (mgr && mgr.load && typeof mgr.load === 'function') {
                            mgr.load({ [audioKey]: assetPath }).then(() => { try { if (mgr.play) mgr.play(audioKey, { volume: 0.9 }); } catch (e) { } }).catch(() => { });
                        }
                    } catch (e) { }
                    tvPlayPromise = new Promise(resolve => setTimeout(resolve, 1200));
                }
            } catch (e) {
                tvPlayPromise = Promise.resolve();
            }

            // After tv turn-off ends, attempt to start title signal loop (use same helper as title screen)
            this._ensureTitleSignalStarted(tvPlayPromise);
        } catch (e) {  }

        this.playBootSequence(() => {
            // If revealTimer still pending, clear it and ensure image is shown
            try { if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; } } catch (e) { }
            try { if (splashEl && splashEl._revealTimer) { clearTimeout(splashEl._revealTimer); delete splashEl._revealTimer; } } catch (e) { }

            try {
                const imgToReveal = existingImg || uiImg;
                if (imgToReveal) imgToReveal.style.opacity = '1';
                splashEl.classList.add('active');
                splashEl.style.display = 'block';
                splashEl.style.pointerEvents = 'auto';
                const startBtn = document.getElementById('startButton');
                if (startBtn) {
                    try {
                        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
                        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
                        const leftPx = Math.floor(vw * 0.04);
                        const bottomPx = Math.floor(vh * 0.04);
                        const widthPx = Math.min(250, Math.max(64, Math.floor(vw * 0.35)));
                        const heightPx = Math.min(100, Math.max(40, Math.floor(vh * 0.10)));
                        startBtn.style.position = 'fixed';
                        startBtn.style.left = leftPx + 'px';
                        startBtn.style.right = 'auto';
                        startBtn.style.bottom = bottomPx + 'px';
                        startBtn.style.width = widthPx + 'px';
                        startBtn.style.height = heightPx + 'px';
                        startBtn.style.zIndex = '95';
                        startBtn.style.pointerEvents = 'auto';
                        // Reparent to body so it's above other containers and not affected by parent transforms
                        try {
                            if (!startBtn._origParent) {
                                startBtn._origParent = startBtn.parentNode;
                                startBtn._origNext = startBtn.nextSibling;
                                document.body.appendChild(startBtn);
                            }
                        } catch (e) { }
                    } catch (e) {
                        startBtn.style.left = '4%';
                        startBtn.style.right = '';
                        startBtn.style.bottom = '4%';
                        startBtn.style.zIndex = '95';
                        startBtn.style.pointerEvents = 'auto';
                    }
                }
            } catch (e) { }

            // Remove temporary CRT-side image
            try { if (crtImg && crtImg.parentElement) crtImg.parentElement.removeChild(crtImg); } catch (e) { }
        }, false);
    }

    hideSplashScreen() {
        const splashEl = document.getElementById('splashScreen');
        // Cancel any pending reveal timer
        try { if (splashEl && splashEl._revealTimer) { clearTimeout(splashEl._revealTimer); delete splashEl._revealTimer; } } catch (e) { }
        const uiImg = document.getElementById('splashUiImg');
        // Remove any UI-side splash image created earlier
        try {
            if (uiImg && uiImg.parentElement) uiImg.parentElement.removeChild(uiImg);
        } catch (e) { }

        // Also remove any temporary CRT-side or title images that may have been inserted
        const crtTempIds = ['splashCrtImg', 'title02CrtImg', 'title02Img', 'title02Img', 'title02CrtImg'];
        crtTempIds.forEach(id => {
            try {
                const el = document.getElementById(id);
                if (el && el.parentElement) el.parentElement.removeChild(el);
            } catch (e) { }
        });

        // Remove elements by class that were used for UI/title/splash backgrounds
        try {
            const classSelectors = ['title-02-bg', 'image-width-based', 'crt-img-animated'];
            classSelectors.forEach(cls => {
                const nodes = Array.from(document.getElementsByClassName(cls));
                nodes.forEach(n => { try { if (n && n.parentElement) n.parentElement.removeChild(n); } catch (e) { } });
            });
        } catch (e) { }

        // Reset any original splashContent <img> inline styles (avoid leaving fixed-position image)
        try {
            const splashContent = document.getElementById('splashContent');
            if (splashContent) {
                const imgs = splashContent.querySelectorAll('img');
                imgs.forEach(img => {
                    try {
                        img.style.position = '';
                        img.style.left = '';
                        img.style.top = '';
                        img.style.width = '';
                        img.style.height = '';
                        img.style.maxWidth = '';
                        img.style.transform = '';
                        img.style.objectFit = '';
                        img.style.zIndex = '';
                        img.style.pointerEvents = '';
                        img.style.opacity = '';
                        img.style.transition = '';
                    } catch (e) { }
                });
            }
        } catch (e) { }

        if (splashEl) {
            splashEl.classList.remove('active');
            splashEl.classList.add('hidden');
            try { splashEl.style.display = 'none'; } catch (e) { }
            // restore if reparented
            try {
                if (splashEl._origParent) {
                    if (splashEl._origNext) splashEl._origParent.insertBefore(splashEl, splashEl._origNext);
                    else splashEl._origParent.appendChild(splashEl);
                    delete splashEl._origParent; delete splashEl._origNext;
                }
            } catch (e) { }
        }

        // Restore startButton to original parent if we reparented it earlier
        try {
            const startBtn = document.getElementById('startButton');
            if (startBtn && startBtn._origParent) {
                if (startBtn._origNext) startBtn._origParent.insertBefore(startBtn, startBtn._origNext);
                else startBtn._origParent.appendChild(startBtn);
                delete startBtn._origParent;
                delete startBtn._origNext;
                // clear inline styles we set
                startBtn.style.position = '';
                startBtn.style.left = '';
                startBtn.style.right = '';
                startBtn.style.bottom = '';
                startBtn.style.width = '';
                startBtn.style.height = '';
                startBtn.style.zIndex = '';
                startBtn.style.pointerEvents = '';
            }
        } catch (e) { }

        // Ensure global TV overlay isn't left in an active visual state
        try {
            const globalTv = document.getElementById('global-tv-effects');
            if (globalTv) {
                globalTv.classList.remove('tv-effect-on');
            }
        } catch (e) { }
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

        // Attempt to play TV turn sound immediately when boot sequence starts.
        try {
            const audioKey = 'tv_turn_off';
            const assetPath = 'assets/sfx/TV-Turn_Off01-2(Reverb).mp3';
            try { if (typeof soundManager !== 'undefined') { soundManager.initAudioContext(); soundManager.unlock(); } } catch (e) { }

            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
            const playViaMgr = () => {
                try {
                    if (mgr && typeof mgr.play === 'function') {
                        mgr.play(audioKey, { volume: 0.9 });
                        
                        return true;
                    }
                } catch (e) {  }
                return false;
            };

            if (!playViaMgr()) {
                try {
                    const loader = (mgr && typeof mgr.load === 'function') ? mgr : (typeof soundManager !== 'undefined' ? soundManager : null);
                    if (loader && typeof loader.load === 'function') {
                        loader.load({ [audioKey]: assetPath }).then(() => { try { playViaMgr(); } catch (e) { } }).catch(e => {  });
                    }
                } catch (e) {  }

                // HTMLAudio fallback in case WebAudio is blocked
                setTimeout(() => {
                    try {
                        const a = document.createElement('audio');
                        a.src = assetPath;
                        a.preload = 'auto';
                        a.volume = 0.9;
                        const p = a.play();
                        if (p && typeof p.then === 'function') {
                            p.catch(() => {});
                        }
                    } catch (e) {  }
                }, 300);
            }
        } catch (e) {  }

        // Control camera / canvas visibility according to caller intent
        if (!showCamera) {
            if (videoEl) videoEl.style.display = 'none';
            if (canvasEl) canvasEl.style.display = 'none';
        } else {
            // Ensure camera/canvas are visible if starting game
            if (videoEl) {
                videoEl.classList.remove('calibration-video-hidden');
                videoEl.style.display = '';
                videoEl.style.opacity = ''; // Reset opacity
            }
            if (canvasEl) {
                canvasEl.classList.remove('calibration-canvas');
                canvasEl.style.display = '';
                canvasEl.style.opacity = ''; // Reset opacity
                canvasEl.classList.remove('hidden');
            }
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

        // ★ HUDの出現をCRT点灯と同期させる (少し遅延させて自然に)
        if (showCamera) {
            setTimeout(() => {
                if (videoEl) {
                    videoEl.classList.remove('calibration-video-hidden');
                    videoEl.style.display = '';
                    videoEl.style.opacity = '';
                }
                if (canvasEl) {
                    canvasEl.classList.remove('calibration-canvas');
                    canvasEl.style.display = '';
                    canvasEl.style.opacity = '';
                    canvasEl.classList.remove('hidden');
                }
                // Restore UI container (HUD) visibility immediately
                try {
                    if (this.elements && this.elements.uiContainer) {
                        this.elements.uiContainer.style.opacity = '';
                        this.elements.uiContainer.style.display = '';
                        this.elements.uiContainer.classList.remove('hidden');
                    }
                } catch (e) { }
            }, 100); // 100ms delay for effect
        }

        // Remove overlay after animation finishes (slightly after keyframe)
        if (crtLineEl) {
            setTimeout(() => {
                try { if (crtLineEl && crtLineEl.parentElement) crtLineEl.parentElement.removeChild(crtLineEl); } catch (e) { }
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
                // Ensure camera/canvas are visible if starting game (redundant safety)
                if (showCamera) {
                    if (videoEl) {
                        videoEl.classList.remove('calibration-video-hidden');
                        videoEl.style.display = '';
                        videoEl.style.opacity = '';
                    }
                    if (canvasEl) {
                        canvasEl.classList.remove('calibration-canvas');
                        canvasEl.style.display = '';
                        canvasEl.style.opacity = '';
                        canvasEl.classList.remove('hidden');
                    }
                }
                if (onComplete) onComplete();
            }, 2000);
        } else {
            // Hologramなしの場合でも完了コールバックは呼ぶ
            setTimeout(() => {
                if (onComplete) onComplete();
            }, 2000);
        }
    }

    /**
     * Ensure the title TV-signal loop is started after the provided tvPlayPromise resolves.
     * Safe to call multiple times; will only start once.
     */
    _ensureTitleSignalStarted(tvPlayPromise) {
        try {
            if (!tvPlayPromise || typeof tvPlayPromise.then !== 'function') tvPlayPromise = Promise.resolve();
            tvPlayPromise.then(() => {
                try {
                    if (this._titleSignalStarted) return;
                    this._titleSignalStarted = true;
                    const audioKey = 'tv_signal_noise';
                    const assetPath = 'assets/sfx/TV-Signal_Noise01-3(Retro).mp3';
                    try { if (typeof soundManager !== 'undefined') soundManager.initAudioContext(); } catch (e) { }

                    // Halve masterGain so other sounds become half as loud
                    try {
                        if (typeof soundManager !== 'undefined' && typeof soundManager.masterGain === 'number') {
                            soundManager.masterGain = soundManager.masterGain * 0.5;
                            
                        }
                    } catch (e) {  }

                    // Try WebAudio loop if buffer available
                    try {
                        const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
                        try {
                            
                        } catch (e) { }
                        try { if (mgr && typeof mgr.unlock === 'function') { mgr.unlock(); } } catch (e) { }
                        if (mgr && mgr.buffers && mgr.buffers.has && mgr.buffers.has(audioKey) && mgr.audioContext) {
                            try {
                                const ctx = mgr.audioContext;
                                const src = ctx.createBufferSource();
                                src.buffer = mgr.buffers.get(audioKey);
                                src.loop = true;
                                const loopGain = ctx.createGain();
                                const desiredRelative = 1.0;
                                const appliedMaster = (mgr.masterGain || 1.0);
                                loopGain.gain.value = desiredRelative / Math.max(0.0001, appliedMaster);
                                src.connect(loopGain);
                                loopGain.connect(ctx.destination);
                                try { src.start(0); } catch (e) { try { src.start(); } catch (e) { } }
                                this._titleLoopSource = src;
                                this._titleLoopGain = loopGain;
                                
                            } catch (e) {
                                
                            }
                        } else {
                            try {
                                if (mgr && mgr.sounds && mgr.sounds.has && mgr.sounds.has(audioKey)) {
                                    const original = mgr.sounds.get(audioKey);
                                    const instance = original.cloneNode();
                                    instance.id = 'title-signal-audio';
                                    instance.loop = true;
                                    instance.preload = 'auto';
                                    instance.volume = 1.0;
                                    const p = instance.play();
                                    if (p && typeof p.then === 'function') p.catch(() => {});
                                    document.body.appendChild(instance);
                                    this._titleHtmlAudio = instance;
                                    
                                } else {
                                    const a = document.createElement('audio');
                                    a.id = 'title-signal-audio';
                                    a.src = assetPath;
                                    a.loop = true;
                                    a.preload = 'auto';
                                    a.volume = 1.0;
                                    const p = a.play();
                                    if (p && typeof p.then === 'function') p.catch(err => {  });
                                    document.body.appendChild(a);
                                    this._titleHtmlAudio = a;
                                    
                                }
                            } catch (e) {  }
                        }
                    } catch (e) {  }
                } catch (e) {  }
            }).catch(e => {  });
        } catch (e) {  }
    }

    /**
     * Public API: start title signal immediately (runs inside user gesture if called there).
     */
    startTitleSignalNow() {
        try {
            this._ensureTitleSignalStarted(Promise.resolve());
        } catch (e) {  }
    }

    /**
     * TV消灯演出（ゲーム終了時）
     * 縦に圧縮→白い線→消失
     */
    playTvTurnOffAnimation(onComplete) {
        // Target elements visible during gameplay
        const targets = [
            document.getElementById('cameraVideo'),
            document.getElementById('gameCanvas'),
            document.getElementById('uiContainer')
        ];

        // Play TV-turn-off 2 SFX when starting the turn-off animation
        try {
            const audioKey = 'tv_turn_off_2';
            const assetPath = 'assets/sfx/TV-Turn_Off02-3(Reverb).mp3';
            try { if (typeof soundManager !== 'undefined') { soundManager.initAudioContext(); } } catch (e) { }

            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
            const playViaMgr = () => {
                try {
                    if (mgr && typeof mgr.play === 'function') {
                        mgr.play(audioKey, { volume: 0.95 });
                        
                        return true;
                    }
                } catch (e) {  }
                return false;
            };

            if (!playViaMgr()) {
                try {
                    const loader = (mgr && typeof mgr.load === 'function') ? mgr : (typeof soundManager !== 'undefined' ? soundManager : null);
                    if (loader && typeof loader.load === 'function') {
                        loader.load({ [audioKey]: assetPath }).then(() => { try { playViaMgr(); } catch (e) { } }).catch(e => {  });
                    }
                } catch (e) {  }

                // HTMLAudio fallback
                setTimeout(() => {
                    try {
                        const a = document.createElement('audio');
                        a.src = assetPath;
                        a.preload = 'auto';
                        a.volume = 0.95;
                        const p = a.play();
                        if (p && typeof p.then === 'function') {
                            p.catch(() => {});
                        }
                    } catch (e) {  }
                }, 200);
            }
        } catch (e) {  }

        // Apply animation class
        targets.forEach(el => {
            if (el) {
                el.classList.remove('tv-turn-off-active');
                void el.offsetWidth; // reflow
                el.classList.add('tv-turn-off-active');
            }
        });

        // Wait for animation to finish (0.5s defined in CSS)
        setTimeout(() => {
            targets.forEach(el => {
                if (el) {
                    el.classList.remove('tv-turn-off-active');
                    // Ensure they stay hidden until next state
                    // Note: showResult logic will likely handle classList 'hidden' for UI,
                    // but we force opacity/display to ensure screen stays black.
                    el.style.opacity = '0';
                }
            });
            if (onComplete) onComplete();
        }, 550);
    }

    /**
     * スクリーン遷移エフェクト再生
     * onMidpoint: 画面切り替えのタイミング（完全に暗転/ブラーがかかった瞬間）に呼ばれるコールバック
     */
    playScreenTransition(onMidpoint) {
        const overlay = document.getElementById('transitionOverlay');
        if (!overlay) {
            if (onMidpoint) onMidpoint();
            return;
        }

        // Play a short fluorescent crackle when a screen transition starts
        try {
            const audioKey = 'fluorescent_crackle';
            const assetPath = 'assets/sfx/Fluorescent_Light-Noise01-1(Crackle).mp3';
            try { if (typeof soundManager !== 'undefined') soundManager.initAudioContext(); } catch (e) { }
            const mgr = (typeof window !== 'undefined' && window.soundManager) ? window.soundManager : (typeof soundManager !== 'undefined' ? soundManager : null);
            try {
                const hasBuffer = mgr && mgr.buffers && typeof mgr.buffers.has === 'function' && mgr.buffers.has(audioKey);
                const hasHtmlAudio = mgr && mgr.sounds && typeof mgr.sounds.has === 'function' && mgr.sounds.has(audioKey);

                if (mgr && typeof mgr.unlock === 'function') {
                    try { mgr.unlock(); } catch (e) { }
                }

                if (mgr && mgr.audioContext && !hasBuffer && typeof mgr.load === 'function') {
                    mgr.load({ [audioKey]: assetPath }).then(() => { try { mgr.play(audioKey, { volume: 0.55 }); } catch (e) { } }).catch(e => {  });
                } else if (mgr && typeof mgr.play === 'function' && (hasBuffer || hasHtmlAudio)) {
                    mgr.play(audioKey, { volume: 0.55 });
                    
                } else if (mgr && typeof mgr.load === 'function') {
                    mgr.load({ [audioKey]: assetPath }).then(() => { try { mgr.play(audioKey, { volume: 0.55 }); } catch (e) { } }).catch(e => {  });
                } else {
                    // HTMLAudio fallback
                    const a = document.createElement('audio');
                    a.src = assetPath;
                    a.preload = 'auto';
                    a.volume = 0.55;
                    a.play().catch(() => { });
                }
            } catch (e) {  }
        } catch (e) { }

        // 既存のクラスをリセット
        overlay.classList.remove('transition-active');
        void overlay.offsetWidth; // リフロー
        overlay.classList.add('transition-active');

        // 中間地点（Phase 1: 10% = 130ms）でコールバック実行
        setTimeout(() => {
            if (onMidpoint) onMidpoint();
        }, 130); // 10%時点 (Swap)

        // アニメーション終了後にクラス削除
        setTimeout(() => {
            overlay.classList.remove('transition-active');
        }, 1400); // 1.3s + マージン
    }
}
