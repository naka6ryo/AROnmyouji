/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

import * as THREE from 'three';
// postprocessing removed to simplify rendering and avoid canvas alpha issues
import { Hitodama } from './Hitodama.js';

// --- シェーダー: 筆致ライクな軌跡表現 ---
const tracerVertexShader = `
    uniform float uTime;
    attribute float aWidth;
    varying vec2 vUv;
    varying float vWidth;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    /**
     * プレーン型の斬撃メッシュを生成（シェーダ表現）
     */
    createPlaneSlashMesh(direction, intensity) {
        const geometry = new THREE.PlaneGeometry(8, 8);
        const material = new THREE.ShaderMaterial({
            vertexShader: slashVertexShader,
            fragmentShader: slashFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uLife: { value: 1.0 },
                uColor: { value: new THREE.Color(0xaaddff) }
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.type = 'planeSlash';

        // 回転と初期向きを設定する（地面と水平、進行方向基準）
        mesh.rotation.x = -Math.PI / 2;
        const angle = Math.atan2(direction.x, direction.z);
        mesh.rotation.z = angle - Math.PI / 2;

        return mesh;
    }

    void main() {
        vUv = uv;
        vWidth = aWidth;
        vec3 pos = position;

        float edgeNoise = (random(uv * 10.0 + uTime) - 0.5) * 0.5;
        float edgeIntensity = smoothstep(0.0, 0.2, abs(uv.y - 0.5));
        pos.x += edgeNoise * edgeIntensity * aWidth;
        pos.y += edgeNoise * edgeIntensity * aWidth;

        float wave = sin(uv.x * 8.0 - uTime * 6.0) * 1.0;
        pos.z += wave * 0.02;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const tracerFragmentShader = `
    uniform float uTime;
    uniform vec3 uColorCore;
    uniform vec3 uColorEdge;
    varying vec2 vUv;
    varying float vWidth;

    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vec2 noiseUV = vUv * vec2(4.0, 2.0) - vec2(uTime * 1.5, 0.0);
        float n1 = snoise(noiseUV * 1.5);
        float n2 = snoise(noiseUV * 3.0 + vec2(uTime, uTime));
        float fbm = n1 * 0.6 + n2 * 0.4;

        float centerDist = abs(vUv.y - 0.5) * 2.0;
        float scratchThreshold = 0.4 + centerDist * 0.4;
        float scratch = smoothstep(scratchThreshold - 0.1, scratchThreshold + 0.1, fbm + 0.5);

        float core = smoothstep(0.3, 0.7, fbm + (1.0 - centerDist) * 0.5);
        vec3 color = mix(uColorEdge, uColorCore, core);
        color += uColorEdge * (1.0 - core) * 1.5;

        float alphaSide = smoothstep(1.0, 0.6, centerDist);
        float alphaLong = smoothstep(0.0, 0.15, vUv.x);
        float finalAlpha = alphaSide * alphaLong * scratch;
        if(finalAlpha < 0.01) discard;

        gl_FragColor = vec4(color, finalAlpha);
    }
`;

// チューブ用の簡易頂点シェーダ
const tubeVertexShader = `
    uniform float uTime;
    varying vec2 vUv;

    // 乱数
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vUv = uv;
        vec3 pos = position;

        // 軽い表面ノイズでチューブに筆の揺らぎを追加
        float n = (random(uv * 10.0 + uTime) - 0.5) * 0.02;
        pos += normal * n;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

// --- シェーダー: 飛翔する斬撃プレーン ---
const slashVertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const slashFragmentShader = `
    uniform float uTime;
    uniform float uLife; // 1.0 で誕生, 0.0 で消滅
    uniform vec3 uColor;
    varying vec2 vUv;

    #define PI 3.14159265359

    void main() {
        vec2 uv = vUv - 0.5;
        float angle = atan(uv.y, uv.x);
        float radius = length(uv);

        // 形状幅
        float shapeFactor = smoothstep(-0.5, 1.0, cos(angle));
        shapeFactor = pow(shapeFactor, 3.0);
        float w = 0.02 + shapeFactor * 0.18;

        // 風切りノイズ
        float distortion = sin(angle * 10.0 - uTime * 8.0) * 0.005;
        float dist = abs(radius - 0.4 + distortion);

        float ring = smoothstep(w, w * 0.2, dist);
        float mask = smoothstep(-0.8, 0.2, cos(angle));

        vec3 color = uColor;
        float core = smoothstep(w * 0.6, 0.0, dist);
        color += vec3(1.0) * core * 0.8;

        float alpha = ring * mask;
        alpha *= smoothstep(0.0, 0.2, uLife) * smoothstep(1.0, 0.8, uLife);
        if (alpha < 0.01) discard;

        gl_FragColor = vec4(color, alpha);
    }
`;

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
                // NOTE: カメラ映像は HTML の <video> 要素を下層に表示し、
                // CSS の `filter: grayscale(1)` で白黒化するため、
                // Scene.background には設定しない（キャンバスの透明度を利用）。
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

        // Postprocessing（ブルーム）は不安定な環境があるため使用せず、
        // 単純なレンダリングに戻す（透明キャンバス経由で下の video が見える）。

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
        this.TRACER_BASE_WIDTH = 0.006; // 軌跡基本幅（メートル換算的） - 細く調整
        this._tracerStartTime = performance.now();

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
    removeEnemy(enemyId, options = {}) {
        const hitodama = this.enemyObjects.get(enemyId);
        if (hitodama) {
            // 既に浄化中・死亡なら即時削除
            if (hitodama.isPurifying || hitodama.isDead) {
                hitodama.dispose();
                this.enemyObjects.delete(enemyId);
                console.log(`[Renderer] 敵(人魂)削除: id=${enemyId}`);
            } else if (options.playerDamage && typeof hitodama.explode === 'function') {
                // プレイヤーダメージにより消える場合は爆発系エフェクトを使う
                hitodama.onExploded = () => {
                    hitodama.dispose();
                    this.enemyObjects.delete(enemyId);
                    console.log(`[Renderer] 敵(人魂)爆発完了・削除: id=${enemyId}`);
                };
                // pass camera world position for biasing fragments toward player
                try {
                    const camPos = new THREE.Vector3();
                    this.camera.getWorldPosition(camPos);
                    if (!this.scene.userData) this.scene.userData = {};
                    this.scene.userData.cameraPosition = camPos;
                } catch (e) {}
                hitodama.explode({ toCameraBias: true });
                console.log(`[Renderer] 敵(人魂)爆発開始 (playerDamage): id=${enemyId}`);
            } else if (typeof hitodama.purify === 'function') {
                // 撃破時に浄化アニメーションを開始し、完了時に実際に削除する
                hitodama.onPurified = () => {
                    hitodama.dispose();
                    this.enemyObjects.delete(enemyId);
                    console.log(`[Renderer] 敵(人魂)浄化完了・削除: id=${enemyId}`);
                };
                hitodama.purify();
                console.log(`[Renderer] 敵(人魂)浄化開始: id=${enemyId}`);
            } else {
                // フォールバックで即時削除
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
        if (!trajectory || trajectory.length < 2) return;

        // 既存のメッシュを削除
        if (this.swingTracerMesh) {
            this.scene.remove(this.swingTracerMesh);
            this.swingTracerMesh.geometry.dispose();
            this.swingTracerMesh.material.dispose();
            this.swingTracerMesh = null;
        }

        // 軌跡から 3D 点列を作成
        const pts = [];
        for (const pt of trajectory) {
            const pitchRad = pt.pitch * Math.PI / 180;
            const yawRad = pt.yaw * Math.PI / 180;
            const x = this.TRACER_RADIUS * Math.cos(pitchRad) * Math.sin(yawRad);
            const y = this.TRACER_RADIUS * Math.sin(pitchRad);
            const z = -this.TRACER_RADIUS * Math.cos(pitchRad) * Math.cos(yawRad);
            pts.push(new THREE.Vector3(x, y, z));
        }

        if (pts.length < 2) return;

        // Catmull-Rom 曲線で補間
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubularSegments = Math.max(20, pts.length * 3);
        const radius = Math.max(0.001, this.TRACER_BASE_WIDTH); // チューブ半径
        const radialSegments = 10;

        const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

        // シェーダーで表現（fragment は既存の筆致フラグメントを利用）
        const material = new THREE.ShaderMaterial({
            vertexShader: tubeVertexShader,
            fragmentShader: tracerFragmentShader,
            uniforms: {
                uTime: { value: (performance.now() - this._tracerStartTime) * 0.001 },
                uColorCore: { value: new THREE.Color(0x000000) },
                uColorEdge: { value: new THREE.Color(0x0066ff) }
            },
            transparent: true,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        this.swingTracerMesh = new THREE.Mesh(tubeGeometry, material);
        this.swingTracerMesh.frustumCulled = false;
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

        // プレーン型の斬撃を生成して飛ばす（シェーダ表現）
        const direction = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
        const plane = this.createPlaneSlashMesh(direction, intensity);
        if (!plane) return;

        // カメラの現在位置を基準に配置（始点のオフセットを適用）
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);
        const spawnPos = cameraPos.clone().add(startPos);
        plane.position.copy(spawnPos);
        this.scene.add(plane);

        const projectile = {
            mesh: plane,
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            speed: this.SLASH_SPEED,
            spawnTime: performance.now(),
            intensity,
            currentRadius: baseRadius,
            direction,
            hitEnemies: new Set()
        };

        this.slashProjectiles.push(projectile);

        console.log(`[Renderer] プレーン斬撃生成: 始点=${JSON.stringify(startPyr)}, 終点=${JSON.stringify(endPyr)}`);
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

            // 時間経過で寿命割合を算出
            const lifeFraction = age / this.SLASH_LIFETIME;
            const radiusScale = 1.0 + lifeFraction * 15.67; // 最大5m（初期0.3m → 5m）

            // プレーン型斬撃の更新処理
            if (proj.mesh && proj.mesh.userData && proj.mesh.userData.type === 'planeSlash') {
                // シェーダ uniforms 更新
                if (proj.mesh.material && proj.mesh.material.uniforms) {
                    proj.mesh.material.uniforms.uTime.value += deltaTimeSec;
                    proj.mesh.material.uniforms.uLife.value = 1.0 - lifeFraction;
                }

                // 前方へ移動
                proj.mesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));

                // サイズ変化（出現時に拡大し、死に際でフェード）
                let scale;
                if (lifeFraction < 0.2) {
                    scale = THREE.MathUtils.lerp(0.2, 1.2, lifeFraction / 0.2);
                } else {
                    scale = 1.2;
                }
                proj.mesh.scale.set(scale, scale, scale);

                // 透明度はシェーダ側の uLife に委ねる
                // 敵判定は既存の判定を用いるため、そのまま処理を続行
            }

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

            // プレーン型はここでメッシュ交換不要のためスキップ
            if (proj.mesh && proj.mesh.userData && proj.mesh.userData.type === 'planeSlash') {
                return true;
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
        // シェーダー軌跡の時間更新
        if (this.swingTracerMesh && this.swingTracerMesh.material && this.swingTracerMesh.material.uniforms) {
            this.swingTracerMesh.material.uniforms.uTime.value = (performance.now() - this._tracerStartTime) * 0.001;
        }
        // 簡易レンダリング: Composer を使わず通常レンダリングのみ（キャンバスは透明）
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
            if (this.composer) {
                this.composer.setSize(width, height);
            }
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
