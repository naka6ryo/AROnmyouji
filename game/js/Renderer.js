/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

import * as THREE from 'three';
import { Hitodama } from './Hitodama.js';
import { SwingTracer } from './SwingTracer.js';
import { SlashProjectileManager } from './SlashProjectileManager.js';

const MOBILE_MAX_PIXEL_RATIO = 1.5;
const DEFAULT_CAMERA_FOV_DEG = 60;
const DEG2RAD = Math.PI / 180;

export class Renderer {
    constructor(canvasId, debugOverlay = null) {
        this.canvas = document.getElementById(canvasId);
        this.debugOverlay = debugOverlay; // デバッグUIへのログ出力

        // Three.js セットアップ
        this.scene = new THREE.Scene();
        // カメラ映像を Three.js の背景テクスチャとして扱う
        this.videoElement = document.getElementById('cameraVideo');
        if (this.videoElement) {
            try {
                this.videoTexture = new THREE.VideoTexture(this.videoElement);
                this.videoTexture.minFilter = THREE.LinearFilter;
                this.videoTexture.magFilter = THREE.LinearFilter;
            } catch (e) {
                console.warn('[Renderer] VideoTexture の作成に失敗:', e);
            }
        }
        this.camera = new THREE.PerspectiveCamera(
            DEFAULT_CAMERA_FOV_DEG, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.scene.camera = this.camera;

        // 手を伸ばして端末を持つ前提で、回転中心とカメラ位置を分離
        // pivotを身体側に置き、カメラを原点に配置
        this.cameraPivot = new THREE.Object3D();
        this.scene.add(this.cameraPivot);
        this.cameraPivot.add(this.camera);
        this.camera.position.set(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true, // 背景透過
            antialias: true,
            premultipliedAlpha: false
        });
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
        this.maxPixelRatio = isMobile ? MOBILE_MAX_PIXEL_RATIO : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.autoClear = false;
        this._lastCssWidth = 0;
        this._lastCssHeight = 0;
        this._lastPixelRatio = 0;
        this._lastVideoWidth = 0;
        this._lastVideoHeight = 0;

        this._axisZ = new THREE.Vector3(0, 0, 1);
        this._deviceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._cameraFrameQuaternion = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
        this._screenTransformQuaternion = new THREE.Quaternion();
        this._qFinal = new THREE.Quaternion();
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._up = new THREE.Vector3();
        this._projectionScratch = new THREE.Vector3();
        this._pivotPositionScratch = new THREE.Vector3();
        this._cameraPositionScratch = new THREE.Vector3();

        // 端末姿勢（視点制御用）
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0, screenOrientation: 0 };
        this.viewDirection = { x: 0, y: 0, z: -1 };

        // 敵のメッシュ管理
        this.enemyObjects = new Map(); // enemyId -> Hitodama instance

        // コールバック
        this.onSlashHitEnemy = null; // 斬撃が敵に当たった時
        this.onCalibrationTargetHit = null;
        this.calibrationMode = false;
        this.calibrationStageGroup = null;
        this.calibrationTarget = {
            id: 'calibration-target',
            azim: 0,
            elev: 0,
            distance: 3
        };

        // --- Refactored Modules ---

        // 術式段階の軌跡表示
        this.swingTracer = new SwingTracer(this.scene, this.camera);

        // 斬撃飛翔体の管理
        // cameraPivotのワールド位置を取得する関数を渡す
        this.slashProjectileManager = new SlashProjectileManager(
            this.scene,
            this.camera,
            () => this.getPivotWorldPosition(),
            this.debugOverlay
        );

        // ライト
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        // リサイズ対応
        this._resizeHandler = this.onResize.bind(this);
        this._orientationChangeHandler = this.onScreenOrientationChanged.bind(this);
        this._videoMetadataHandler = this.onVideoMetadataLoaded.bind(this);
        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('orientationchange', this._orientationChangeHandler);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._resizeHandler);
        }
        if (window.screen && window.screen.orientation && typeof window.screen.orientation.addEventListener === 'function') {
            window.screen.orientation.addEventListener('change', this._orientationChangeHandler);
        }
        if (this.videoElement) {
            this.videoElement.addEventListener('loadedmetadata', this._videoMetadataHandler);
            this.videoElement.addEventListener('resize', this._videoMetadataHandler);
        }

        // 初期クリア (前のフレームの残骸を防止)
        this.updateRendererSize();
        this.renderer.clear();

        console.log('[Renderer] 初期化完了');
    }

    /**
     * 端末姿勢を更新（DeviceOrientationEvent）
     */
    updateDeviceOrientation(event) {
        this.deviceOrientation = {
            alpha: event.alpha || 0,  // Z軸回転
            beta: event.beta || 0,    // X軸回転
            gamma: event.gamma || 0,  // Y軸回転
            screenOrientation: this.getScreenOrientationDegrees()
        };

        // カメラの向きを更新
        this.updateCameraRotation();
    }

    /**
     * 視線方向ベクトルを計算
     */
    calculateViewDirection() {
        const forward = this.getCameraForward();
        return { x: forward.x, y: forward.y, z: forward.z };
    }

    /**
     * カメラの回転を更新
     */
    updateCameraRotation() {
        const { alpha, beta, gamma, screenOrientation } = this.deviceOrientation;

        // WebXR-like 3DoF path based on three.js DeviceOrientationControls:
        // device attitude -> camera optical frame -> current screen orientation.
        this._deviceEuler.set(beta * DEG2RAD, alpha * DEG2RAD, -gamma * DEG2RAD, 'YXZ');

        const qFinal = this._qFinal;
        qFinal.setFromEuler(this._deviceEuler);
        qFinal.multiply(this._cameraFrameQuaternion);
        qFinal.multiply(
            this._screenTransformQuaternion.setFromAxisAngle(
                this._axisZ,
                -(screenOrientation || 0) * DEG2RAD
            )
        );

        this.cameraPivot.quaternion.copy(qFinal);

        // 実際のワールド前方を再取得
        const forward = this.getCameraForward();
        this.viewDirection = { x: forward.x, y: forward.y, z: forward.z };
    }

    /**
     * 敵を追加
     */
    addEnemy(enemy) {
        const hitodama = new Hitodama(this.scene);
        this.updateEnemyPosition(hitodama, enemy);
        this.enemyObjects.set(enemy.id, hitodama);
        console.log(`[Renderer] 敵(人魂)追加: id=${enemy.id}`);
    }

    /**
     * 敵の位置を更新
     */
    updateEnemyPosition(hitodama, enemy) {
        const azimRad = enemy.azim * Math.PI / 180;
        const elevRad = enemy.elev * Math.PI / 180;
        const r = enemy.distance;

        hitodama.pos.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
    }

    /**
     * 敵を削除
     */
    removeEnemy(enemyId, options = {}) {
        const hitodama = this.enemyObjects.get(enemyId);
        if (hitodama) {
            if (hitodama.isPurifying || hitodama.isDead) {
                hitodama.dispose();
                this.enemyObjects.delete(enemyId);
                console.log(`[Renderer] 敵(人魂)削除: id=${enemyId}`);
            } else if (options.playerDamage && typeof hitodama.explode === 'function') {
                hitodama.onExploded = () => {
                    hitodama.dispose();
                    this.enemyObjects.delete(enemyId);
                    console.log(`[Renderer] 敵(人魂)爆発完了・削除: id=${enemyId}`);
                };
                try {
                    if (!this.scene.userData) this.scene.userData = {};
                    if (!this.scene.userData.cameraPosition) {
                        this.scene.userData.cameraPosition = new THREE.Vector3();
                    }
                    this.camera.getWorldPosition(this.scene.userData.cameraPosition);
                } catch (e) { }
                hitodama.explode({ toCameraBias: true });
                console.log(`[Renderer] 敵(人魂)爆発開始 (playerDamage): id=${enemyId}`);
            } else if (typeof hitodama.purify === 'function') {
                hitodama.onPurified = () => {
                    hitodama.dispose();
                    this.enemyObjects.delete(enemyId);
                    console.log(`[Renderer] 敵(人魂)浄化完了・削除: id=${enemyId}`);
                };
                hitodama.purify();
                console.log(`[Renderer] 敵(人魂)浄化開始: id=${enemyId}`);
            } else {
                hitodama.dispose();
                this.enemyObjects.delete(enemyId);
                console.log(`[Renderer] 敵(人魂)削除: id=${enemyId}`);
            }
        }
    }


    /**
     * 全敵の位置を更新
     */
    updateEnemies(enemies) {
        for (const enemy of enemies) {
            const hitodama = this.enemyObjects.get(enemy.id);
            if (hitodama) {
                this.updateEnemyPosition(hitodama, enemy);
            }
        }
    }

    /**
     * 術式段階の軌跡を表示開始
     */
    startSwingTracer() {
        this.swingTracer.start();
    }

    /**
     * 術式段階の軌跡を更新
     */
    updateSwingTracer(trajectory) {
        this.swingTracer.update(trajectory);
    }

    /**
     * 術式段階の軌跡表示を終了
     */
    endSwingTracer() {
        this.swingTracer.end();
    }

    /**
     * 円弧飛翔体を追加
     */
    addSlashArcProjectile(startPyr, endPyr, intensity) {
        this.slashProjectileManager.addProjectile(startPyr, endPyr, intensity);
    }

    addCalibrationSlashProjectile(startPyr, endPyr, intensity) {
        this.slashProjectileManager.addProjectile(startPyr, endPyr, intensity, {
            direction: { x: 0, y: 0, z: -1 }
        });
    }

    setCalibrationMode(active) {
        const next = !!active;
        if (this.calibrationMode === next) return;
        this.calibrationMode = next;

        if (next) {
            this.showCalibrationStage();
        } else {
            this.hideCalibrationStage();
        }
    }

    showCalibrationStage() {
        if (!this.calibrationStageGroup) {
            this.calibrationStageGroup = this.createCalibrationStage();
            this.scene.add(this.calibrationStageGroup);
        }

        this.calibrationStageGroup.visible = true;
        this.renderer.setClearColor(0xffffff, 1);

        if (this.canvas) {
            this.canvas.classList.remove('hidden');
            this.canvas.classList.add('calibration-canvas');
            this.canvas.style.display = '';
            this.canvas.style.opacity = '1';
        }

        const crtDisplay = document.getElementById('crt-main-display');
        if (crtDisplay) {
            crtDisplay.classList.remove('hidden');
            crtDisplay.classList.remove('opacity-0');
            crtDisplay.style.display = '';
            crtDisplay.style.opacity = '1';
        }

        if (this.videoElement) {
            this.videoElement.classList.add('calibration-video-hidden');
            this.videoElement.style.display = 'none';
        }

        this.updateRendererSize();
    }

    hideCalibrationStage() {
        if (this.calibrationStageGroup) {
            this.calibrationStageGroup.visible = false;
        }

        this.slashProjectileManager.reset();
        this.renderer.setClearColor(0x000000, 0);

        if (this.canvas) {
            this.canvas.classList.remove('calibration-canvas');
            this.canvas.style.opacity = '';
        }

        if (this.videoElement) {
            this.videoElement.classList.remove('calibration-video-hidden');
            this.videoElement.style.display = '';
        }

        this.renderer.clear();
    }

    updateCalibrationTarget() {
        if (!this.calibrationStageGroup) return;
        const target = this.calibrationStageGroup.getObjectByName('calibrationTarget');
        if (!target) return;

        const azimRad = this.calibrationTarget.azim * DEG2RAD;
        const elevRad = this.calibrationTarget.elev * DEG2RAD;
        const r = this.calibrationTarget.distance;

        target.position.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
    }

    createCalibrationStage() {
        const group = new THREE.Group();
        group.name = 'calibrationStage';

        const floorGrid = new THREE.GridHelper(10, 20, 0xb8b8b8, 0xd9d9d9);
        floorGrid.position.set(0, -1.15, -3.2);
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = 0.65;
        group.add(floorGrid);

        const backGrid = new THREE.GridHelper(8, 16, 0xc4c4c4, 0xe0e0e0);
        backGrid.rotation.x = Math.PI / 2;
        backGrid.position.set(0, 1.0, -4.25);
        backGrid.material.transparent = true;
        backGrid.material.opacity = 0.5;
        group.add(backGrid);

        const axisMaterial = new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55 });
        const axisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-4, 0, -3),
            new THREE.Vector3(4, 0, -3),
            new THREE.Vector3(0, -1.8, -3),
            new THREE.Vector3(0, 1.8, -3)
        ]);
        group.add(new THREE.LineSegments(axisGeometry, axisMaterial));

        const target = new THREE.Group();
        target.name = 'calibrationTarget';
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff1f1f,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
        });

        [0.36, 0.22, 0.08].forEach(radius => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 12, 72), ringMaterial);
            target.add(ring);
        });

        const center = new THREE.Mesh(
            new THREE.CircleGeometry(0.035, 32),
            new THREE.MeshBasicMaterial({ color: 0xff1f1f, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        center.position.z = 0.002;
        target.add(center);

        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 48),
            new THREE.MeshBasicMaterial({ color: 0xff1f1f, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
        );
        glow.position.z = -0.004;
        target.add(glow);

        const azimRad = this.calibrationTarget.azim * DEG2RAD;
        const elevRad = this.calibrationTarget.elev * DEG2RAD;
        const r = this.calibrationTarget.distance;
        target.position.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
        group.add(target);
        return group;
    }

    /**
     * 描画（敵情報を受け取って衝突判定）
     */
    render(deltaTime, enemies) {
        // 人魂のアニメーション更新
        const dtSec = deltaTime / 1000;
        for (const hitodama of this.enemyObjects.values()) {
            hitodama.update(dtSec);
        }

        // 飛翔体更新
        if (this.calibrationMode) {
            this.slashProjectileManager.update(deltaTime, [this.calibrationTarget], (data) => {
                if (this.onCalibrationTargetHit) this.onCalibrationTargetHit(data);
            });
        } else {
            this.slashProjectileManager.update(deltaTime, enemies, this.onSlashHitEnemy);
        }

        // シェーダー軌跡の時間更新
        this.swingTracer.updateTime();

        // 簡易レンダリング
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * リサイズ処理
     */
    onResize() {
        this.updateRendererSize();
    }

    onScreenOrientationChanged() {
        this.deviceOrientation.screenOrientation = this.getScreenOrientationDegrees();
        this.updateCameraRotation();
        this.updateRendererSize();
    }

    onVideoMetadataLoaded() {
        this.updateRendererSize();
    }

    getScreenOrientationDegrees() {
        if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
            return window.screen.orientation.angle;
        }
        if (typeof window.orientation === 'number') {
            return window.orientation;
        }
        return 0;
    }

    /**
     * 視線方向を取得
     */
    getViewDirection() {
        return this.viewDirection;
    }

    /**
     * 任意のワールド座標をNDCに射影
     */
    projectToNdc(worldPos, target = this._projectionScratch) {
        // Ensure camera matrices are fresh (View Matrix specifically)
        this.cameraPivot.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

        const v = target.set(worldPos.x, worldPos.y, worldPos.z);
        // Note: project() uses matrixWorldInverse (View) * projectionMatrix
        v.project(this.camera);
        return v; // x,y,zが-1〜1に正規化された座標
    }

    /**
     * カメラのワールド前方ベクトルを取得
     */
    getCameraForward(target = this._forward) {
        const dir = target;
        this.camera.getWorldDirection(dir);
        return dir.normalize();
    }

    getCameraBasis() {
        this.cameraPivot.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        const q = this.camera.getWorldQuaternion(this._qFinal);
        const right = this._right.set(1, 0, 0).applyQuaternion(q).normalize();
        const up = this._up.set(0, 1, 0).applyQuaternion(q).normalize();
        const forward = this.getCameraForward();

        return {
            right: { x: right.x, y: right.y, z: right.z },
            up: { x: up.x, y: up.y, z: up.z },
            forward: { x: forward.x, y: forward.y, z: forward.z }
        };
    }

    /**
     * cameraPivotのワールド座標を取得
     */
    getPivotWorldPosition(target = this._pivotPositionScratch) {
        const pivotPos = target;
        this.cameraPivot.getWorldPosition(pivotPos);
        return pivotPos;
    }

    /**
     * レンダラーとカメラのサイズをキャンバス実寸に合わせる
     */
    updateRendererSize() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        const videoWidth = this.videoElement && this.videoElement.videoWidth ? this.videoElement.videoWidth : 0;
        const videoHeight = this.videoElement && this.videoElement.videoHeight ? this.videoElement.videoHeight : 0;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio || 1);
        if (this._lastPixelRatio !== pixelRatio) {
            this.renderer.setPixelRatio(pixelRatio);
            this._lastPixelRatio = pixelRatio;
        }
        if (
            this._lastCssWidth !== width ||
            this._lastCssHeight !== height ||
            this._lastVideoWidth !== videoWidth ||
            this._lastVideoHeight !== videoHeight
        ) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.fov = this.calculateCoveredVideoFov(width, height, videoWidth, videoHeight);
            this.camera.updateProjectionMatrix();
            this._lastCssWidth = width;
            this._lastCssHeight = height;
            this._lastVideoWidth = videoWidth;
            this._lastVideoHeight = videoHeight;
        }
    }

    calculateCoveredVideoFov(canvasWidth, canvasHeight, videoWidth, videoHeight) {
        if (!canvasWidth || !canvasHeight || !videoWidth || !videoHeight) {
            return DEFAULT_CAMERA_FOV_DEG;
        }

        const canvasAspect = canvasWidth / canvasHeight;
        const videoAspect = videoWidth / videoHeight;
        if (canvasAspect <= videoAspect) {
            return DEFAULT_CAMERA_FOV_DEG;
        }

        const visibleHeightFraction = Math.min(1, videoAspect / canvasAspect);
        const baseHalfFov = DEFAULT_CAMERA_FOV_DEG * DEG2RAD / 2;
        return 2 * Math.atan(Math.tan(baseHalfFov) * visibleHeightFraction) / DEG2RAD;
    }

    /**
     * カメラFOVの半角（度）を取得
     */
    getHalfFovDegrees() {
        return this.camera.fov / 2;
    }

    /**
     * 水平方向FOVの半角（度）を取得
     */
    getHalfFovHorizontalDegrees() {
        const halfVertRad = (this.camera.fov * Math.PI / 180) / 2;
        const halfHorzRad = Math.atan(Math.tan(halfVertRad) * this.camera.aspect);
        return halfHorzRad * 180 / Math.PI;
    }

    /**
     * クリーンアップ
     */
    dispose() {
        // イベントリスナー削除
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._resizeHandler);
            }
            this._resizeHandler = null;
        }
        if (this._orientationChangeHandler) {
            window.removeEventListener('orientationchange', this._orientationChangeHandler);
            if (window.screen && window.screen.orientation && typeof window.screen.orientation.removeEventListener === 'function') {
                window.screen.orientation.removeEventListener('change', this._orientationChangeHandler);
            }
            this._orientationChangeHandler = null;
        }
        if (this.videoElement && this._videoMetadataHandler) {
            this.videoElement.removeEventListener('loadedmetadata', this._videoMetadataHandler);
            this.videoElement.removeEventListener('resize', this._videoMetadataHandler);
            this._videoMetadataHandler = null;
        }

        // 全メッシュを削除
        this.enemyObjects.forEach(h => h.dispose());
        this.enemyObjects.clear();

        this.slashProjectileManager.dispose();
        this.swingTracer.dispose();
        if (this.calibrationStageGroup) {
            this.scene.remove(this.calibrationStageGroup);
            this.calibrationStageGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => material.dispose());
                }
            });
            this.calibrationStageGroup = null;
        }

        // Texture
        if (this.videoTexture) {
            this.videoTexture.dispose();
            this.videoTexture = null;
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement = null;
            this.renderer = null;
        }

        console.log('[Renderer] Dispose完了 (App Shutdown)');
    }

    /**
     * ゲームリスタート用のリセット (Context保持)
     */
    reset() {
        // 1. Clear Enemies
        for (const hitodama of this.enemyObjects.values()) {
            hitodama.dispose();
        }
        this.enemyObjects.clear();

        // 2. Reset Sub-managers
        this.slashProjectileManager.reset();
        this.swingTracer.reset();
        this.setCalibrationMode(false);

        // 3. Clear transient scene objects
        // We preserve cameraPivot and Lights.
        // Remove other children if any remain (safety net)
        // Hitodama and Projectiles attach to scene, so their dispose/reset should remove them.
        // We double check scene children just in case.
        const preservedItems = [this.cameraPivot, ...this.scene.children.filter(c => c.isLight)];
        if (this.calibrationStageGroup) preservedItems.push(this.calibrationStageGroup);
        const preserved = new Set(preservedItems);

        // Remove anything else
        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (!preserved.has(child)) {
                this.scene.remove(child);
                // We don't deep dispose here because we assume managers did it.
            }
        }

        this.renderer.clear();
        console.log('[Renderer] Reset executed (Context preserved)');
    }
}
