/* -------------------------------------------------
   script.js
   1. Nền 3D bằng Three.js (hạt + khối wireframe + vệt sáng theo chuột)
   1b. Thẻ tên treo dây kéo thả được (vật lý Verlet)
   2. Header đổi nền khi cuộn, menu mobile, link active
   3. Sao chép ID mạng xã hội, 4. Form liên hệ (Formspree)
   ------------------------------------------------- */


/* --------------------- 0. VẦNG SÁNG THEO CHUỘT --------------------- */
(function initCursorGlow() {
    const canUse = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canUse) return;

    const glow = document.createElement('div');
    glow.id = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    const bg = document.getElementById('bg');
    bg.insertAdjacentElement('afterend', glow);

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let x = tx, y = ty;

    window.addEventListener('pointermove', (e) => {
        tx = e.clientX;
        ty = e.clientY;
        glow.classList.add('visible');
    }, { passive: true });
    document.addEventListener('pointerleave', () => glow.classList.remove('visible'));

    (function loop() {
        x += (tx - x) * 0.12;
        y += (ty - y) * 0.12;
        glow.style.transform = `translate3d(${x - 200}px, ${y - 200}px, 0)`;
        requestAnimationFrame(loop);
    })();
})();

/* --------------------- 1. NỀN 3D --------------------- */
(function initBackground() {
    const canvas = document.getElementById('bg');
    if (!canvas || typeof THREE === 'undefined') return; // không có Three.js -> nền đen vẫn ổn

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (err) {
        console.warn('Trình duyệt không hỗ trợ WebGL:', err);
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 800;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 8;

    const ACCENT = new THREE.Color('#8b6cff');
    const ACCENT_2 = new THREE.Color('#22d3ee');

    const world = new THREE.Group();
    scene.add(world);

    /* Đám hạt */
    const COUNT = isMobile ? 700 : 1600;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
        const r = 6 + Math.random() * 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        const c = ACCENT.clone().lerp(ACCENT_2, Math.random());
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Texture hình tròn để hạt không bị vuông
    const dot = document.createElement('canvas');
    dot.width = dot.height = 64;
    const ctx = dot.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
        size: 0.09,
        map: new THREE.CanvasTexture(dot),
        alphaTest: 0.01,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    world.add(points);

    /* Vệt hạt sáng bám theo con trỏ chuột */
    const TRAIL = 70;
    const trailPos = new Float32Array(TRAIL * 3).fill(0);
    const trailCol = new Float32Array(TRAIL * 3).fill(0);
    const trailVel = new Float32Array(TRAIL * 3).fill(0);
    const trailLife = new Float32Array(TRAIL).fill(0);
    let trailHead = 0;

    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    const trail = new THREE.Points(tGeo, new THREE.PointsMaterial({
        size: 0.22,
        map: new THREE.CanvasTexture(dot),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    trail.frustumCulled = false;
    scene.add(trail);

    const rayV = new THREE.Vector3();
    function cursorToWorld(nx, ny, out) {
        rayV.set(nx, -ny, 0.5).unproject(camera).sub(camera.position).normalize();
        const dist = -camera.position.z / rayV.z;
        return out.copy(camera.position).addScaledVector(rayV, dist);
    }

    const spawnPoint = new THREE.Vector3();
    function spawnTrail(nx, ny) {
        cursorToWorld(nx, ny, spawnPoint);
        const i = trailHead;
        trailHead = (trailHead + 1) % TRAIL;
        trailPos[i * 3]     = spawnPoint.x;
        trailPos[i * 3 + 1] = spawnPoint.y;
        trailPos[i * 3 + 2] = spawnPoint.z;
        trailVel[i * 3]     = (Math.random() - 0.5) * 0.02;
        trailVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02 - 0.005;
        trailVel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
        trailLife[i] = 1;
    }

    function updateTrail() {
        for (let i = 0; i < TRAIL; i++) {
            if (trailLife[i] <= 0) { trailCol[i * 3] = trailCol[i * 3 + 1] = trailCol[i * 3 + 2] = 0; continue; }
            trailLife[i] -= 0.022;
            const l = Math.max(trailLife[i], 0);
            trailPos[i * 3]     += trailVel[i * 3];
            trailPos[i * 3 + 1] += trailVel[i * 3 + 1];
            trailPos[i * 3 + 2] += trailVel[i * 3 + 2];
            // màu giảm dần về đen = mờ dần (blending cộng)
            trailCol[i * 3]     = (ACCENT_2.r * 0.6 + ACCENT.r * 0.4) * l;
            trailCol[i * 3 + 1] = (ACCENT_2.g * 0.6 + ACCENT.g * 0.4) * l;
            trailCol[i * 3 + 2] = (ACCENT_2.b * 0.6 + ACCENT.b * 0.4) * l;
        }
        tGeo.attributes.position.needsUpdate = true;
        tGeo.attributes.color.needsUpdate = true;
    }

    /* Khối wireframe ở giữa */
    const shape = new THREE.Group();
    const outer = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.2, 1),
        new THREE.MeshBasicMaterial({ color: ACCENT_2, wireframe: true, transparent: true, opacity: 0.3 })
    );
    const inner = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.1, 0),
        new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.7 })
    );
    shape.add(outer, inner);
    scene.add(shape);

    /* Kích thước & bố cục theo màn hình */
    function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        if (w / h < 0.9) {            // dọc / mobile: khối nằm trên cao, nhỏ hơn
            shape.position.set(0, 2.4, 0);
            shape.scale.setScalar(0.6);
        } else {                      // ngang: khối nằm bên phải
            shape.position.set(3.4, 0, 0);
            shape.scale.setScalar(1);
        }
    }
    window.addEventListener('resize', resize);
    resize();

    /* Tương tác chuột & cuộn */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let lastSpawn = 0;
    window.addEventListener('pointermove', (e) => {
        mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;

        // chỉ tạo vệt khi dùng chuột và không bật "giảm chuyển động"
        if (e.pointerType === 'mouse' && !reduceMotion) {
            const now = performance.now();
            if (now - lastSpawn > 16) {
                spawnTrail(mouse.tx, mouse.ty);
                lastSpawn = now;
            }
        }
    }, { passive: true });

    let scrollProgress = 0;
    function updateScroll() {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress = max > 0 ? window.scrollY / max : 0;
    }
    window.addEventListener('scroll', updateScroll, { passive: true });
    updateScroll();

    /* Vòng lặp vẽ */
    const clock = new THREE.Clock();
    let running = true;

    function frame() {
        if (!running) return;
        const t = clock.getElapsedTime();

        mouse.x += (mouse.tx - mouse.x) * 0.05;
        mouse.y += (mouse.ty - mouse.y) * 0.05;

        outer.rotation.x = t * 0.18;
        outer.rotation.y = t * 0.24;
        inner.rotation.x = -t * 0.3;
        inner.rotation.y = -t * 0.2;
        shape.rotation.y = mouse.x * 0.6;
        shape.rotation.x = mouse.y * 0.4;
        updateTrail();

        world.rotation.y = t * 0.02 + mouse.x * 0.08 + scrollProgress * 1.6;
        world.rotation.x = mouse.y * 0.06 + scrollProgress * 0.6;

        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }

    if (reduceMotion) {
        renderer.render(scene, camera);       // chỉ vẽ một khung tĩnh
    } else {
        frame();
        document.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) { clock.getDelta(); frame(); }
        });
    }
})();

/* --------------------- 1b. THẺ TÊN TREO DÂY (kéo thả) --------------------- */
/*
   Mô phỏng vật lý Verlet: dây là một chuỗi điểm nối nhau, thẻ là một đoạn cứng
   gồm 2 điểm (đầu thẻ nối với dây, đáy thẻ). Kéo thẻ bằng chuột hoặc ngón tay.
*/
(function initLanyard() {
    const wrap = document.getElementById('lanyard');
    const canvas = document.getElementById('lanyard-strap');
    const badge = document.getElementById('badge');
    if (!wrap || !canvas || !badge) return;

    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SEGMENTS = 9;      // số đoạn của dây
    const GRAVITY = 0.55;
    const DAMPING = 0.992;
    const ITERATIONS = 16;
    const MAX_SPEED = 60;

    let W = 0, H = 0, dpr = 1;
    let cardW = 230, cardL = 320, ropeLen = 170, seg = 19;
    const anchor = { x: 0, y: -20 };

    const rope = [];         // rope[0] cố định, rope[SEGMENTS] là đầu thẻ
    for (let i = 0; i <= SEGMENTS; i++) rope.push({ x: 0, y: 0, ox: 0, oy: 0 });
    const tail = { x: 0, y: 0, ox: 0, oy: 0 };   // đáy thẻ
    const top = rope[SEGMENTS];

    function measure() {
        W = wrap.clientWidth;
        H = wrap.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;

        cardW = badge.offsetWidth;
        cardL = badge.offsetHeight;
        const mobile = W < 800;
        ropeLen = mobile ? 110 : 170;
        seg = ropeLen / SEGMENTS;
        anchor.x = W * (mobile ? 0.5 : 0.78);
        anchor.y = -20;
    }

    function place(p, x, y) { p.x = p.ox = x; p.y = p.oy = y; }

    function reset() {
        for (let i = 0; i <= SEGMENTS; i++) place(rope[i], anchor.x, anchor.y + seg * i);
        place(tail, anchor.x, top.y + cardL);
        if (!reduceMotion) tail.x += 80;   // lệch một chút để thẻ tự đung đưa khi vừa tải trang
    }

    function solve(a, b, len, aFixed) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - len) / dist;
        if (aFixed) {
            b.x -= dx * diff;
            b.y -= dy * diff;
        } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
        }
    }

    function integrate(p) {
        let vx = (p.x - p.ox) * DAMPING;
        let vy = (p.y - p.oy) * DAMPING;
        vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
        vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vy));
        p.ox = p.x;
        p.oy = p.y;
        p.x += vx;
        p.y += vy + GRAVITY;
    }

    /* Kéo thả */
    let dragging = false;
    let grabT = 0;                     // vị trí nắm trên thẻ: 0 = đầu thẻ, 1 = đáy thẻ
    const pointer = { x: 0, y: 0 };

    function setPointer(e) {
        const r = wrap.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
    }

    badge.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        badge.setPointerCapture(e.pointerId);
        dragging = true;
        badge.classList.add('dragging', 'touched');
        setPointer(e);

        const vx = tail.x - top.x, vy = tail.y - top.y;
        const len2 = vx * vx + vy * vy || 1;
        grabT = Math.max(0, Math.min(1, ((pointer.x - top.x) * vx + (pointer.y - top.y) * vy) / len2));
    });

    badge.addEventListener('pointermove', (e) => { if (dragging) setPointer(e); });

    function endDrag() {
        dragging = false;
        badge.classList.remove('dragging');
    }
    badge.addEventListener('pointerup', endDrag);
    badge.addEventListener('pointercancel', endDrag);

    function applyDrag() {
        const gx = top.x + (tail.x - top.x) * grabT;
        const gy = top.y + (tail.y - top.y) * grabT;
        const dx = pointer.x - gx, dy = pointer.y - gy;
        const scale = 0.6 / ((1 - grabT) * (1 - grabT) + grabT * grabT);
        top.x += dx * (1 - grabT) * scale;
        top.y += dy * (1 - grabT) * scale;
        tail.x += dx * grabT * scale;
        tail.y += dy * grabT * scale;
    }

    /* Một bước mô phỏng */
    function step() {
        for (let i = 1; i <= SEGMENTS; i++) integrate(rope[i]);
        integrate(tail);

        if (dragging) applyDrag();

        for (let k = 0; k < ITERATIONS; k++) {
            rope[0].x = anchor.x;
            rope[0].y = anchor.y;
            for (let i = 0; i < SEGMENTS; i++) solve(rope[i], rope[i + 1], seg, i === 0);
            solve(top, tail, cardL, false);
        }

        // giữ mọi điểm trong khung hiển thị
        for (let i = 1; i <= SEGMENTS; i++) clamp(rope[i]);
        clamp(tail);
    }

    function clamp(p) {
        p.x = Math.max(10, Math.min(W - 10, p.x));
        p.y = Math.max(-60, Math.min(H - 12, p.y));
    }

    /* Vẽ dây + đặt thẻ */
    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        ctx.beginPath();
        ctx.moveTo(rope[0].x, rope[0].y);
        for (let i = 1; i < SEGMENTS; i++) {
            const mx = (rope[i].x + rope[i + 1].x) / 2;
            const my = (rope[i].y + rope[i + 1].y) / 2;
            ctx.quadraticCurveTo(rope[i].x, rope[i].y, mx, my);
        }
        ctx.lineTo(top.x, top.y);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.strokeStyle = '#1a1442';
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, .4)';   // đường chỉ may giữa dây
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(-(tail.x - top.x), tail.y - top.y);
        badge.style.transform =
            `translate3d(${top.x - cardW / 2}px, ${top.y}px, 0) rotate(${angle}rad)`;
    }

    /* Vòng lặp: bước cố định 60Hz, chỉ chạy khi khu vực thẻ đang hiện */
    let visible = true;
    let last = performance.now();
    let acc = 0;
    let rafId = 0;

    function loop(now) {
        acc += Math.min(now - last, 50);
        last = now;
        while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
        draw();
        rafId = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    }

    function start() {
        if (rafId) return;
        last = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
    }).observe(wrap);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

    window.addEventListener('resize', () => { measure(); });

    measure();
    reset();
    draw();
    start();
})();

/* --------------------- 2. HEADER & MENU --------------------- */
const header = document.getElementById('header');
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-list');
const navLinks = document.querySelectorAll('.nav__link');

function setMenu(open) {
    navMenu.classList.toggle('nav__list--active', open);
    navToggle.setAttribute('aria-expanded', String(open));
}

navToggle.addEventListener('click', () => {
    setMenu(!navMenu.classList.contains('nav__list--active'));
});
navLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

/* Đổi nền header khi cuộn + đánh dấu mục đang xem */
const sections = document.querySelectorAll('main section[id]');

function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 20);

    const pos = window.scrollY + window.innerHeight * 0.35;
    let currentId = '';
    sections.forEach(s => { if (pos >= s.offsetTop) currentId = s.id; });

    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
    });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* --------------------- 3. SAO CHÉP ID (WeChat, Discord...) --------------------- */
const copyToast = document.getElementById('copy-toast');
let copyTimer;

document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        const name = btn.querySelector('.social__name').textContent;
        let ok = true;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            ok = false;
        }
        copyToast.style.color = ok ? '' : '#f87171';
        copyToast.textContent = ok
            ? `Đã sao chép ID ${name}: ${text}`
            : `Không sao chép tự động được. ID ${name} của mình là: ${text}`;
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { copyToast.textContent = ''; }, 4000);
    });
});

/* --------------------- 4. FORM LIÊN HỆ (Formspree) --------------------- */
/*
   1. Đăng ký miễn phí tại https://formspree.io và tạo form mới.
   2. Copy ID của form (dạng "xyzabcde").
   3. Trong index.html, thay {your_form_id} trong action của form bằng ID đó.
*/
const contactForm = document.getElementById('contact-form');
const formStatus = document.getElementById('form-status');

function showStatus(message, type) {
    formStatus.textContent = message;
    formStatus.className = `form__status ${type}`.trim();
}

contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (contactForm.action.includes('{your_form_id}') || contactForm.action.includes('%7Byour_form_id%7D')) {
        showStatus('Form chưa được cấu hình: hãy thay {your_form_id} trong index.html.', 'error');
        return;
    }

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    showStatus('Đang gửi...', '');

    try {
        const response = await fetch(contactForm.action, {
            method: 'POST',
            body: new FormData(contactForm),
            headers: { Accept: 'application/json' }
        });

        if (response.ok) {
            showStatus('Cảm ơn bạn! Tin nhắn đã được gửi.', 'success');
            contactForm.reset();
        } else {
            showStatus('Không gửi được tin nhắn. Vui lòng thử lại sau.', 'error');
        }
    } catch (err) {
        console.error('Lỗi gửi form:', err);
        showStatus('Lỗi kết nối. Kiểm tra mạng và thử lại.', 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

/* Năm ở footer */
document.getElementById('year').textContent = new Date().getFullYear();