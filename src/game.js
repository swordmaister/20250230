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
            puzzle: null,
            isGameOver: false
        };
        this.stats = {
            startTime: 0,
            endTime: 0,
            distance: 0,
            damageTaken: 0,
            damageDealt: 0,
            kekkaiCount: 0
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
        this.stats.startTime = Date.now();
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

        this.setupVRHud();
    }

    setupVRHud() {
        this.vrHudCanvas = document.createElement('canvas');
        this.vrHudCanvas.width = 512; this.vrHudCanvas.height = 128;
        this.vrHudCtx = this.vrHudCanvas.getContext('2d');
        const tex = new THREE.CanvasTexture(this.vrHudCanvas);
        this.vrHudMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 0.25),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
        );
        this.vrHudMesh.position.set(0, 0.3, -1);
        this.camera.add(this.vrHudMesh);
    }

    updateVRHud() {
        if(!this.renderer.xr.isPresenting || !this.vrHudCtx) return;

        const ctx = this.vrHudCtx;
        const gs = this.gameState;
        const hp = this.player ? this.player.hp : 0;
        const sp = this.player ? this.player.sp : 0;
        const dist = this.player ? this.player.currentDist : 0;

        ctx.clearRect(0,0,512,128);
        ctx.fillStyle="rgba(0,20,40,0.6)";
        ctx.fillRect(0,0,512,128);
        ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(2,2,508,124);

        ctx.font="bold 24px sans-serif"; ctx.fillStyle="#ffeb3b"; ctx.fillText(`WAVE ${gs.wave}`,20,30);
        if(gs.missionType==='boss_eater') { ctx.fillStyle="#ff0055"; ctx.fillText(`BOSS 結界食い`, 140, 30); }

        ctx.font="20px sans-serif"; ctx.fillStyle="#fff";
        ctx.fillText(`残: ${gs.req}`,20,60);
        ctx.fillText(`距離: ${dist.toFixed(1)}m`,20,90);

        ctx.fillStyle = hp < 30 ? "#f55" : "#0f0"; ctx.fillText(`HP: ${Math.floor(hp)}`,300,30);
        ctx.fillStyle = "#555"; ctx.fillRect(300,35,180,15);
        ctx.fillStyle = hp < 30 ? "#f00" : "#0f0"; ctx.fillRect(300,35,180*(hp/100),15);

        ctx.fillStyle = "#0ff"; ctx.fillText(`SP: ${Math.floor(sp)}`,300,75);
        ctx.fillStyle = "#555"; ctx.fillRect(300,80,180,15);
        ctx.fillStyle = sp < 20 ? "#f00" : "#00bfff"; ctx.fillRect(300,80,180*(sp/100),15);

        if(this.player && this.player.drawCooldown > 0) { ctx.fillStyle="#f0f"; ctx.fillText("！共鳴妨害！", 20, 115); }

        this.vrHudMesh.material.map.needsUpdate = true;
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
        this.updateVRHud();

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

    showResult() {
        this.gameState.isGameOver = true;
        this.stats.endTime = Date.now();
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;

        // Calculate Score
        const score = Math.floor(
            (this.gameState.wave * 1000) +
            (this.stats.damageDealt * 10) -
            (this.stats.damageTaken * 20) +
            (this.stats.kekkaiCount * 5) -
            (duration * 2)
        );

        // Grade
        let rank = "C";
        if (score > 10000) rank = "B";
        if (score > 20000) rank = "A";
        if (score > 30000) rank = "S";
        if (score > 50000) rank = "SSS";

        const html = `
            <span style="color:#aaa;">CLEAR TIME:</span> ${duration.toFixed(1)}s<br>
            <span style="color:#aaa;">MAX WAVE:</span> ${this.gameState.wave}<br>
            <span style="color:#0f0;">DAMAGE DEALT:</span> ${Math.floor(this.stats.damageDealt)}<br>
            <span style="color:#f00;">DAMAGE TAKEN:</span> ${Math.floor(this.stats.damageTaken)}<br>
            <span style="color:#ff0;">KEKKAI CREATED:</span> ${this.stats.kekkaiCount}<br>
            <span style="color:#0ff;">DISTANCE:</span> ${Math.floor(this.stats.distance)}m<br>
            <hr style="border-color:#555;">
            <span style="font-size:30px; font-weight:bold;">SCORE: ${score}</span><br>
            <span style="font-size:50px; font-weight:900; color:${rank==='SSS'?'#fe0':'#fff'};">RANK ${rank}</span>
        `;

        document.getElementById('result-screen').style.display = 'flex';
        document.getElementById('result-stats').innerHTML = html;
        document.getElementById('hud').style.display = 'none';
        document.getElementById('uiLayer').style.display = 'none';
    }

    safeRemoveMesh(mesh) {
        if(!mesh||!mesh.parent)return;
        this.scene.remove(mesh);
        if(mesh.geometry)mesh.geometry.dispose();
        if(mesh.material){ if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose()); else mesh.material.dispose(); }
    }
}
