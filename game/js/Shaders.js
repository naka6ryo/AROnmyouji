/**
 * Shaders.js
 * シェーダー定義
 */

export const tracerVertexShader = `
    uniform float uTime;
    attribute float aWidth;
    varying vec2 vUv;
    varying float vWidth;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
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

export const tracerFragmentShader = `
    uniform float uTime;
    uniform vec3 uColorCore;
    uniform vec3 uColorEdge;
    varying vec2 vUv;
    varying float vWidth;
    
    // 軽いブラウン管風の魚眼（バレル）歪み
    vec2 fisheyeUv(vec2 uv, float strength) {
        vec2 c = uv - vec2(0.5);
        float r2 = dot(c, c);
        // バレル係数。強度は少なめに（0.03〜0.08 程度が目安）
        float k = 1.0 + strength * r2;
        return vec2(0.5) + c * k;
    }
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
        // 軽い歪みを適用（ブラウン管風の魚眼）。strength を小さくして目立ちすぎないようにする。
        vec2 uv = fisheyeUv(vUv, 0.06);

        vec2 noiseUV = uv * vec2(4.0, 2.0) - vec2(uTime * 1.5, 0.0);
        float n1 = snoise(noiseUV * 1.5);
        float n2 = snoise(noiseUV * 3.0 + vec2(uTime, uTime));
        float fbm = n1 * 0.6 + n2 * 0.4;

        float centerDist = abs(uv.y - 0.5) * 2.0;
        float scratchThreshold = 0.4 + centerDist * 0.4;
        float scratch = smoothstep(scratchThreshold - 0.1, scratchThreshold + 0.1, fbm + 0.5);

        float core = smoothstep(0.3, 0.7, fbm + (1.0 - centerDist) * 0.5);
        vec3 color = mix(uColorEdge, uColorCore, core);
        color += uColorEdge * (1.0 - core) * 1.5;

        float alphaSide = smoothstep(1.0, 0.6, centerDist);
        float alphaLong = smoothstep(0.0, 0.15, uv.x);
        float finalAlpha = alphaSide * alphaLong * scratch;
        if(finalAlpha < 0.01) discard;

        gl_FragColor = vec4(color, finalAlpha);
    }
`;

export const tubeVertexShader = `
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
