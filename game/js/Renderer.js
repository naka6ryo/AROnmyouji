/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

import * as THREE from 'three';
import { Hitodama } from './Hitodama.js';
import { SwingTracer } from './SwingTracer.js';
import { SlashProjectileManager } from './SlashProjectileManager.js';

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
            60, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // 手を伸ばして端末を持つ前提で、回転中心とカメラ位置を分離
        // pivotを身体側に置き、カメラを原点に配置
        this.cameraPivot = new THREE.Object3D();
        this.scene.add(this.cameraPivot);
        this.cameraPivot.add(this.camera);
        this.camera.position.set(0, 0, 0);

        // 端末を縦向きで持つことを基準に、X軸へ-90度オフセット
        this.orientationOffset = new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ');

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true, // 背景透過
            antialias: true,
            premultipliedAlpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.autoClear = false;

        this.updateRendererSize();

        // 端末姿勢（視点制御用）
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.viewDirection = { x: 0, y: 0, z: 1 };

        // 敵のメッシュ管理
        this.enemyObjects = new Map(); // enemyId -> Hitodama instance

        // コールバック
        this.onSlashHitEnemy = null; // 斬撃が敵に当たった時

        // --- Refactored Modules ---

        // 術式段階の軌跡表示
        this.swingTracer = new SwingTracer(this.scene);

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
        window.addEventListener('resize', () => this.onResize());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.onResize());
        }

        console.log('[Renderer] 初期化完了');
    }

    /**
     * 端末姿勢を更新（DeviceOrientationEvent）
     */
    updateDeviceOrientation(event) {
        this.deviceOrientation = {
            alpha: event.alpha || 0,  // Z軸回転
            beta: event.beta || 0,    // X軸回転
            gamma: event.gamma || 0   // Y軸回転
        };

        // 視線方向ベクトルを計算
        this.viewDirection = this.calculateViewDirection();

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
        const { alpha, beta, gamma } = this.deviceOrientation;
        const euler = new THREE.Euler(
            beta * Math.PI / 180,
            alpha * Math.PI / 180,
            -gamma * Math.PI / 180,
            'YXZ'
        );
        euler.x += this.orientationOffset.x;
        euler.y += this.orientationOffset.y;
        euler.z += this.orientationOffset.z;
        this.cameraPivot.rotation.copy(euler);
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
                    const camPos = new THREE.Vector3();
                    this.camera.getWorldPosition(camPos);
                    if (!this.scene.userData) this.scene.userData = {};
                    this.scene.userData.cameraPosition = camPos;
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

    /**
     * 描画（敵情報を受け取って衝突判定）
     */
    render(deltaTime, enemies) {
        this.updateRendererSize();

        // 人魂のアニメーション更新
        const dtSec = deltaTime / 1000;
        for (const hitodama of this.enemyObjects.values()) {
            hitodama.update(dtSec);
        }

        // 飛翔体更新
        this.slashProjectileManager.update(deltaTime, enemies, this.onSlashHitEnemy);

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

    /**
     * 視線方向を取得
     */
    getViewDirection() {
        return this.viewDirection;
    }

    /**
     * 任意のワールド座標をNDCに射影
     */
    projectToNdc(worldPos) {
        const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
        v.project(this.camera);
        return v; // x,y,zが-1〜1に正規化された座標
    }

    /**
     * カメラのワールド前方ベクトルを取得
     */
    getCameraForward() {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        return dir.normalize();
    }

    /**
     * cameraPivotのワールド座標を取得
     */
    getPivotWorldPosition() {
        const pivotPos = new THREE.Vector3();
        this.cameraPivot.getWorldPosition(pivotPos);
        return pivotPos;
    }

    /**
     * レンダラーとカメラのサイズをキャンバス実寸に合わせる
     */
    updateRendererSize() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
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
        // 全メッシュを削除
        for (const hitodama of this.enemyObjects.values()) {
            hitodama.dispose();
        }
        this.enemyObjects.clear();

        this.slashProjectileManager.dispose();
        this.swingTracer.dispose();

        this.renderer.dispose();
    }
}
