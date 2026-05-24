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
        this.calibrationFrontYaw = 0;
        this.calibrationTarget = {
            id: 'calibration-target',
            azim: 0,
            elev: 0,
            distance: 6,
            radius: 0.75
        };
        this.calibrationTargetBurstEffects = [];

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
            colors: {
                glow: 0x0057d9,
                edge: 0x007cff,
                core: 0x005eea,
                tail: 0x003fbd
            },
            material: {
                blending: 'normal',
                opacityScale: 1.9,
                sparks: false
            }
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
        this.setCalibrationFrontToCurrentCamera();
        this.clearCalibrationTargetBurstEffects();

        if (!this.calibrationStageGroup) {
            this.calibrationStageGroup = this.createCalibrationStage();
            this.scene.add(this.calibrationStageGroup);
        } else {
            this.updateCalibrationTarget();
        }

        this.calibrationStageGroup.visible = true;
        const target = this.calibrationStageGroup.getObjectByName('calibrationTarget');
        if (target) target.visible = true;
        this.renderer.setClearColor(0xe8edf2, 1);

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

    setCalibrationFrontToCurrentCamera() {
        const frontYaw = this.getCameraHorizontalYawDegrees();
        this.calibrationFrontYaw = frontYaw;
        this.calibrationTarget.azim = frontYaw;
    }

    getCalibrationFrontYaw() {
        return this.calibrationFrontYaw || 0;
    }

    getCameraHorizontalYawDegrees() {
        const forward = this.getCameraForward();
        const horizontalLen = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
        if (horizontalLen < 0.0001) {
            return this.calibrationFrontYaw || 0;
        }
        return Math.atan2(forward.x, -forward.z) / DEG2RAD;
    }

    hideCalibrationStage() {
        if (this.calibrationStageGroup) {
            this.calibrationStageGroup.visible = false;
        }

        this.clearCalibrationTargetBurstEffects();
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

    getCalibrationTargetGuide() {
        const targetWorld = this.getCalibrationTargetWorldPosition();
        const basis = this.getCameraBasis();
        const eLen = targetWorld.length();
        if (eLen < 0.0001) return null;

        const eVec = {
            x: targetWorld.x / eLen,
            y: targetWorld.y / eLen,
            z: targetWorld.z / eLen
        };

        const vx = eVec.x * basis.right.x + eVec.y * basis.right.y + eVec.z * basis.right.z;
        const vy = eVec.x * basis.up.x + eVec.y * basis.up.y + eVec.z * basis.up.z;
        const vz = eVec.x * basis.forward.x + eVec.y * basis.forward.y + eVec.z * basis.forward.z;

        const ndc = this.projectToNdc(targetWorld);
        const centered = vz > 0 && Math.abs(ndc.x) < 0.12 && Math.abs(ndc.y) < 0.12 && ndc.z >= -1 && ndc.z <= 1;
        if (centered) {
            return { visible: false };
        }

        let rad = Math.atan2(vy, vx);
        let edgeX;
        let edgeY;

        if (vz < 0) {
            const side = Math.abs(vx) > 0.08 ? (vx < 0 ? -1 : 1) : 1;
            edgeX = side;
            edgeY = Math.max(-0.35, Math.min(0.35, vy * 0.6));
            rad = Math.atan2(edgeY, edgeX);
        } else {
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);
            const scale = 1 / Math.max(Math.abs(cosA), Math.abs(sinA), 0.0001);
            edgeX = cosA * scale;
            edgeY = sinA * scale;
        }

        const marginPct = 12;
        return {
            visible: true,
            xPct: 50 + edgeX * (50 - marginPct),
            yPct: 50 - edgeY * (50 - marginPct),
            rotation: 90 - (rad * 180 / Math.PI)
        };
    }

    getCalibrationTargetViewportPoint() {
        const targetWorld = this.getCalibrationTargetWorldPosition(this._cameraPositionScratch);
        const ndc = this.projectToNdc(targetWorld);
        const basis = this.getCameraBasis();
        const eLen = targetWorld.length();
        if (eLen < 0.0001) return null;
        const eVec = {
            x: targetWorld.x / eLen,
            y: targetWorld.y / eLen,
            z: targetWorld.z / eLen
        };
        const vz = eVec.x * basis.forward.x + eVec.y * basis.forward.y + eVec.z * basis.forward.z;

        return {
            x: (ndc.x + 1) * 0.5 * window.innerWidth,
            y: (1 - ndc.y) * 0.5 * window.innerHeight,
            ndcX: ndc.x,
            ndcY: ndc.y,
            ndcZ: ndc.z,
            inFront: vz > 0
        };
    }

    getCalibrationTargetWorldPosition(target = this._projectionScratch) {
        const azimRad = this.calibrationTarget.azim * DEG2RAD;
        const elevRad = this.calibrationTarget.elev * DEG2RAD;
        const r = this.calibrationTarget.distance;
        return target.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
    }

    triggerCalibrationTargetBurst() {
        const targetWorld = this.getCalibrationTargetWorldPosition(new THREE.Vector3());
        const target = this.calibrationStageGroup
            ? this.calibrationStageGroup.getObjectByName('calibrationTarget')
            : null;
        if (target) target.visible = false;

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff1f1f,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 12, 96), ringMaterial);
        ring.position.copy(targetWorld);
        ring.lookAt(this.camera.position);
        this.scene.add(ring);
        this.calibrationTargetBurstEffects.push({
            type: 'shockwave',
            mesh: ring,
            life: 1,
            speed: 7
        });

        for (let i = 0; i < 56; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.35 ? 0xff2020 : 0xffffff,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const fragmentGeometry = new THREE.TetrahedronGeometry(0.035, 0);
            const fragment = new THREE.Mesh(fragmentGeometry, material);
            fragment.position.copy(targetWorld);
            fragment.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.scene.add(fragment);

            const velocity = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize().multiplyScalar(2.5 + Math.random() * 6.5);

            this.calibrationTargetBurstEffects.push({
                type: 'fragment',
                mesh: fragment,
                velocity,
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 14,
                    (Math.random() - 0.5) * 14,
                    (Math.random() - 0.5) * 14
                ),
                life: 1,
                decay: 1.6 + Math.random() * 1.2
            });
        }
    }

    updateCalibrationTargetBurstEffects(dtSec) {
        for (let i = this.calibrationTargetBurstEffects.length - 1; i >= 0; i--) {
            const effect = this.calibrationTargetBurstEffects[i];
            if (effect.type === 'shockwave') {
                const scale = effect.mesh.scale.x + effect.speed * dtSec;
                effect.mesh.scale.set(scale, scale, scale);
                effect.life -= dtSec * 2.2;
                effect.mesh.material.opacity = Math.max(0, effect.life);
            } else {
                effect.mesh.position.add(effect.velocity.clone().multiplyScalar(dtSec));
                effect.mesh.rotation.x += effect.rotationSpeed.x * dtSec;
                effect.mesh.rotation.y += effect.rotationSpeed.y * dtSec;
                effect.mesh.rotation.z += effect.rotationSpeed.z * dtSec;
                effect.velocity.multiplyScalar(Math.max(0.85, 1 - dtSec * 1.8));
                effect.life -= effect.decay * dtSec;
                effect.mesh.material.opacity = Math.max(0, effect.life);
                const scale = Math.max(0.01, effect.life * 1.7);
                effect.mesh.scale.set(scale, scale, scale);
            }

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                if (effect.mesh.geometry) effect.mesh.geometry.dispose();
                if (effect.mesh.material) effect.mesh.material.dispose();
                this.calibrationTargetBurstEffects.splice(i, 1);
            }
        }
    }

    clearCalibrationTargetBurstEffects() {
        for (const effect of this.calibrationTargetBurstEffects) {
            this.scene.remove(effect.mesh);
            if (effect.mesh.geometry) effect.mesh.geometry.dispose();
            if (effect.mesh.material) effect.mesh.material.dispose();
        }
        this.calibrationTargetBurstEffects = [];
    }

    createCalibrationStage() {
        const group = new THREE.Group();
        group.name = 'calibrationStage';

        const floorGrid = new THREE.GridHelper(10, 20, 0x8f969e, 0xc2c9d1);
        floorGrid.position.set(0, -1.15, -3.2);
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = 0.65;
        group.add(floorGrid);

        const backGrid = new THREE.GridHelper(8, 16, 0x9aa1aa, 0xcbd2da);
        backGrid.rotation.x = Math.PI / 2;
        backGrid.position.set(0, 1.0, -4.25);
        backGrid.material.transparent = true;
        backGrid.material.opacity = 0.5;
        group.add(backGrid);

        const axisMaterial = new THREE.LineBasicMaterial({ color: 0x707982, transparent: true, opacity: 0.58 });
        const axisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-4, 0, -3),
            new THREE.Vector3(4, 0, -3),
            new THREE.Vector3(0, -1.8, -3),
            new THREE.Vector3(0, 1.8, -3)
        ]);
        group.add(new THREE.LineSegments(axisGeometry, axisMaterial));

        const target = new THREE.Group();
        target.name = 'calibrationTarget';
        target.scale.setScalar(1.5);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });

        [0.36, 0.22, 0.08].forEach(radius => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 12, 72), ringMaterial);
            target.add(ring);
        });

        const center = new THREE.Mesh(
            new THREE.CircleGeometry(0.035, 32),
            new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1, side: THREE.DoubleSide })
        );
        center.position.z = 0.002;
        target.add(center);

        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 48),
            new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
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
        this.updateCalibrationTargetBurstEffects(dtSec);

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
        this.clearCalibrationTargetBurstEffects();
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
        this.clearCalibrationTargetBurstEffects();
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
