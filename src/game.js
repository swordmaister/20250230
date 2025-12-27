import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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
            waterSplashes: []
        };
        this.gameState = {
            wave: 1,
            req: 0,
            nextSpawn: 0,
            missionType: 'normal',
            enemiesToSpawn: 0,
            puzzle: null
        };
        this.waterTank = { body: null, mesh: null, hp: 100, destroyed: false, waterPlane: null, floodTimer: 0, origPos: null };
        this.windows = [];
        this.aimMarker = null;
        this.focusLaser = null;
        this.targetArrow = null;

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
            tankTimer: document.getElementById('tankTimer'),
            vipBox: document.getElementById('vipBox'),
            vipHpBar: document.getElementById('vipHpBar'),
            novr: document.querySelectorAll('.novr-only'),
            btnDraw: document.getElementById('btnRight')
        };
    }

    init() {
        this.setupScene();
        this.setupPhysics();
        this.setupPlayer();
        this.mode.init();
        this.renderer.setAnimationLoop((t) => this.loop(t));
        window.addEventListener('resize', () => this.onResize());

        document.getElementById('vrBtn').addEventListener('click', async()=>{
            if(!navigator.xr)return;
            const s=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});
            this.renderer.xr.setSession(s);
            this.els.novr.forEach(e=>e.style.opacity=0);
            s.addEventListener('end',()=>{this.els.novr.forEach(e=>e.style.opacity=1);});
        });
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

        this.aimMarker = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.7, depthTest: false}));
        this.scene.add(this.aimMarker);

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

        this.mode.setupEnvironment(this.scene, this.world, this.materials.def);
    }

    setupPlayer() {
        this.playerGroup = new THREE.Group();
        this.playerGroup.add(this.camera);
        this.scene.add(this.playerGroup);
        this.player = new Player(this);
        this.player.setupMobileControls();
        this.player.setupVRControllers();
    }

    loop(t) {
        const dt = Math.min(this.clock.getDelta(), 0.1);
        this.world.step(1/60, dt, 3);

        this.mode.update(dt, t);
        this.player.update(dt);

        // Entity updates
        this.entities.waterSplashes = this.entities.waterSplashes.filter(s => { s.timer -= dt; return s.timer > 0; });

        this.entities.kekkai.forEach(k=>{
            if(!k.shrinking)return;
            k.mesh.scale.multiplyScalar(0.7);
            const kb=new THREE.Box3().setFromObject(k.mesh);
            this.entities.enemies.forEach(e=>{
                if(kb.intersectsBox(new THREE.Box3().setFromObject(e.mesh))) {
                    if(k.isWaterCube && e.type === 'fire' && e.state !== 'wet') {
                        e.state = 'wet'; e.wetTimer = 10.0; this.spawnText("接触鎮火!", e.mesh.position, "#0af");
                        e.body.velocity.set(0,0,0);
                    }
                    if (e.type === 'fire' && e.state !== 'wet') { this.spawnText("無効!", e.mesh.position, "#f00"); k.shrinking = false; this.mode.removeKekkai(k); }
                    else this.mode.killEnemy(e);
                }
                if (this.waterTank.mesh && kb.intersectsBox(new THREE.Box3().setFromObject(this.waterTank.mesh))) { this.waterTank.hp -= 50; }
            });
            if(k.mesh.scale.x<0.05) this.mode.removeKekkai(k);
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

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    showMsg(t, c) { this.els.msg.textContent = t; this.els.msg.style.color = c; this.els.msg.style.opacity = 1; setTimeout(() => this.els.msg.style.opacity = 0, 800); }

    spawnText(s, p, c) {
        const cvs=document.createElement('canvas'); cvs.width=256; cvs.height=64; const ctx=cvs.getContext('2d'); ctx.font="bold 48px sans-serif"; ctx.fillStyle=c; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(s,128,32);
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs), transparent:true})); sp.position.copy(p); sp.scale.set(4,1,4); this.scene.add(sp);
        let f=0; const a=()=>{ if(!sp.parent)return; f+=0.05; sp.position.y+=0.05; sp.material.opacity=1-f; if(f<1)requestAnimationFrame(a); else this.safeRemoveMesh(sp); }; a();
    }

    spawnParticle(p, n, c, scale=1.0) {
        const g=new THREE.BoxGeometry(0.2*scale,0.2*scale,0.2*scale); const m=new THREE.MeshBasicMaterial({color:c});
        for(let i=0;i<n;i++){
            const me=new THREE.Mesh(g,m); me.position.copy(p).add(new THREE.Vector3((Math.random()-.5)*2, (Math.random()-.5)*2, (Math.random()-.5)*2)); this.scene.add(me);
            const v=new THREE.Vector3(Math.random()-.5, Math.random()-.5, Math.random()-.5).multiplyScalar(3.0);
            const a=()=>{ if(!me.parent)return; me.position.add(v.clone().multiplyScalar(0.05)); me.scale.multiplyScalar(0.9); if(me.scale.x>0.05)requestAnimationFrame(a); else this.safeRemoveMesh(me); }; a();
        }
    }

    safeRemoveMesh(mesh) {
        if(!mesh||!mesh.parent)return;
        this.scene.remove(mesh);
        if(mesh.geometry)mesh.geometry.dispose();
        if(mesh.material){ if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose()); else mesh.material.dispose(); }
    }
}
