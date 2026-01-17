/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Hitodama } from './Hitodama.js';

export class Renderer {
    constructor(canvasId, debugOverlay = null) {
        this.canvas = document.getElementById(canvasId);
        this.debugOverlay = debugOverlay; // デバッグUIへのログ出力

        // Three.js セットアップ
        this.scene = new THREE.Scene();
        // カメラ映像を Three.js の背景テクスチャとして扱う（HTML video 要素から VideoTexture を作成）
        this.videoElement = document.getElementById('cameraVideo');
        if (this.videoElement) {
            try {
                this.videoTexture = new THREE.VideoTexture(this.videoElement);
                this.videoTexture.minFilter = THREE.LinearFilter;
                this.videoTexture.magFilter = THREE.LinearFilter;
                // フォーマットやエンコーディングは環境依存なので Three.js に任せる
                this.scene.background = this.videoTexture;
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
        // クリアカラーを透明に設定 (Bloom用)
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.autoClear = false;

        // --- ポストプロセス（ブルーム発光効果） ---
        this.renderScene = new RenderPass(this.scene, this.camera);
        this.renderScene.clear = true;

        // ブルーム設定
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        this.bloomPass.threshold = 0.1;
        this.bloomPass.strength = 2.0;
        this.bloomPass.radius = 0.8;

        // 【背景透過パッチ】
        if (this.bloomPass.compositeMaterial) {
            const oldShader = this.bloomPass.compositeMaterial.fragmentShader;
            const newShader = oldShader.replace(
                'gl_FragColor = vec4( color.rgb + bloom, 1.0 );',
                'gl_FragColor = vec4( color.rgb + bloom, min(1.0, color.a + length(bloom)) );'
            );
            this.bloomPass.compositeMaterial.fragmentShader = newShader;
            this.bloomPass.compositeMaterial.transparent = true;
            this.bloomPass.compositeMaterial.needsUpdate = true;
        }

        // 透明度を維持するためのRender Target設定
        const renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth * Math.min(window.devicePixelRatio, 2),
            window.innerHeight * Math.min(window.devicePixelRatio, 2),
            {
                // HalfFloat は環境によってサポートが分かれるため幅広い互換性のある値へ
                type: THREE.UnsignedByteType,
                format: THREE.RGBAFormat
            }
        );

        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.composer.addPass(this.renderScene);
        this.composer.addPass(this.bloomPass);

        this.updateRendererSize();

        // 端末姿勢（視点制御用）
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.viewDirection = { x: 0, y: 0, z: 1 };

        // 敵のメッシュ管理
        // 敵の管理 (Hitodamaインスタンス)
        this.enemyObjects = new Map(); // enemyId -> Hitodama instance

        // 斬撃飛翔体の管理
        this.slashProjectiles = [];
        this.SLASH_SPEED = 8.0; // m/s
        this.SLASH_LIFETIME = 1500; // ms

        // コールバック
        this.onSlashHitEnemy = null; // 斬撃が敵に当たった時

        // 術式段階の軌跡表示（SwingActive中）
        this.swingTracerMesh = null; // 軌跡メッシュ
        this.TRACER_RADIUS = 0.4; // 球面半径（カメラ回転中心から）

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
        // 実際のワールド前方を再取得（カメラ位置オフセット後）
        const forward = this.getCameraForward();
        this.viewDirection = { x: forward.x, y: forward.y, z: forward.z };
    }

    /**
     * 敵を追加
     */
    addEnemy(enemy) {
        // 人魂インスタンス生成
        const hitodama = new Hitodama(this.scene);

        // 位置を設定
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

        // Hitodamaのposプロパティを更新
        hitodama.pos.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
    }

    /**
     * 敵を削除
     */
    removeEnemy(enemyId) {
        const hitodama = this.enemyObjects.get(enemyId);
        if (hitodama) {
            hitodama.dispose();
            this.enemyObjects.delete(enemyId);
            console.log(`[Renderer] 敵(人魂)削除: id=${enemyId}`);
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
        // 既存のメッシュがあれば削除
        if (this.swingTracerMesh) {
            this.scene.remove(this.swingTracerMesh);
            this.swingTracerMesh.geometry.dispose();
            this.swingTracerMesh.material.dispose();
        }
    }

    /**
     * 術式段階の軌跡を更新
     */
    updateSwingTracer(trajectory) {
        if (!trajectory || trajectory.length === 0) return;

        // 既存のメッシュを削除
        if (this.swingTracerMesh) {
            this.scene.remove(this.swingTracerMesh);
            this.swingTracerMesh.geometry.dispose();
            this.swingTracerMesh.material.dispose();
        }

        // 軌跡から3D点群を生成
        const points = [];
        for (const point of trajectory) {
            const pitchRad = point.pitch * Math.PI / 180;
            const yawRad = point.yaw * Math.PI / 180;

            const x = this.TRACER_RADIUS * Math.cos(pitchRad) * Math.sin(yawRad);
            const y = this.TRACER_RADIUS * Math.sin(pitchRad);
            const z = -this.TRACER_RADIUS * Math.cos(pitchRad) * Math.cos(yawRad);

            points.push(new THREE.Vector3(x, y, z));
        }

        if (points.length < 2) return;

        // CatmullRomCurve3で滑らかな曲線を作成
        const curve = new THREE.CatmullRomCurve3(points);

        // TubeGeometryで太い線として描画
        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            Math.max(20, points.length * 2),
            0.015, // やや細めの半径
            8,
            false
        );

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        this.swingTracerMesh = new THREE.Mesh(tubeGeometry, material);
        this.scene.add(this.swingTracerMesh);
    }

    /**
     * 術式段階の軌跡表示を終了
     */
    endSwingTracer() {
        if (this.swingTracerMesh) {
            this.scene.remove(this.swingTracerMesh);
            this.swingTracerMesh.geometry.dispose();
            this.swingTracerMesh.material.dispose();
            this.swingTracerMesh = null;
        }
    }

    /**
     * 円弧飛翔体を追加（始点・終点の角度から円弧を計算して飛ばす）
     */
    addSlashArcProjectile(startPyr, endPyr, intensity) {
        // 始点と終点の3D位置を計算（半径0.3m）
        const baseRadius = 0.3;

        const startPitchRad = startPyr.pitch * Math.PI / 180;
        const startYawRad = startPyr.yaw * Math.PI / 180;
        const startPos = new THREE.Vector3(
            baseRadius * Math.cos(startPitchRad) * Math.sin(startYawRad),
            baseRadius * Math.sin(startPitchRad),
            -baseRadius * Math.cos(startPitchRad) * Math.cos(startYawRad)
        );

        const endPitchRad = endPyr.pitch * Math.PI / 180;
        const endYawRad = endPyr.yaw * Math.PI / 180;
        const endPos = new THREE.Vector3(
            baseRadius * Math.cos(endPitchRad) * Math.sin(endYawRad),
            baseRadius * Math.sin(endPitchRad),
            -baseRadius * Math.cos(endPitchRad) * Math.cos(endYawRad)
        );

        // 2点を含む円弧を作成
        const arcMesh = this.createArcMesh(startPos, endPos, intensity);
        if (!arcMesh) return;

        // カメラの現在位置を基準に配置
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);

        arcMesh.position.copy(cameraPos);
        this.scene.add(arcMesh);

        // 飛翔体として記録
        const projectile = {
            mesh: arcMesh,
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            speed: this.SLASH_SPEED,
            spawnTime: performance.now(),
            intensity,
            currentRadius: baseRadius, // 現在の半径
            direction: this.camera.getWorldDirection(new THREE.Vector3()).normalize(),
            hitEnemies: new Set() // 既に判定した敵のIDを記録（二重判定防止）
        };

        this.slashProjectiles.push(projectile);

        console.log(`[Renderer] 円弧飛翔体生成: 始点=${JSON.stringify(startPyr)}, 終点=${JSON.stringify(endPyr)}`);
    }

    /**
     * 2点を結ぶ円弧メッシュを作成
     */
    createArcMesh(startPos, endPos, intensity) {
        // 始点と終点を含む円弧を作成
        // 簡単な実装：始点と終点を結ぶ曲線（放物線的）
        const points = [startPos];

        // 中間点を追加（3つの制御点で Catmull-Rom 曲線）
        for (let i = 1; i < 5; i++) {
            const t = i / 5;
            const midPoint = new THREE.Vector3();
            midPoint.lerpVectors(startPos, endPos, t);
            // 外側に膨らませる
            midPoint.multiplyScalar(1.0 + Math.sin(t * Math.PI) * 0.3);
            points.push(midPoint);
        }

        points.push(endPos);

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            20,
            0.02,
            8,
            false
        );

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.7 + intensity * 0.3,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        return new THREE.Mesh(tubeGeometry, material);
    }

    /**
     * 斬撃飛翔体を更新（円弧拡大版・敵衝突判定付き）
     */
    updateSlashProjectiles(deltaTime, enemies) {
        const now = performance.now();
        const deltaTimeSec = deltaTime / 1000;

        // 寿命切れをフィルタ
        this.slashProjectiles = this.slashProjectiles.filter(proj => {
            const age = now - proj.spawnTime;

            if (age >= this.SLASH_LIFETIME) {
                // 寿命切れ：削除
                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                return false;
            }

            // 時間経過で円弧の半径を拡大
            const lifeFraction = age / this.SLASH_LIFETIME;
            const radiusScale = 1.0 + lifeFraction * 15.67; // 最大5m（初期0.3m → 5m）

            // 敵との衝突判定（フレームごと）
            if (enemies && this.onSlashHitEnemy) {
                for (const enemy of enemies) {
                    // 既に判定済みの敵はスキップ
                    if (proj.hitEnemies.has(enemy.id)) {
                        continue;
                    }

                    // 敵との衝突判定
                    const hitEnemy = this.checkSlashEnemyCollision(
                        proj.startPos,
                        proj.endPos,
                        radiusScale,
                        enemy
                    );

                    if (hitEnemy) {
                        // 敵をヒット済みリストに追加
                        proj.hitEnemies.add(enemy.id);

                        // 衝突した敵を通知
                        const callbackMsg = `敵衝突コールバック: id=${enemy.id}`;
                        console.log(`[Renderer] ${callbackMsg}`);
                        if (this.debugOverlay) {
                            this.debugOverlay.logInfo(callbackMsg);
                        }
                        this.onSlashHitEnemy({
                            enemy: enemy,
                            intensity: proj.intensity
                        });

                        break; // 1フレーム1体のみ処理
                    }
                }
            }

            // 新しい円弧メッシュを生成して古いものと置き換える
            const newStartPos = proj.startPos.clone().multiplyScalar(radiusScale);
            const newEndPos = proj.endPos.clone().multiplyScalar(radiusScale);

            // 新メッシュを作成
            const newMesh = this.createArcMesh(newStartPos, newEndPos, proj.intensity);

            if (newMesh) {
                // 位置を設定
                newMesh.position.copy(proj.mesh.position);

                // 前方へ移動
                newMesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));

                // 透明度をフェードアウト
                newMesh.material.opacity = (0.7 + proj.intensity * 0.3) * (1 - lifeFraction);

                // シーンから古いメッシュを削除
                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();

                // 新メッシュに置き換え
                this.scene.add(newMesh);
                proj.mesh = newMesh;
            } else {
                // 前方へ移動（メッシュ更新失敗時）
                proj.mesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));

                // 透明度をフェードアウト
                proj.mesh.material.opacity = (0.7 + proj.intensity * 0.3) * (1 - lifeFraction);
            }

            return true;
        });
    }

    /**
     * 斬撃と敵の衝突判定（pivot原点ベースで完全一致）
     */
    checkSlashEnemyCollision(startPosNormalized, endPosNormalized, radiusScale, enemy) {
        // cameraPivotのワールド座標を基準にする
        const pivotPos = this.getPivotWorldPosition();

        // 敵のワールド座標を計算
        const azimRad = enemy.azim * Math.PI / 180;
        const elevRad = enemy.elev * Math.PI / 180;
        const r = enemy.distance;
        const enemyWorld = new THREE.Vector3(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        ).add(pivotPos);

        // 斬撃円弧の始点・終点もpivot基準
        const startWorld = startPosNormalized.clone().multiplyScalar(radiusScale).add(pivotPos);
        const endWorld = endPosNormalized.clone().multiplyScalar(radiusScale).add(pivotPos);

        // 敵と円弧の中心の距離
        const distToArc = (() => {
            const ab = endWorld.clone().sub(startWorld);
            const ap = enemyWorld.clone().sub(startWorld);
            const t = Math.max(0, Math.min(1, ab.dot(ap) / ab.lengthSq()));
            const closest = startWorld.clone().add(ab.multiplyScalar(t));
            return enemyWorld.distanceTo(closest);
        })();

        // 距離判定
        const enemyRadius = 0.5;
        const margin = 0.3;
        const hit = distToArc <= enemyRadius + margin;

        if (this.debugOverlay) {
            this.debugOverlay.logInfo(
                `pivot一致判定: id=${enemy.id} 距離=${distToArc.toFixed(2)} 判定=${hit} | arcR=${(radiusScale * 0.3).toFixed(2)} enemyR=${enemyRadius} margin=${margin}`
            );
        }
        return hit;
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

        this.updateSlashProjectiles(deltaTime, enemies);
        // --- 選択的ブルーム実装 ---
        // 人魂など発光させたいオブジェクトには `userData.bloom = true` を設定しておくこと
        const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const savedMaterials = new Map();

        // 非ブルームオブジェクトを黒く置き換える
        this.scene.traverse((obj) => {
            if ((obj.isMesh || obj.isSprite) && !obj.userData.bloom) {
                savedMaterials.set(obj, obj.material);
                obj.material = darkMaterial;
            }
        });

        // Bloom を含む Composer でレンダリング（ここでは黒でないオブジェクトのみが発光対象として処理される）
        this.composer.render();

        // マテリアルを元に戻す
        for (const [obj, mat] of savedMaterials) {
            obj.material = mat;
        }

        // 深度バッファをクリアしてから通常レンダリングを上書き
        this.renderer.clearDepth();
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
            this.composer.setSize(width, height);
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
        // 全敵を削除
        for (const hitodama of this.enemyObjects.values()) {
            hitodama.dispose();
        }
        this.enemyObjects.clear();

        // 斬撃飛翔体を削除
        for (const proj of this.slashProjectiles) {
            this.scene.remove(proj.mesh);
            proj.mesh.geometry.dispose();
            proj.mesh.material.dispose();
        }
        this.slashProjectiles = [];

        // 術式段階の軌跡を削除
        this.endSwingTracer();

        this.renderer.dispose();
    }
}
