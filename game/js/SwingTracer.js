/**
 * SwingTracer.js
 * 術式段階の軌跡表示を管理するクラス
 * Optimized: Reuses Material.
 */

import * as THREE from 'three';
import { tracerVertexShader, tracerFragmentShader, tubeVertexShader } from './Shaders.js';

export class SwingTracer {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;

        this.TRACER_RADIUS = 0.4;       // 球面半径（カメラ回転中心から）
        this.TRACER_BASE_WIDTH = 0.006 * 1.5; // 軌跡基本幅（1.5倍）

        this._startTime = performance.now();

        // Shared material (Pre-compiled)
        this.material = new THREE.ShaderMaterial({
            vertexShader: tubeVertexShader,
            fragmentShader: tracerFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColorCore: { value: new THREE.Color(0x000000) },
                uColorEdge: { value: new THREE.Color(0x0066ff) }
            },
            transparent: true,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
    }

    /**
     * 軌跡表示開始
     */
    start() {
        this.disposeMesh();
    }

    /**
     * 軌跡更新
     */
    update(trajectory) {
        if (!trajectory || trajectory.length < 2) return;

        this.disposeMesh();

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
        const radius = Math.max(0.001, this.TRACER_BASE_WIDTH);
        const radialSegments = 10;

        const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

        // Update Uniforms
        this.material.uniforms.uTime.value = (performance.now() - this._startTime) * 0.001;

        this.mesh = new THREE.Mesh(tubeGeometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
    }

    /**
     * 時間更新（シェーダー用）
     */
    updateTime() {
        if (this.material && this.material.uniforms) {
            this.material.uniforms.uTime.value = (performance.now() - this._startTime) * 0.001;
        }
    }

    /**
     * 軌跡終了
     */
    end() {
        this.disposeMesh();
    }

    /**
     * メッシュ破棄
     */
    disposeMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            // Do not dispose shared material here
            this.mesh = null;
        }
    }

    /**
     * 完全削除
     */
    dispose() {
        this.disposeMesh();
        if (this.material) this.material.dispose();
    }
}
