import React, { useEffect, useMemo, useRef } from 'react';
import * as Matter from 'matter-js';
import type { Note } from '../types';
import { loadAllProjects, loadImage, loadSketch } from '../utils/persistence/storage';
import { parseNoteContent } from '../utils';
import { getThemeChromeForegroundHex } from '../utils/theme/themeChrome';

type SpawnKind = 'emoji' | 'label' | 'project' | 'photo' | 'sketch';

export type HomePhysicsPlaygroundProps = {
  /** 稳定主页才启用；false 时不挂载任何监听器 */
  enabled: boolean;
  /** 彩蛋模式：生成 START/YOUR/MAPPING 3 个刚体并加重重力 */
  easterEggMode?: boolean;
  /** 彩蛋重力（engine.gravity.y） */
  gravityY?: number;
  /** 鼠标拖拽约束刚度（Constraint.stiffness） */
  mouseConstraintStiffness?: number;
  /** 可选：用项目名做随机素材 */
  projectNames?: string[];
  /** 主题色（用于描边/点缀） */
  themeColor?: string;
};

type BodyMeta =
  | { kind: 'emoji'; text: string }
  | { kind: 'label'; text: string }
  | { kind: 'project'; text: string }
  | { kind: 'hero'; text: string }
  | { kind: 'photo'; src: string | null }
  | { kind: 'sketch'; src: string | null };

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export const HomePhysicsPlayground: React.FC<HomePhysicsPlaygroundProps> = ({
  enabled,
  easterEggMode = false,
  gravityY = 1.35,
  mouseConstraintStiffness = 0.18,
  projectNames = [],
  themeColor = '#3B82F6'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metaByBodyIdRef = useRef<Map<number, BodyMeta>>(new Map());

  const spawnCandidates = useMemo(() => {
    const emojis = ['🗺️', '📌', '🧠', '✨', '🧩', '📎', '📍', '📝', '📷', '🌈', '🛰️', '🧱'];
    const labels = ['hello', 'drag me', 'mapping', 'note', 'idea', 'tag', 'frame', 'graph', 'board'];
    const projects = projectNames.filter(Boolean);
    return { emojis, labels, projects };
  }, [projectNames]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const {
      Engine,
      World,
      Bodies,
      Body,
      Composite,
      Constraint,
      Vector
    } = Matter;

    const engine = Engine.create();
    engine.gravity.y = easterEggMode ? gravityY : 0.9;

    const world = engine.world;

    let raf = 0;
    let lastT = performance.now();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 从真实便签数据抽取随机记录（emoji / tag label / 图片 / 涂鸦）
    // - 先加载项目结构（不加载图片）：loadAllProjects(false)
    // - 点击生成图片/涂鸦时再按需 loadImage/loadSketch
    let notePool: Note[] = [];
    let notePoolLoading = false;
    const ensureNotePool = async () => {
      if (notePoolLoading || notePool.length > 0) return;
      notePoolLoading = true;
      try {
        const projects = await loadAllProjects(false);
        const notes = projects.flatMap((p) => p.notes || []);
        const usable = notes.filter(
          (n) =>
            !!n.emoji ||
            (n.text || '').trim().length > 0 ||
            (n.images?.length ?? 0) > 0 ||
            !!n.sketch
        );
        // 限制池子规模，避免大项目拖慢/占用过多内存
        notePool = usable.length > 250 ? usable.slice(0, 250) : usable;
      } catch (err) {
        console.error('[HomePhysicsPlayground] Failed to load note pool', err);
      } finally {
        notePoolLoading = false;
      }
    };

    // 按需加载 media 的缓存（减少重复读取 IndexedDB）
    const imageDataCache = new Map<string, string>(); // img-* -> base64 data url
    const sketchDataCache = new Map<string, string>(); // img-* -> base64 data url

    // drawImage 需要 HTMLImageElement；缓存避免重复 new Image()
    const imageElCache = new Map<string, HTMLImageElement>();
    const getImageEl = (src: string) => {
      let img = imageElCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        imageElCache.set(src, img);
      }
      return img;
    };

    const clearNonBoundaryBodies = () => {
      const bodies = Composite.allBodies(world).filter((b) => !(b as any).isBoundary);
      if (!bodies.length) return;
      for (const b of bodies) metaByBodyIdRef.current.delete(b.id);
      Composite.remove(world, bodies);
    };

    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rebuild boundary walls on resize
      Composite.remove(world, Composite.allBodies(world).filter((b) => (b as any).isBoundary));
      const t = 80;
      const walls = [
        Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, { isStatic: true }),
        Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, { isStatic: true }),
        Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, { isStatic: true }),
        Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, { isStatic: true })
      ];
      for (const wall of walls) {
        (wall as any).isBoundary = true;
      }
      World.add(world, walls);
    };

    resize();
    window.addEventListener('resize', resize);

    const isLarge = typeof window !== 'undefined' && window.innerWidth >= 768;
    // Tailwind：text-6xl(60px) / md:text-8xl(96px)
    const computedHeroFontPx = isLarge ? 96 : 60;

    const spawnAt = (x: number, y: number) => {
      const angle = (Math.random() - 0.5) * 0.8;
      const vx = (Math.random() - 0.5) * 8;
      const vy = -Math.random() * 2;
      const av = (Math.random() - 0.5) * 0.08;

      const w = window.innerWidth;

      const spawnFallback = () => {
        const kindRoll = Math.random();
        const kind: SpawnKind =
          kindRoll < 0.45 ? 'emoji' : kindRoll < 0.8 ? 'label' : 'project';

        if (kind === 'emoji') {
          const r = 28;
          const body = Bodies.circle(x, y, r, {
            restitution: 0.6,
            friction: 0.2,
            frictionAir: 0.01,
            density: 0.001
          });
          Body.setAngle(body, angle);
          Body.setAngularVelocity(body, av);
          Body.setVelocity(body, { x: vx, y: vy });
          metaByBodyIdRef.current.set(body.id, { kind: 'emoji', text: pick(spawnCandidates.emojis) });
          World.add(world, body);
          return;
        }

        const text =
          kind === 'project'
            ? (spawnCandidates.projects.length ? pick(spawnCandidates.projects) : pick(spawnCandidates.labels))
            : pick(spawnCandidates.labels);

        const isProject = kind === 'project';
        const fontPx = isProject ? 26 : 24;
        ctx.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
        const baseW = Math.max(1, ctx.measureText(text).width);
        const baseH = fontPx;
        const body = Bodies.rectangle(x, y, baseW, baseH, {
          restitution: 0.5,
          friction: 0.15,
          frictionAir: 0.015,
          density: 0.0012
        });
        Body.setAngle(body, angle);
        Body.setAngularVelocity(body, av);
        Body.setVelocity(body, { x: vx, y: vy });
        metaByBodyIdRef.current.set(body.id, { kind, text });
        World.add(world, body);

        // Bias spawn slightly away from edges
        if (x < 120) Body.applyForce(body, body.position, { x: 0.01, y: 0 });
        if (x > w - 120) Body.applyForce(body, body.position, { x: -0.01, y: 0 });
      };

      // 如果 notePool 已经准备好，就从真实便签记录里生成
      if (notePool.length > 0) {
        const note = pick(notePool);

        const options: SpawnKind[] = [];
        if (note.emoji) options.push('emoji');
        if ((note.text || '').trim().length > 0) options.push('label');
        if ((note.images?.length ?? 0) > 0) options.push('photo');
        if (note.sketch) options.push('sketch');

        const pickedKind = options.length ? pick(options) : null;
        if (!pickedKind) return spawnFallback();

        if (pickedKind === 'emoji') {
          const r = 28;
          const body = Bodies.circle(x, y, r, {
            restitution: 0.6,
            friction: 0.2,
            frictionAir: 0.01,
            density: 0.001
          });
          Body.setAngle(body, angle);
          Body.setAngularVelocity(body, av);
          Body.setVelocity(body, { x: vx, y: vy });
          metaByBodyIdRef.current.set(body.id, { kind: 'emoji', text: note.emoji });
          World.add(world, body);
          return;
        }

        if (pickedKind === 'label') {
          const { title } = parseNoteContent(note.text || '');
          const rawLabel = (title || note.text || '').trim().slice(0, 80) || 'label';
          const labelText = rawLabel.length > 18 ? rawLabel.slice(0, 17) + '…' : rawLabel;

          const fontPx = 24;
          ctx.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
          const baseW = Math.max(1, ctx.measureText(labelText).width);
          const baseH = fontPx;
          const body = Bodies.rectangle(x, y, baseW, baseH, {
            restitution: 0.5,
            friction: 0.15,
            frictionAir: 0.015,
            density: 0.0012
          });
          Body.setAngle(body, angle);
          Body.setAngularVelocity(body, av);
          Body.setVelocity(body, { x: vx, y: vy });
          metaByBodyIdRef.current.set(body.id, { kind: 'label', text: labelText });
          World.add(world, body);

          if (x < 120) Body.applyForce(body, body.position, { x: 0.01, y: 0 });
          if (x > w - 120) Body.applyForce(body, body.position, { x: -0.01, y: 0 });
          return;
        }

        // 图片类（photo / sketch）
        const displayW = 190;
        const displayH = 140;
        const body = Bodies.rectangle(x, y, displayW, displayH, {
          restitution: 0.45,
          friction: 0.2,
          frictionAir: 0.01,
          density: 0.0014
        });
        Body.setAngle(body, angle);
        Body.setAngularVelocity(body, av);
        Body.setVelocity(body, { x: vx, y: vy });
        if (pickedKind === 'photo') {
          metaByBodyIdRef.current.set(body.id, { kind: 'photo', src: null });
        } else {
          metaByBodyIdRef.current.set(body.id, { kind: 'sketch', src: null });
        }
        World.add(world, body);

        if (x < 120) Body.applyForce(body, body.position, { x: 0.01, y: 0 });
        if (x > w - 120) Body.applyForce(body, body.position, { x: -0.01, y: 0 });

        const bodyId = body.id;
        void (async () => {
          try {
            if (!metaByBodyIdRef.current.has(bodyId)) return;

            if (pickedKind === 'photo') {
              const imgRef = note.images && note.images.length ? pick(note.images) : null;
              if (!imgRef) return;
              let src: string | null = null;
              if (imgRef.startsWith('img-')) {
                src =
                  imageDataCache.get(imgRef) ??
                  (await loadImage(imgRef).then((v) => {
                    if (v) imageDataCache.set(imgRef, v);
                    return v;
                  }));
              } else if (imgRef.startsWith('mapp-image-')) {
                const imageId = imgRef.replace('mapp-image-', '');
                src = await loadImage(imageId);
              } else if (imgRef.startsWith('data:image/')) {
                src = imgRef;
              }
              if (!src) return;
              if (!metaByBodyIdRef.current.has(bodyId)) return;
              metaByBodyIdRef.current.set(bodyId, { kind: 'photo', src });
            } else if (pickedKind === 'sketch') {
              const skRef = note.sketch || null;
              if (!skRef) return;
              let src: string | null = null;
              if (skRef.startsWith('img-')) {
                src =
                  sketchDataCache.get(skRef) ??
                  (await loadSketch(skRef).then((v) => {
                    if (v) sketchDataCache.set(skRef, v);
                    return v;
                  }));
              } else if (skRef.startsWith('mapp-sketch-')) {
                const sketchId = skRef.replace('mapp-sketch-', '');
                src = await loadSketch(sketchId);
              } else if (skRef.startsWith('data:image/')) {
                src = skRef;
              }
              if (!src) return;
              if (!metaByBodyIdRef.current.has(bodyId)) return;
              metaByBodyIdRef.current.set(bodyId, { kind: 'sketch', src });
            }
          } catch (err) {
            console.error('[HomePhysicsPlayground] Failed to load media', err);
          }
        })();

        return;
      }

      // notePool 还没准备好：立即降级生成，同时后台加载 notePool
      void ensureNotePool();
      spawnFallback();
    };

    if (easterEggMode) {
      void ensureNotePool();
      clearNonBoundaryBodies();
      const w = window.innerWidth;
      const centerX = w * 0.5;
      const startYBase = 112; // matches sidebar pt-24 + p-4 roughly
      const firstCenterY = startYBase + computedHeroFontPx * 0.45;
      const lineCenterDelta = computedHeroFontPx * 0.9;

      const heroWords = ['START', 'YOUR', 'MAPPING'];
      ctx.font = `900 ${computedHeroFontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      for (let i = 0; i < heroWords.length; i++) {
        const text = heroWords[i];
        const baseW = Math.max(1, ctx.measureText(text).width);
        const baseH = computedHeroFontPx;
        const y = firstCenterY + i * lineCenterDelta;
        const body = Bodies.rectangle(centerX, y, baseW, baseH, {
          restitution: 0.35,
          friction: 0.2,
          frictionAir: 0.01,
          density: 0.0016
        });
        Body.setAngle(body, (Math.random() - 0.5) * 0.25);
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: -1.5 });
        metaByBodyIdRef.current.set(body.id, { kind: 'hero', text });
        World.add(world, body);
      }
    } else {
      // Initial sprinkle
      for (let i = 0; i < 10; i++) {
        spawnAt(window.innerWidth * (0.2 + Math.random() * 0.6), 120 + Math.random() * 120);
      }
    }

    // Global pointer drag constraint (works even when canvas is under UI)
    let drag: { body: Matter.Body; constraint: Matter.Constraint } | null = null;
    const pickBodyAt = (x: number, y: number) => {
      const bodies = Composite.allBodies(world).filter((b) => !(b as any).isBoundary);
      const found = Matter.Query.point(bodies, { x, y });
      return found[0] ?? null;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Ignore right click / secondary
      if (e.button === 2) return;

      const x = e.clientX;
      const y = e.clientY;

      const body = pickBodyAt(x, y);
      if (body) {
        const c = Constraint.create({
          pointA: { x, y },
          bodyB: body,
          pointB: Vector.sub(body.position, { x, y }),
          stiffness: mouseConstraintStiffness,
          damping: 0.12
        });
        drag = { body, constraint: c };
        World.add(world, c);
        return;
      }

      spawnAt(x, y);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      drag.constraint.pointA.x = e.clientX;
      drag.constraint.pointA.y = e.clientY;
    };

    const onPointerUp = () => {
      if (!drag) return;
      World.remove(world, drag.constraint);
      drag = null;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    const draw = () => {
      const now = performance.now();
      const dt = clamp(now - lastT, 8, 33);
      lastT = now;
      Matter.Engine.update(engine, dt);

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // 与 .text-theme-chrome-fg 同源：跟主题色 Lab L* 写入的 --theme-chrome-fg
      const chromeFg =
        getComputedStyle(document.documentElement).getPropertyValue('--theme-chrome-fg').trim() ||
        getThemeChromeForegroundHex(themeColor);

      // subtle background tint
      ctx.fillStyle = 'rgba(255,255,255,0.01)';
      ctx.fillRect(0, 0, w, h);

      const bodies = Composite.allBodies(world).filter((b) => !(b as any).isBoundary);
      for (const b of bodies) {
        const meta = metaByBodyIdRef.current.get(b.id);
        if (!meta) continue;

        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);

        if (meta.kind === 'emoji') {
          ctx.fillStyle = chromeFg;
          ctx.font = '56px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.95;
          ctx.fillText(meta.text, 0, 0);
        } else {
          const vertices = b.vertices;
          const minX = Math.min(...vertices.map((v) => v.x)) - b.position.x;
          const maxX = Math.max(...vertices.map((v) => v.x)) - b.position.x;
          const minY = Math.min(...vertices.map((v) => v.y)) - b.position.y;
          const maxY = Math.max(...vertices.map((v) => v.y)) - b.position.y;
          const bw = maxX - minX;
          const bh = maxY - minY;

          if (meta.kind === 'photo' || meta.kind === 'sketch') {
            ctx.globalAlpha = 0.98;
            if (meta.src) {
              const img = getImageEl(meta.src);
              if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
              }
            } else {
              // media 仍在加载：用占位文字（不使用任何框）
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = chromeFg;
              ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(meta.kind === 'photo' ? 'PHOTO' : 'SKETCH', 0, 0);
            }
          } else {
            const isHero = meta.kind === 'hero';
            // Text only (no background boxes)
            ctx.globalAlpha = isHero ? 0.92 : meta.kind === 'project' ? 0.9 : 0.88;
            ctx.fillStyle = chromeFg;
            ctx.font = isHero
              ? `900 ${computedHeroFontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
              : meta.kind === 'project'
                ? '600 26px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
                : '600 24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const maxChars = meta.kind === 'project' ? 26 : isHero ? 12 : 18;
            const text = meta.text.length > maxChars ? `${meta.text.slice(0, maxChars - 1)}…` : meta.text;
            ctx.fillText(text, 0, 0);
          }
        }

        ctx.restore();
      }

      // Trim offscreen bodies
      const margin = 400;
      const toRemove: Matter.Body[] = [];
      for (const b of bodies) {
        if (
          b.position.x < -margin ||
          b.position.x > w + margin ||
          b.position.y < -margin ||
          b.position.y > h + margin
        ) {
          toRemove.push(b);
        }
      }
      if (toRemove.length) {
        for (const b of toRemove) {
          metaByBodyIdRef.current.delete(b.id);
          World.remove(world, b);
        }
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      metaByBodyIdRef.current.clear();
      Matter.Engine.clear(engine);
      // World bodies will be GC'd with engine
    };
  }, [enabled, easterEggMode, gravityY, mouseConstraintStiffness, spawnCandidates]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2000]"
    />
  );
};

