/* ─────────────────────────────────────────────
   webgl.js · Depth Map 패럴랙스 + 먼지 낙하
   ───────────────────────────────────────────── */

const WEBGL_CONFIG = {
  imageSrc: 'images/main.png',
  depthSrc: 'images/depth.jpg',
  bgSrc:    'images/bgimage.jpg',
  strength: 0.01,
  bgColor:  [0.106, 0.106, 0.106, 1.0],  /* bgSrc 로드 실패 시 폴백 #1b1b1b */
};

const VERT_SRC = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

const FRAG_SRC = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform sampler2D u_depth;
  uniform sampler2D u_bg;
  uniform vec2  u_mouse;
  uniform float u_strength;
  uniform float u_imgAspect;
  uniform float u_canvasAspect;
  uniform vec4  u_bgColor;
  varying vec2 v_uv;

  vec2 coverUV(vec2 uv, float imgA, float canvasA) {
    if (canvasA > imgA) {
      float s = imgA / canvasA;
      uv.y = uv.y * s + (1.0 - s) * 0.5;
    } else {
      float s = canvasA / imgA;
      uv.x = uv.x * s + (1.0 - s) * 0.5;
    }
    return uv;
  }

  void main() {
    vec2 uv       = coverUV(v_uv, u_imgAspect, u_canvasAspect);
    vec2 offset   = u_mouse * u_strength;
    vec2 lookback = uv - offset;   /* 마우스 방향 */

    bool outOfBounds = (lookback.x < 0.0 || lookback.x > 1.0 ||
                        lookback.y < 0.0 || lookback.y > 1.0);

    vec4  bgPixel = texture2D(u_bg, uv);
    float fgDepth = outOfBounds ? 0.0       : texture2D(u_depth, lookback).r;
    vec4  fgColor = outOfBounds ? bgPixel   : texture2D(u_image, lookback);

    float alpha   = smoothstep(0.05, 0.28, fgDepth);
    gl_FragColor  = mix(bgPixel, fgColor, alpha);
  }
`;

/* ── 유틸 ── */
function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
  }
  return s;
}

function createProgram(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Link error:', gl.getProgramInfoLog(prog)); return null;
  }
  return prog;
}

function loadTexture(gl, src) {
  return new Promise(resolve => {
    const tex = gl.createTexture();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve({ tex, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* 로드 실패 시 단색 텍스처 생성 */
function createSolidTexture(gl, r, g, b, a) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([r * 255, g * 255, b * 255, a * 255]));
  return { tex, width: 1, height: 1 };
}

function createQuad(gl, prog) {
  const pos = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  const uvs = new Float32Array([ 0, 1,  1, 1,  0,0, 1,0]);
  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const ub = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ub);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(prog, 'a_uv');
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
}

/* ── 마우스 ── */
const mouse = { cx: 0, cy: 0, tx: 0, ty: 0 };

/* ═══════════════════════════════════════════════
   먼지 낙하 파티클
   ═══════════════════════════════════════════════ */
function initDust() {
  const canvas = document.getElementById('dust-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const COUNT = 55;
  const particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  /* 마우스 추적용 (dust 캔버스 좌표계) */
  const dustMouse = { cx: canvas.width / 2, cy: canvas.height / 2,
                      tx: canvas.width / 2, ty: canvas.height / 2 };
  window.addEventListener('mousemove', e => {
    dustMouse.tx = e.clientX;
    dustMouse.ty = e.clientY;
  });

  function createParticle() {
    const maxLife = Math.random() * 420 + 280;
    return {
      x:            Math.random() * window.innerWidth,
      y:            Math.random() * window.innerHeight,
      size:         Math.random() * 0.5 + 0.2,
      vx:           (Math.random() - 0.5) * 0.08,
      vy:           Math.random() * 0.22 + 0.06,
      peakOpacity:  Math.random() * 0.6 + 0.25,
      life:         Math.random() * maxLife,
      maxLife,
      twinkleSpeed: Math.random() * 0.0006 + 0.0002,
      twinklePhase: Math.random() * Math.PI * 2,
    };
  }

  for (let i = 0; i < COUNT; i++) particles.push(createParticle());

  const DUST_LERP = 0.04;

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    t++;

    /* 마우스 위치 부드럽게 추적 */
    dustMouse.cx += (dustMouse.tx - dustMouse.cx) * DUST_LERP;
    dustMouse.cy += (dustMouse.ty - dustMouse.cy) * DUST_LERP;

    /* 화면 중앙 기준 마우스 오프셋 (-1 ~ 1) */
    const mx = (dustMouse.cx / window.innerWidth  - 0.5) * 2;
    const my = (dustMouse.cy / window.innerHeight - 0.5) * 2;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
        /* 마우스 근처 파티클만 밀림 — 거리 기반 영향력 */
      const dx   = p.x - dustMouse.cx;
      const dy   = p.y - dustMouse.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const RADIUS = 160;   /* 영향 반경(px) */
      const influence = Math.max(0, 1 - dist / RADIUS);
      p.x += p.vx + mx * 0.55 * influence;
      p.y += p.vy + my * 0.55 * influence;
      p.life++;

      if (p.life >= p.maxLife || p.y > canvas.height + 8) {
        particles[i] = createParticle();
        continue;
      }

      const lifeRatio = p.life / p.maxLife;
      const FADE_IN = 0.15, FADE_OUT = 0.85;
      let lifeFactor;
      if (lifeRatio < FADE_IN)       lifeFactor = lifeRatio / FADE_IN;
      else if (lifeRatio > FADE_OUT) lifeFactor = 1 - (lifeRatio - FADE_OUT) / (1 - FADE_OUT);
      else                           lifeFactor = 1;

      const twinkle = Math.sin(t * p.twinkleSpeed * 60 + p.twinklePhase);
      const alpha   = p.peakOpacity * lifeFactor * (0.6 + 0.4 * twinkle);
      if (alpha <= 0.005) continue;

      /* 외곽 소프트 글로우 (블러 효과) */
      const blurR = p.size * 7;
      const glow  = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, blurR);
      glow.addColorStop(0,    `rgba(255,255,255,${alpha * 0.35})`);
      glow.addColorStop(0.4,  `rgba(255,255,255,${alpha * 0.12})`);
      glow.addColorStop(1,    `rgba(255,255,255,0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, blurR, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      /* 중심 밝은 코어 */
      const coreR = p.size * 1.8;
      const core  = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreR);
      core.addColorStop(0,   `rgba(255,255,255,${alpha})`);
      core.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.5})`);
      core.addColorStop(1,   `rgba(255,255,255,0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── WebGL 메인 ── */
async function initWebGL() {
  const canvas = document.getElementById('webgl-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { showPlaceholder(); return; }

  const [r, g, b, a] = WEBGL_CONFIG.bgColor;
  gl.clearColor(r, g, b, a);

  function resize() {
    canvas.width  = window.innerWidth  * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const prog = createProgram(gl);
  if (!prog) { showPlaceholder(); return; }
  gl.useProgram(prog);
  createQuad(gl, prog);

  const uImage        = gl.getUniformLocation(prog, 'u_image');
  const uDepth        = gl.getUniformLocation(prog, 'u_depth');
  const uBg           = gl.getUniformLocation(prog, 'u_bg');
  const uMouse        = gl.getUniformLocation(prog, 'u_mouse');
  const uStrength     = gl.getUniformLocation(prog, 'u_strength');
  const uImgAspect    = gl.getUniformLocation(prog, 'u_imgAspect');
  const uCanvasAspect = gl.getUniformLocation(prog, 'u_canvasAspect');
  const uBgColor      = gl.getUniformLocation(prog, 'u_bgColor');

  const [imgData, depthData, bgData] = await Promise.all([
    loadTexture(gl, WEBGL_CONFIG.imageSrc),
    loadTexture(gl, WEBGL_CONFIG.depthSrc),
    loadTexture(gl, WEBGL_CONFIG.bgSrc),
  ]);
  if (!imgData || !depthData) { showPlaceholder(); return; }

  /* bgimage 로드 실패 시 단색으로 폴백 */
  const bgTex = bgData ? bgData.tex : createSolidTexture(gl, r, g, b, a).tex;

  const imgAspect = imgData.width / imgData.height;

  window.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    mouse.tx = (t.clientX / window.innerWidth  - 0.5) * 2;
    mouse.ty = (t.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const LERP = 0.05;

  function render() {
    mouse.cx += (mouse.tx - mouse.cx) * LERP;
    mouse.cy += (mouse.ty - mouse.cy) * LERP;

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgData.tex);
    gl.uniform1i(uImage, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthData.tex);
    gl.uniform1i(uDepth, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(uBg, 2);

    gl.uniform2f(uMouse, mouse.cx, mouse.cy);
    gl.uniform1f(uStrength, WEBGL_CONFIG.strength);
    gl.uniform1f(uImgAspect, imgAspect);
    gl.uniform1f(uCanvasAspect, canvas.width / canvas.height);
    gl.uniform4f(uBgColor, r, g, b, a);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  render();
}

function showPlaceholder() {
  const c = document.getElementById('webgl-canvas');
  if (c) c.style.display = 'none';
  const p = document.getElementById('webgl-placeholder');
  if (p) p.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  initWebGL();
  initDust();
});
