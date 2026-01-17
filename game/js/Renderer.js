import * as THREE from './three.module.js';
import { HitodamaEnemy } from './Hitodama.js';
/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

export class Renderer {
    constructor(canvasId, debugOverlay = null) {
        this.canvas = document.getElementById(canvasId);
        this.debugOverlay = debugOverlay; // デバッグUIへのログ出力
        
        // Three.js セットアップ
        this.scene = new THREE.Scene();
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
            antialias: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.updateRendererSize();
        
        // 端末姿勢（視点制御用）
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.viewDirection = { x: 0, y: 0, z: 1 };
        
        // 敵のメッシュ管理
        this.enemyMeshes = new Map(); // enemyId -> mesh
        
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
        // 人魂タイプの敵かどうか判定（type: 'hitodama'）
        if (enemy.type === 'hitodama') {
            const hitodama = new HitodamaEnemy(this.scene);
            hitodama.update(0, enemy);
            this.enemyMeshes.set(enemy.id, hitodama);
            console.log(`[Renderer] 人魂敵追加: id=${enemy.id}`);
        } else {
            // 既存の球体敵
            const geometry = new THREE.SphereGeometry(0.3, 16, 16);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            const mesh = new THREE.Mesh(geometry, material);
            this.updateEnemyPosition(mesh, enemy);
            this.scene.add(mesh);
            this.enemyMeshes.set(enemy.id, mesh);
            console.log(`[Renderer] 敵メッシュ追加: id=${enemy.id}`);
        }
    }
    
    /**
     * 敵の位置を更新
     */
    updateEnemyPosition(mesh, enemy) {
        // 人魂型はHitodamaEnemyインスタンス
        if (mesh instanceof HitodamaEnemy) {
            mesh.update(0, enemy);
        } else {
            const azimRad = enemy.azim * Math.PI / 180;
            const elevRad = enemy.elev * Math.PI / 180;
            const r = enemy.distance;
            mesh.position.set(
                r * Math.cos(elevRad) * Math.sin(azimRad),
                r * Math.sin(elevRad),
                -r * Math.cos(elevRad) * Math.cos(azimRad)
            );
        }
    }
    
    /**
     * 敵を削除
     */
    removeEnemy(enemyId) {
        const mesh = this.enemyMeshes.get(enemyId);
        if (mesh) {
            if (mesh instanceof HitodamaEnemy) {
                mesh.dispose();
            } else {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            this.enemyMeshes.delete(enemyId);
            console.log(`[Renderer] 敵メッシュ削除: id=${enemyId}`);
        }
    }
    
    /**
     * 全敵の位置を更新
     */
    updateEnemies(enemies) {
        for (const enemy of enemies) {
            const mesh = this.enemyMeshes.get(enemy.id);
            if (mesh) {
                if (mesh instanceof HitodamaEnemy) {
                    mesh.update(1/60, enemy); // 仮に1/60秒
                } else {
                    this.updateEnemyPosition(mesh, enemy);
                }
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
                `pivot一致判定: id=${enemy.id} 距離=${distToArc.toFixed(2)} 判定=${hit} | arcR=${(radiusScale*0.3).toFixed(2)} enemyR=${enemyRadius} margin=${margin}`
            );
        }
        return hit;
    }
    
    /**
     * 描画（敵情報を受け取って衝突判定）
     */
    render(deltaTime, enemies) {
        this.updateRendererSize();
        this.updateSlashProjectiles(deltaTime, enemies);
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
        for (const [id, mesh] of this.enemyMeshes.entries()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.enemyMeshes.clear();
        
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
