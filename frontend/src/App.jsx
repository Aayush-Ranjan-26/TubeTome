import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { animate, stagger } from 'animejs';
import * as THREE from 'three';
import { useAuth, logImportHistory } from './useAuth';

/* ═══════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════ */
const IconImport = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const IconLink = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
);
const IconCopy = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const IconCheck = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const IconBot = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>
);
const IconMaximize = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
);
const IconMinimize = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
);

/* ═══════════════════════════════════════════════════════
   TUBETOME LOGO SVG
   ═══════════════════════════════════════════════════════ */
function TubeTomeLogo({ size = 48, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={className} fill="none">
            <rect x="15" y="20" width="70" height="65" rx="6" fill="#1a0000" stroke="#ff0000" strokeWidth="2.5" />
            <line x1="50" y1="20" x2="50" y2="85" stroke="#ff0000" strokeWidth="1.5" opacity="0.4" />
            <line x1="22" y1="35" x2="45" y2="35" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="22" y1="45" x2="45" y2="45" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="22" y1="55" x2="45" y2="55" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="55" y1="35" x2="78" y2="35" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="55" y1="45" x2="78" y2="45" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="55" y1="55" x2="78" y2="55" stroke="#330000" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="50" cy="45" r="18" fill="#ff0000" opacity="0.9" />
            <polygon points="44,36 44,54 60,45" fill="#000" />
        </svg>
    );
}

/* ═══════════════════════════════════════════════════════
   THREE.JS ENHANCED BACKGROUND
   500 particles + wireframes + shooting stars + nebula + orbital ring + mouse parallax
   ═══════════════════════════════════════════════════════ */
function ThreeBackground() {
    const mountRef = useRef(null);

    useEffect(() => {
        if (!mountRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 30;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);

        // ── Main particles (500) ──
        const particleCount = 500;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
            const isRed = Math.random() > 0.5;
            const brightness = 0.5 + Math.random() * 0.5;
            colors[i * 3] = isRed ? brightness : 0.15 + Math.random() * 0.15;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        }

        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const pMat = new THREE.PointsMaterial({
            size: 0.15, vertexColors: true, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, sizeAttenuation: true,
        });
        const pts = new THREE.Points(pGeo, pMat);
        scene.add(pts);

        // ── Wireframes (10) ──
        const wireframes = [];
        const geoTypes = [
            new THREE.IcosahedronGeometry(1.5, 0),
            new THREE.OctahedronGeometry(1.2, 0),
            new THREE.TetrahedronGeometry(1, 0),
            new THREE.DodecahedronGeometry(1.3, 0),
        ];
        for (let i = 0; i < 10; i++) {
            const geo = geoTypes[i % geoTypes.length];
            const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0.8 + Math.random() * 0.2, Math.random() * 0.05, 0),
                wireframe: true, transparent: true, opacity: 0.1 + Math.random() * 0.1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 35);
            mesh.userData = {
                rx: (Math.random() - 0.5) * 0.01, ry: (Math.random() - 0.5) * 0.01,
                floatSpeed: Math.random() * 0.004 + 0.001, floatOff: Math.random() * Math.PI * 2,
                driftX: (Math.random() - 0.5) * 0.003, driftZ: (Math.random() - 0.5) * 0.002,
            };
            scene.add(mesh);
            wireframes.push(mesh);
        }

        // ── Shooting stars ──
        const shootingStars = [];
        function createShootingStar() {
            const startX = (Math.random() - 0.5) * 80;
            const startY = 30 + Math.random() * 20;
            const startZ = (Math.random() - 0.5) * 30;
            const lineGeo = new THREE.BufferGeometry();
            const linePos = new Float32Array([startX, startY, startZ, startX, startY, startZ]);
            lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
            const lineMat = new THREE.LineBasicMaterial({
                color: 0xff3333, transparent: true, opacity: 0.8,
                blending: THREE.AdditiveBlending,
            });
            const line = new THREE.Line(lineGeo, lineMat);
            line.userData = {
                vx: (Math.random() - 0.5) * 0.8,
                vy: -(Math.random() * 0.6 + 0.3),
                vz: (Math.random() - 0.5) * 0.3,
                life: 1, decay: Math.random() * 0.015 + 0.008,
                tailLen: Math.random() * 3 + 1.5,
            };
            scene.add(line);
            shootingStars.push(line);
        }

        // ── Pulsing nebula ──
        const nebulaGeo = new THREE.SphereGeometry(5, 16, 16);
        const nebulaMat = new THREE.MeshBasicMaterial({
            color: 0xff0000, transparent: true, opacity: 0.03,
            blending: THREE.AdditiveBlending, side: THREE.BackSide,
        });
        const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
        scene.add(nebula);

        // ── Orbital ring ──
        const ringGeo = new THREE.TorusGeometry(18, 0.05, 8, 100);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff0000, transparent: true, opacity: 0.08,
            blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI * 0.45;
        scene.add(ring);

        // ── Mouse parallax ──
        let mouseX = 0, mouseY = 0;
        const handleMouse = (e) => {
            mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        };
        window.addEventListener('mousemove', handleMouse);

        let time = 0;
        const animateScene = () => {
            time += 0.01;

            // Camera parallax
            camera.position.x += (mouseX * 3 - camera.position.x) * 0.02;
            camera.position.y += (-mouseY * 2 - camera.position.y) * 0.02;
            camera.lookAt(0, 0, 0);

            // Particles rotation + twinkle
            pts.rotation.y += 0.0004;
            pts.rotation.x += 0.0001;
            const posArr = pGeo.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                posArr[i * 3 + 1] += Math.sin(time * 2 + i) * 0.003;
            }
            pGeo.attributes.position.needsUpdate = true;

            // Wireframes drift + rotate
            wireframes.forEach(w => {
                w.rotation.x += w.userData.rx;
                w.rotation.y += w.userData.ry;
                w.position.y += Math.sin(time + w.userData.floatOff) * w.userData.floatSpeed;
                w.position.x += w.userData.driftX;
                w.position.z += w.userData.driftZ;
                if (Math.abs(w.position.x) > 40) w.userData.driftX *= -1;
                if (Math.abs(w.position.z) > 25) w.userData.driftZ *= -1;
            });

            // Shooting stars
            if (Math.random() < 0.02 && shootingStars.length < 5) createShootingStar();
            for (let i = shootingStars.length - 1; i >= 0; i--) {
                const s = shootingStars[i];
                const pos = s.geometry.attributes.position.array;
                pos[3] += s.userData.vx; pos[4] += s.userData.vy; pos[5] += s.userData.vz;
                const dx = pos[3] - pos[0], dy = pos[4] - pos[1], dz = pos[5] - pos[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > s.userData.tailLen) {
                    const ratio = s.userData.tailLen / dist;
                    pos[0] = pos[3] - dx * ratio;
                    pos[1] = pos[4] - dy * ratio;
                    pos[2] = pos[5] - dz * ratio;
                }
                s.geometry.attributes.position.needsUpdate = true;
                s.userData.life -= s.userData.decay;
                s.material.opacity = Math.max(0, s.userData.life * 0.8);
                if (s.userData.life <= 0) {
                    scene.remove(s); s.geometry.dispose(); s.material.dispose();
                    shootingStars.splice(i, 1);
                }
            }

            // Nebula pulse
            nebula.scale.setScalar(1 + Math.sin(time * 0.8) * 0.3);
            nebulaMat.opacity = 0.02 + Math.sin(time * 0.5) * 0.015;

            // Orbital ring rotation
            ring.rotation.z += 0.002;
            ringMat.opacity = 0.06 + Math.sin(time) * 0.03;

            renderer.render(scene, camera);
            requestAnimationFrame(animateScene);
        };
        animateScene();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouse);
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    return <div ref={mountRef} className="three-bg" />;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
// In production (Vercel), the backend is on a different domain (Render).
// VITE_API_URL is set in Vercel's environment variables dashboard.
// In local dev, this is empty and Vite's proxy handles /api → localhost:3001.
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';

/**
 * Authenticated fetch: reads the current Supabase session and
 * injects the access_token as a Bearer token.
 */
async function authFetch(path, opts = {}, timeoutMs = 30000) {
    const { data: { session } } = await (await import('./supabaseClient')).supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('You must be signed in to use this feature.');

    const headers = { ...(opts.headers || {}) };
    headers['Authorization'] = `Bearer ${token}`;
    if (!headers['Content-Type'] && opts.body) headers['Content-Type'] = 'application/json';

    // Abort after timeoutMs to prevent indefinite UI hangs
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(`${API}${path}`, { ...opts, headers, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

function Linkify({ text }) {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/\S+)/g);
    return parts.map((part, i) =>
        i % 2 === 1
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="toast-link">{part}</a>
            : part
    );
}

/** Strip internal details (file paths, stack frames) from error messages shown to users. */
function sanitizeErrorForDisplay(msg) {
    if (typeof msg !== 'string') return 'An unexpected error occurred.';
    // Strip file system paths
    let clean = msg.replace(/[A-Z]:\\[^\s]*/gi, '[internal]');
    clean = clean.replace(/\/[^\s]*\.(js|ts|mjs)/gi, '[internal]');
    // Strip stack trace lines
    clean = clean.replace(/\s+at\s+.*/g, '');
    // Cap length
    return clean.substring(0, 300);
}

function filterVideos(mode, videos, specificInput = '', rangeStart = 1, rangeEnd = videos.length) {
    if (mode === 'all') return { filtered: videos, warnings: [] };

    if (mode === 'specific') {
        const tokens = specificInput.split(/[,\s]+/).filter(t => t.length > 0);
        const seen = new Set();
        const valid = [];
        const warnings = [];
        const dupes = [];
        const oob = [];
        const bad = [];

        for (const t of tokens) {
            const n = Number(t);
            if (!Number.isInteger(n)) { bad.push(t); continue; }
            if (seen.has(n)) { dupes.push(n); continue; }
            seen.add(n);
            if (n < 1 || n > videos.length) { oob.push(n); continue; }
            valid.push(n);
        }

        if (dupes.length); // silently deduplicate, no warning needed
        if (oob.length) {
            const preview = oob.slice(0, 5).join(', ');
            const suffix = oob.length > 5 ? ` …and ${oob.length - 5} more` : '';
            warnings.push(`${oob.length} out-of-range index${oob.length !== 1 ? 'es' : ''} ignored (${preview}${suffix}). Playlist has ${videos.length} videos.`);
        }
        if (bad.length) {
            const preview = bad.slice(0, 5).join(', ');
            const suffix = bad.length > 5 ? ` …and ${bad.length - 5} more` : '';
            warnings.push(`${bad.length} invalid item${bad.length !== 1 ? 's' : ''} ignored (${preview}${suffix}).`);
        }
        if (valid.length === 0 && tokens.length > 0) warnings.push(`No valid indices (playlist has ${videos.length} videos).`);

        return { filtered: valid.map(n => videos[n - 1]), warnings };
    }

    if (mode === 'range') {
        let start = rangeStart, end = rangeEnd;
        const warnings = [];

        if (start > end) {
            warnings.push(`Start (${start}) > End (${end}), swapped.`);
            [start, end] = [end, start];
        }

        const origStart = start, origEnd = end;
        start = Math.max(1, start);
        end = Math.min(videos.length, end);
        const clippedCount = Math.max(0, (origEnd - origStart + 1) - (end - start + 1));
        if (clippedCount > 0) warnings.push(`Range clipped to ${start}\u2013${end} (${clippedCount} out-of-range index${clippedCount !== 1 ? 'es' : ''} ignored). Playlist has ${videos.length} videos.`);
        if (start > end) {
            warnings.push(`Range entirely outside playlist bounds.`);
            return { filtered: [], warnings };
        }

        return { filtered: videos.slice(start - 1, end), warnings };
    }

    return { filtered: videos, warnings: [] };
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════ */
export default function App() {
    const { user, profile, loading: authLoading, signIn, signOut, refreshSession } = useAuth();
    const [playlistUrl, setPlaylistUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [videos, setVideos] = useState([]);
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState(-1);
    const [showConsent, setShowConsent] = useState(false);
    const [consentGiven, setConsentGiven] = useState(
        () => localStorage.getItem('tubetome-consent') === 'yes'
    );
    const [playlistExpanded, setPlaylistExpanded] = useState(false);
    const [importMode, setImportMode] = useState('notebook');
    const [setupLoading, setSetupLoading] = useState(false);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [selectionMode, setSelectionMode] = useState('all');
    const [specificInput, setSpecificInput] = useState('');
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    const [selectionWarnings, setSelectionWarnings] = useState([]);
    const [warningsExpanded, setWarningsExpanded] = useState(false);

    const headerRef = useRef(null);
    const formRef = useRef(null);
    const resultsRef = useRef(null);

    const { selectedVideos, warnings: localWarnings } = useMemo(() => {
        if (videos.length === 0) return { selectedVideos: [], warnings: [] };
        if (selectionMode === 'range' && (rangeStart === '' || rangeEnd === '')) {
            return { selectedVideos: [], warnings: [] };
        }
        const rStart = selectionMode === 'range' ? (parseInt(rangeStart, 10) || 0) : 1;
        const rEnd = selectionMode === 'range' ? (parseInt(rangeEnd, 10) || 0) : videos.length;
        const { filtered, warnings } = filterVideos(selectionMode, videos, specificInput, rStart, rEnd);
        return { selectedVideos: filtered, warnings };
    }, [videos, selectionMode, specificInput, rangeStart, rangeEnd]);

    // Update displayed warnings when local parsing changes
    useEffect(() => {
        setSelectionWarnings(localWarnings);
        setWarningsExpanded(false);
    }, [localWarnings]);

    // Entrance animations
    useEffect(() => {
        if (headerRef.current) animate(headerRef.current, { opacity: [0, 1], translateY: [-30, 0], duration: 800, easing: 'easeOutExpo' });
        if (formRef.current) animate(formRef.current, { opacity: [0, 1], translateY: [30, 0], duration: 600, delay: 400, easing: 'easeOutExpo' });
    }, []);

    // Animate results
    useEffect(() => {
        if (resultsRef.current && videos.length > 0) {
            animate(resultsRef.current, { opacity: [0, 1], translateY: [20, 0], duration: 500, easing: 'easeOutExpo' });
            animate('.video-item', { opacity: [0, 1], translateX: [-20, 0], delay: stagger(40, { start: 100 }), duration: 400, easing: 'easeOutQuad' });
        }
    }, [videos.length]);



    // Supabase Google OAuth sign-in
    const handleSupabaseSignIn = useCallback(async () => {
        try { await signIn(); }
        catch (err) { setError(sanitizeErrorForDisplay(err.message)); }
    }, [signIn]);

    // Manual session refresh fallback
    const handleRefreshSession = useCallback(async () => {
        try {
            await refreshSession();
            setSuccess('Session refreshed!');
        } catch (err) { setError(sanitizeErrorForDisplay(err.message)); }
    }, [refreshSession]);

    // One-time setup: opens a visible Chrome window for Google login
    const handleSetup = useCallback(async () => {
        try {
            setSetupLoading(true); setError(''); setNeedsSetup(false);
            setProgress('Opening Chrome — please sign into Google in the window that appears...');
            const res = await authFetch('/automation/setup', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setSuccess(data.message || 'Setup complete! You can now import playlists.');
            } else {
                throw new Error(data.error || 'Setup failed.');
            }
        } catch (err) {
            setError(sanitizeErrorForDisplay(err.message));
        } finally {
            setSetupLoading(false); setProgress('');
        }
    }, []);

    const runImport = useCallback(async () => {
        if (selectionMode === 'range') {
            const s = parseInt(rangeStart, 10);
            const e = parseInt(rangeEnd, 10);
            if (rangeStart.trim() === '' || rangeEnd.trim() === '' || isNaN(s) || isNaN(e) || s < 1 || e < 1) {
                setError('Enter a valid input — both start and end must be positive numbers.');
                return;
            }
        }
        try {
            setLoading(true); setError(''); setSelectionWarnings([]);
            setProgress('1/2: Fetching playlist videos...');
            const ytRes = await authFetch('/playlist', {
                method: 'POST',
                body: JSON.stringify({ url: playlistUrl }),
            });
            if (!ytRes.ok) { const d = await ytRes.json().catch(() => ({})); throw new Error(d.error || 'Failed to fetch playlist.'); }

            const ytData = await ytRes.json();
            const allVids = ytData.videos || [];
            setVideos(allVids);

            // Determine effective mode — fallback to 'all' if input is empty
            let effectiveMode = selectionMode;
            let selInput = '';
            if (selectionMode === 'specific') {
                if (specificInput.trim()) {
                    selInput = specificInput.trim();
                } else {
                    effectiveMode = 'all'; // empty input → import all
                }
            } else if (selectionMode === 'range') {
                selInput = `${parseInt(rangeStart)}-${parseInt(rangeEnd)}`;
            }

            // Filter locally using fresh data
            const { filtered: toImport, warnings: filterWarns } = filterVideos(
                effectiveMode, allVids, selInput, parseInt(rangeStart) || 1, parseInt(rangeEnd) || allVids.length
            );
            // Only show warnings for real errors (OOB, unparsable)
            if (filterWarns.length > 0) setSelectionWarnings(filterWarns);

            if (importMode === 'links') {
                const count = toImport.length;
                setSuccess(`Extracted ${count} video link${count !== 1 ? 's' : ''}!`);
                setLoading(false); setProgress('');
                return;
            }

            // ── Import to NotebookLM ──
            if (toImport.length === 0) {
                throw new Error('No valid videos selected. Please check your selection input.');
            }

            setProgress(`2/2: Importing ${toImport.length} of ${allVids.length} videos to NotebookLM...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            let res;
            try {
                res = await authFetch('/automation/import-playlist', {
                    method: 'POST',
                    body: JSON.stringify({
                        playlistUrl,
                        selectedLinks: toImport.map(v => v.url),
                        selectionMode: effectiveMode,
                        selectionInput: selInput,
                    }),
                    signal: controller.signal,
                });
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    throw new Error('Import timed out after 2 minutes. The background process may still be running — try again or check the backend logs.');
                }
                throw fetchErr;
            } finally {
                clearTimeout(timeoutId);
            }

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                if (d.code === 'NEEDS_SETUP') {
                    setNeedsSetup(true);
                    throw new Error('First-time setup required: click "Setup NotebookLM" below to sign into Google once. After that, imports will run silently in the background.');
                }
                if (d.warnings?.length > 0) setSelectionWarnings(d.warnings);
                throw new Error(`Automation error: ${d.message || 'Failed or timed out.'}`);
            }

            const resData = await res.json();
            if (resData.warnings?.length > 0) setSelectionWarnings(resData.warnings);
            const nbUrl = resData.notebookUrl || '';
            setSuccess(`✓ Notebook "${resData.createdName}" created! ${nbUrl ? 'Open it: ' + nbUrl : ''}`);
            setNeedsSetup(false);

            // Log import to Supabase history
            if (user?.id) {
                logImportHistory(user.id, playlistUrl, resData.createdName, toImport.length, effectiveMode);
            }
        } catch (err) {
            if (err.message.includes('fetch') && videos.length > 0) {
                setError('The automation is taking longer than expected. It may still be running in the background.');
            } else { setError(sanitizeErrorForDisplay(err.message)); }
        } finally { setLoading(false); setProgress(''); }
    }, [playlistUrl, videos.length, importMode, selectionMode, specificInput, rangeStart, rangeEnd, user]);

    const handleImport = useCallback(async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setVideos([]);
        if (importMode === 'notebook' && !consentGiven) { setShowConsent(true); return; }
        await runImport();
    }, [playlistUrl, consentGiven, importMode, runImport]);

    const handleConsentAccept = useCallback(() => {
        localStorage.setItem('tubetome-consent', 'yes');
        setConsentGiven(true); setShowConsent(false); runImport();
    }, [runImport]);

    const handleCopyAll = useCallback(async () => {
        const toCopy = selectedVideos.length > 0 ? selectedVideos : videos;
        await copyText(toCopy.map(v => v.url).join('\n'));
        setCopiedAll(true);
        animate('.btn-outline', { scale: [1, 1.1, 1], duration: 300, easing: 'easeOutQuad' });
        setTimeout(() => setCopiedAll(false), 2000);
    }, [videos, selectedVideos]);

    const handleCopyOne = useCallback(async (url, idx) => {
        await copyText(url); setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(-1), 1500);
    }, []);



    const toggleExpand = useCallback(() => {
        setPlaylistExpanded(prev => !prev);
        animate('.results', { scale: [0.98, 1], duration: 300, easing: 'easeOutQuad' });
    }, []);

    return (
        <>
            <ThreeBackground />
            <div className="container">
                {/* ── Top Bar: Logo + Auth Button ── */}
                <div className="top-bar" ref={headerRef}>
                    <div className="top-bar-left">
                        <TubeTomeLogo size={36} />
                        <span className="top-bar-title">Tube<span className="accent">Tome</span></span>
                    </div>
                    <div className="top-bar-right">
                        {user ? (
                            <button type="button" className="btn-auth-pill" onClick={signOut}>
                                {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt="" className="auth-pill-avatar" />
                                ) : null}
                                <span className="auth-pill-text">Sign out</span>
                            </button>
                        ) : !authLoading ? (
                            <button type="button" className="btn-auth-pill btn-auth-signin" onClick={handleSupabaseSignIn}>
                                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.3 15.5 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16 4 9.2 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.3C29.5 35.2 26.9 36 24 36c-5.3 0-9.8-3.5-11.3-8.3l-6.5 5C9.1 39.6 16 44 24 44z" /><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.6l6.2 5.3C36.7 39.6 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" /></svg>
                                <span className="auth-pill-text">Sign in</span>
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* ── Hero ── */}
                <header className="header">
                    <h1>Tube<span className="accent">Tome</span></h1>
                    <p className="subtitle">Import YouTube playlists directly to NotebookLM</p>
                </header>

                {error && <div className="toast toast-error" role="alert">{error}</div>}
                {success && <div className="toast toast-success" role="status"><Linkify text={success} /></div>}

                {/* Setup button — shown when NotebookLM needs initial Google login */}
                {needsSetup && (
                    <div className="toast toast-warning" style={{ textAlign: 'center' }}>
                        <p style={{ margin: '0 0 12px' }}>
                            <strong>One-time setup needed:</strong> A Chrome window will open for you to sign into Google. After this, all imports run silently in the background.
                        </p>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSetup}
                            disabled={setupLoading}
                            style={{ minWidth: '200px' }}
                        >
                            <IconBot /> {setupLoading ? 'Setting up…' : 'Setup NotebookLM'}
                        </button>
                    </div>
                )}

                {/* Setup/import progress */}
                {(progress || setupLoading) && (
                    <div className="toast" style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {progress}
                    </div>
                )}

                {selectionWarnings.length > 0 && (
                    <div className="toast toast-warning" role="status">
                        <div className="warning-header" onClick={() => setWarningsExpanded(prev => !prev)}>
                            <strong>⚠ Selection Warning{selectionWarnings.length !== 1 ? 's' : ''}</strong>
                            <button type="button" className="warning-toggle-btn" aria-label="Toggle warnings">
                                {warningsExpanded ? '▲ Collapse' : '▼ Expand'}
                            </button>
                        </div>
                        <div className={`warning-content ${warningsExpanded ? 'warning-expanded' : 'warning-collapsed'}`}>
                            <ul className="warning-list">
                                {selectionWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    </div>
                )}

                {/* ── Import Form ── */}
                <form onSubmit={handleImport} className="card glass" ref={formRef}>
                    <div className="form-group">
                        <label htmlFor="url">YouTube Playlist URL</label>
                        <input type="url" id="url" required value={playlistUrl}
                            onChange={e => setPlaylistUrl(e.target.value)}
                            placeholder="https://www.youtube.com/playlist?list=..." />
                    </div>

                    {/* Mode Toggle */}
                    <div className="mode-toggle">
                        <button type="button" className={`mode-btn ${importMode === 'links' ? 'mode-active' : ''}`}
                            onClick={() => setImportMode('links')}>
                            <IconLink /> Extract Links Only
                        </button>
                        <button type="button" className={`mode-btn ${importMode === 'notebook' ? 'mode-active' : ''}`}
                            onClick={() => setImportMode('notebook')}>
                            <IconImport /> Import to NotebookLM
                        </button>
                    </div>

                    {/* Video Selection (always visible in both modes) */}
                    <div className="selection-panel">
                        <label>Select Videos</label>
                        <div className="selection-tabs">
                            <button type="button" className={`sel-tab ${selectionMode === 'all' ? 'sel-active' : ''}`}
                                onClick={() => setSelectionMode('all')}>All Videos</button>
                            <button type="button" className={`sel-tab ${selectionMode === 'specific' ? 'sel-active' : ''}`}
                                onClick={() => setSelectionMode('specific')}>Specific Numbers</button>
                            <button type="button" className={`sel-tab ${selectionMode === 'range' ? 'sel-active' : ''}`}
                                onClick={() => setSelectionMode('range')}>Range</button>
                        </div>

                        {selectionMode === 'specific' && (
                            <div className="selection-input-group">
                                <input type="text" value={specificInput}
                                    onChange={e => setSpecificInput(e.target.value)}
                                    placeholder="Enter video numbers: 2, 5, 3, 6, 7, 45, 23"
                                    maxLength={5000}
                                    className="sel-input" />
                                <p className="sel-hint">Comma-separated video serial numbers (1-based)</p>
                            </div>
                        )}

                        {selectionMode === 'range' && (
                            <div className="selection-input-group range-inputs">
                                <div className="range-field">
                                    <label>From video #</label>
                                    <input type="text" inputMode="numeric" pattern="[0-9]*"
                                        value={rangeStart}
                                        placeholder="Start"
                                        maxLength={7}
                                        onChange={e => {
                                            const v = e.target.value.replace(/[^0-9]/g, '');
                                            setRangeStart(v);
                                        }} />
                                </div>
                                <span className="range-dash">—</span>
                                <div className="range-field">
                                    <label>To video #</label>
                                    <input type="text" inputMode="numeric" pattern="[0-9]*"
                                        value={rangeEnd}
                                        placeholder="End"
                                        maxLength={7}
                                        onChange={e => {
                                            const v = e.target.value.replace(/[^0-9]/g, '');
                                            setRangeEnd(v);
                                        }} />
                                </div>
                            </div>
                        )}

                        {videos.length > 0 && selectionMode !== 'all' && (
                            <p className="sel-count">{selectedVideos.length} of {videos.length} videos selected</p>
                        )}
                    </div>

                    <button type="submit" className="btn-primary"
                        disabled={loading || !playlistUrl}>
                        {loading ? (
                            <><span className="spinner" aria-hidden="true" />{progress || 'Processing…'}</>
                        ) : importMode === 'links' ? (
                            <><IconLink /> Extract Links</>
                        ) : (
                            <><IconImport /> Import to NotebookLM</>
                        )}
                    </button>
                </form>

                {/* ── Results ── */}
                {videos.length > 0 && (
                    <section className={`results card glass ${playlistExpanded ? 'results-expanded' : ''}`}
                        ref={resultsRef} aria-label="Playlist videos">
                        <div className="results-header">
                            <h3>
                                {selectedVideos.length === videos.length
                                    ? `${videos.length} Video${videos.length !== 1 ? 's' : ''}`
                                    : `${selectedVideos.length} of ${videos.length} Videos Selected`}
                            </h3>
                            <div className="results-actions">
                                <button type="button" className="btn-outline" onClick={handleCopyAll}>
                                    {copiedAll ? <IconCheck /> : <IconCopy />}
                                    {copiedAll ? 'Copied!' : 'Copy All Links'}
                                </button>
                                <button type="button" className="btn-icon expand-btn" onClick={toggleExpand}
                                    title={playlistExpanded ? 'Minimize' : 'Maximize'}>
                                    {playlistExpanded ? <IconMinimize /> : <IconMaximize />}
                                </button>
                            </div>
                        </div>
                        <div className="video-list">
                            {selectedVideos.map((vid, i) => {
                                const originalIndex = videos.indexOf(vid) + 1;
                                return (
                                    <div key={vid.url} className="video-item">
                                        <span className="video-num">{originalIndex}</span>
                                        {vid.thumbnail && (
                                            <img src={vid.thumbnail} alt="" className="video-thumb" loading="lazy" />
                                        )}
                                        <div className="video-info">
                                            <p className="video-title">{vid.title}</p>
                                            <a href={vid.url} target="_blank" rel="noopener noreferrer" className="video-url">{vid.url}</a>
                                        </div>
                                        <button type="button" className="btn-icon" onClick={() => handleCopyOne(vid.url, i)}
                                            aria-label={`Copy link for ${vid.title}`} title="Copy link">
                                            {copiedIdx === i ? <IconCheck /> : <IconCopy />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* ── Consent Modal ── */}
                {showConsent && (
                    <div className="modal-overlay" role="dialog" aria-modal="true">
                        <div className="modal glass">
                            <h3>Before we begin</h3>
                            <p>TubeTome will run a background browser session to interact with NotebookLM and add your playlist videos as sources.</p>
                            <ul>
                                <li>First time only: a Chrome window will briefly open so you can sign into Google.</li>
                                <li>After that, all imports run silently in the background.</li>
                                <li>No data is sent to third parties.</li>
                            </ul>
                            <div className="modal-actions">
                                <button type="button" className="btn-outline" onClick={() => setShowConsent(false)}>Cancel</button>
                                <button type="button" className="btn-primary" onClick={handleConsentAccept}>I understand and continue</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
