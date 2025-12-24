import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Player } from './entities/player.js';

export class Game {
    constructor(mode) {
        this.mode = mode;
        this.mode.game = this; // Link back
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.player = null;
        this.clock = new THREE.Clock();
        this.entities = {
            enemies: [],
            kekkai: [],
            items: [],
            projectiles: [] // For Awakened mode potentially
        };
        this.gameState = {
            wave: 1,
            req: 0,
            nextSpawn: 0,
            missionType: 'normal',
            enemiesToSpawn: 0,
            puzzle: null
        };

        // References to DOM elements
        this.els = {
            msg: document.getElementById('flashMsg'),
            hpText: document.getElementById('hpText'),
            hpBar: document.getElementById('hpBar'),
            spText: document.getElementById('spText'),
            spBar: document.getElementById('spBar'),
            wVal: document.getElementById('waveVal'),
            tVal: document.getElementById('targetVal'),
            missionText: document.getElementById('missionText'),
            bossLabel: document.getElementById('bossLabel'),
            dmgOverlay: document.getElementById('damage-overlay'),
            jammingOverlay: document.getElementById('jamming-overlay'),
            novr: document.querySelectorAll('.novr-only'),
            btnDraw: document.getElementById('btnRight')
        };
    }

    init() {
        this.setupScene();
        this.setupPhysics();
        this.setupPlayer();
        this.setupInputs();
        this.mode.init(); // Mode specific setup

        window.addEventListener('resize', () => this.onResize());

        this.renderer.setAnimationLoop((t) => this.loop(t));
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.mode.config.colors.sky);
        this.scene.fog = new THREE.FogExp2(this.mode.config.colors.sky, 0.005);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Lights
        const sun = new THREE.DirectionalLight(0xffffee, 1.2);
        sun.position.set(-50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0x555566, 0.6));

        // Aim Marker
        this.aimMarker = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.7, depthTest: false}));
        this.scene.add(this.aimMarker);

        this.targetArrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshBasicMaterial({color:0xffffff, depthTest:false, transparent:true, opacity:0.8}));
        this.targetArrow.visible=false;
        this.scene.add(this.targetArrow);

        // Focus Laser
        const lGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const lMat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 });
        this.focusLaser = new THREE.Line(lGeo, lMat);
        this.focusLaser.visible = false;
        this.focusLaser.frustumCulled = false;
        this.scene.add(this.focusLaser);
    }

    setupPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -30, 0);

        this.materials = {
            def: new CANNON.Material('def'),
            ply: new CANNON.Material('ply'),
            ene: new CANNON.Material('ene'),
            kek: new CANNON.Material('kek')
        };

        this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ply, this.materials.def, { friction: 0.0, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ene, this.materials.def, { friction: 0.5, restitution: 0.3 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.kek, this.materials.ene, { friction: 0.1, restitution: 0.8 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.kek, this.materials.ply, { friction: 0.0, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ply, this.materials.ene, { friction: 0.5, restitution: 0.5 }));

        this.mode.setupEnvironment(this.scene, this.world, this.materials.def);
    }

    setupPlayer() {
        this.playerGroup = new THREE.Group();
        this.playerGroup.add(this.camera);
        this.scene.add(this.playerGroup);

        this.player = new Player(this);
    }

    setupInputs() {
        this.player.setupMobileControls();

        document.getElementById('vrBtn').addEventListener('click', async () => {
            if (!navigator.xr) return;
            const s = await navigator.xr.requestSession('immersive-vr', {optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']});
            this.renderer.xr.setSession(s);
            this.els.novr.forEach(e => e.style.opacity = 0);
            s.addEventListener('end', () => { this.els.novr.forEach(e => e.style.opacity = 1); });
            this.player.setupVRControllers();
        });
    }

    showMsg(text, color) {
        this.els.msg.textContent = text;
        this.els.msg.style.color = color;
        this.els.msg.style.opacity = 1;
        setTimeout(() => this.els.msg.style.opacity = 0, 800);
    }

    spawnText(text, position, color) {
        const cvs=document.createElement('canvas'); cvs.width=128; cvs.height=64; const ctx=cvs.getContext('2d'); ctx.font="bold 48px sans-serif"; ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,64,32);
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs), transparent:true})); sp.position.copy(position); sp.scale.set(3,1.5,3); this.scene.add(sp);
        let f=0; const a=()=>{ if(!sp.parent)return; f+=0.1; sp.position.y+=0.05; sp.material.opacity=1-f; if(f<1)requestAnimationFrame(a); else this.safeRemoveMesh(sp); }; a();
    }

    spawnParticle(pos, count, color) {
        const g=new THREE.BoxGeometry(0.2,0.2,0.2); const m=new THREE.MeshBasicMaterial({color:color});
        for(let i=0;i<count;i++){
            const me=new THREE.Mesh(g,m); me.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*2, (Math.random()-.5)*2, (Math.random()-.5)*2)); this.scene.add(me);
            const v=new THREE.Vector3(Math.random()-.5, Math.random()-.5, Math.random()-.5).multiplyScalar(1.5);
            const a=()=>{ if(!me.parent)return; me.position.add(v); me.scale.multiplyScalar(0.8); if(me.scale.x>0.05)requestAnimationFrame(a); else this.safeRemoveMesh(me); }; a();
        }
    }

    safeRemoveMesh(mesh) {
        if(!mesh||!mesh.parent)return;
        this.scene.remove(mesh);
        if(mesh.geometry)mesh.geometry.dispose();
        if(mesh.material){ if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose()); else mesh.material.dispose(); }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    loop(t) {
        const dt = Math.min(this.clock.getDelta(), 0.1);

        this.world.step(1/60, dt, 3);

        this.mode.update(dt, t);
        this.player.update(dt);

        // Target Arrow Update
        const target = this.entities.enemies.find(e => e.isTarget || e.isBoss);
        if(target && this.targetArrow) {
            this.targetArrow.visible = true;
            const _vecPos = new THREE.Vector3(); const _vecDir = new THREE.Vector3(); const _vecUp = new THREE.Vector3(0,1,0); const _vecRight = new THREE.Vector3();
            this.camera.getWorldPosition(_vecPos); this.camera.getWorldDirection(_vecDir);
            _vecRight.crossVectors(_vecDir, _vecUp).normalize();
            this.targetArrow.scale.set(0.6, 0.6, 0.6);
            this.targetArrow.position.copy(_vecPos).add(_vecDir.multiplyScalar(1.5)).add(_vecRight.multiplyScalar(0.4));
            this.targetArrow.lookAt(target.body.position.x, target.body.position.y, target.body.position.z);
            this.targetArrow.rotateX(Math.PI/2);
            target.time = (target.time||0) + dt;
            if(target.mesh.material && target.mesh.material.emissiveIntensity !== undefined)
                target.mesh.material.emissiveIntensity = 0.5 + Math.sin(target.time*5) * 0.5;
            if(target.mesh.children[0]) {
                target.mesh.children[0].position.y = 2 + Math.sin(target.time*3)*0.5;
                target.mesh.children[0].rotation.z += dt*2;
            }
        } else if(this.targetArrow) {
            this.targetArrow.visible = false;
        }

        // Update entities
        this.entities.enemies.forEach(e => {
            if(e.update) e.update(dt, t);
            else {
                // Fallback for simple enemies if class not fully used yet
                e.mesh.position.copy(e.body.position); e.mesh.quaternion.copy(e.body.quaternion);
                if(e.body.position.y < -10) this.mode.killEnemy(e);
            }
        });

        this.entities.kekkai.forEach(k => {
             if(k.shrinking) {
                 k.mesh.scale.multiplyScalar(0.7);
                 const kb = new THREE.Box3().setFromObject(k.mesh);
                 this.entities.enemies.forEach(e => { if(kb.intersectsBox(new THREE.Box3().setFromObject(e.mesh))) this.mode.killEnemy(e); });
                 if(k.mesh.scale.x < 0.05) { this.mode.removeKekkai(k); this.spawnParticle(k.mesh.position, 30, 0xffaa00); }
             }
        });

        this.entities.items.forEach(it => {
            it.mesh.position.copy(it.body.position); it.mesh.rotation.y += 0.05;
            if(this.player.body.position.distanceTo(it.body.position) < 2) {
                this.player.heal(20);
                this.safeRemoveMesh(it.mesh); this.world.removeBody(it.body);
                this.entities.items = this.entities.items.filter(i => i !== it);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }
}
