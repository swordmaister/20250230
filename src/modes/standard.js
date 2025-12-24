import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BaseMode } from './base_mode.js';

export class StandardMode extends BaseMode {
    constructor() {
        super();
        this.config = {
            colors: {
                sky: 0x87CEEB, ground: 0xC2B280, kekkai: 0xffff00, ghost: 0x00ffff,
                drawPhys: 0xffff00, drawGhost: 0x00ffff, highlight: 0xff0044, marker: 0xff0000,
                wall: 0xa0a0a0, building: 0xf0f0f0, concrete: 0x999999, iron: 0x555555, wood: 0x8B4513, leaf: 0x228B22,
                enemy: 0xff4444, giant: 0x880000, target: 0xFFD700, item: 0x00ff00, vip: 0x0000ff,
                floater_high: 0xff00ff, floater_low: 0x00ffff, jumper: 0xffaa00
            },
            player: { speed: 10.0, jump: 22.0, height: 1.7, maxHp: 100, maxSp: 100 },
            kekkai: { sensitivity: 150.0, spCostPerSec: 1.0, spRegen: 5.0, metsuCost: 2.0 },
            dist: { min: 0.0, max: 40.0, default: 6.0 },
            aimAssist: { baseRadius: 1.5 },
            field: { width: 120, depth: 160 }
        };
    }

    init() {
        this.startWave();
    }

    update(dt, t) {
        // Enemy Logic
        if (this.game.gameState.missionType === 'boss_eater') {
            this.updateBossEaterLogic(t, dt);
        } else {
             if (t > this.game.gameState.nextSpawn) {
                 this.spawnEnemy();
                 this.game.gameState.nextSpawn = t + 3000 - this.game.gameState.wave * 100;
             }
        }

        // Enemy movement
        this.game.entities.enemies.forEach(e => {
            const isOut = Math.abs(e.body.position.x) > this.config.field.width/2+2 || Math.abs(e.body.position.z) > this.config.field.depth/2+2;
            if(isOut){
                if(this.game.gameState.missionType==='annihilation'){ this.killEnemy(e,true); this.game.showMsg("敵逃亡","#aaa"); return; }
                if(e.body.velocity.length()<2 || (e.body.outsideTimer>2.0)){
                    const center=new CANNON.Vec3(0,25,0).vsub(e.body.position);
                    e.body.velocity.set(center.x*0.5, 30, center.z*0.5); e.body.outsideTimer=0;
                } else e.body.outsideTimer=(e.body.outsideTimer||0)+dt;
            } else {
                e.body.outsideTimer=0;
                if(this.game.gameState.missionType!=='boss_eater' && !e.isCompositeCore && !e.isBoss){
                    const tgt=(this.game.vip&&this.game.vip.hp>0)?this.game.vip.body.position:this.game.player.body.position;
                    const d=tgt.vsub(e.body.position); d.normalize();
                    e.body.applyForce(d.scale(20), e.body.position);
                }
            }
        });
    }

    updateBossEaterLogic(t, dt) {
        this.game.entities.enemies.forEach(e => {
            const distToPlayer = e.body.position.distanceTo(this.game.player.body.position);
            if (distToPlayer < 2.0) this.game.player.takeDamage(1);

            if(e.body.velocity.y > 10) e.body.velocity.y *= 0.9;

            if(!e.isBoss) {
                 e.body.applyForce(new CANNON.Vec3(0, 30 * e.body.mass, 0), e.body.position);
                 if(e.body.position.y > 50) e.body.applyForce(new CANNON.Vec3(0, -100 * e.body.mass, 0), e.body.position);

                 let targetK = null;
                 let minD = 999;
                 const enemyPos = new THREE.Vector3(e.body.position.x, e.body.position.y, e.body.position.z);

                 this.game.entities.kekkai.forEach(k => {
                     const d = enemyPos.distanceTo(k.mesh.position);
                     if(d < 80 && d < minD) { minD = d; targetK = k; }
                 });

                 // Target logic simplified for now
                 let targetPos = targetK ? targetK.mesh.position : this.game.player.body.position;
                 const diffY = targetPos.y - enemyPos.y;
                 let moveDir = new THREE.Vector3().subVectors(targetPos, enemyPos).normalize();
                 if (diffY > 5.0) { moveDir.y += 0.8; moveDir.normalize(); }

                 const speed = targetK ? 35 : 20;
                 e.body.applyForce(new CANNON.Vec3(moveDir.x*speed, moveDir.y*speed, moveDir.z*speed), e.body.position);

                 if(targetK) {
                      const box = new THREE.Box3().setFromObject(targetK.mesh);
                      const enemySphere = new THREE.Sphere(enemyPos, 1.2);
                      if (box.intersectsSphere(enemySphere)) {
                          this.game.spawnParticle(e.mesh.position, 20, 0xff00ff);
                          this.removeKekkai(targetK);
                      }
                 }
            } else {
                 // Boss logic
                 const time = t * 0.001;
                 const hoverY = 40 + Math.sin(time + e.floatOffset) * 5;
                 const targetX = Math.sin(time * 0.5) * 20;
                 const targetZ = Math.cos(time * 0.5) * 20;
                 const forceX = (targetX - e.body.position.x) * 300;
                 const forceY = (hoverY - e.body.position.y) * 300;
                 const forceZ = (targetZ - e.body.position.z) * 300;
                 e.body.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), e.body.position);
                 e.body.angularVelocity.set(0, 0.5, 0);
            }
        });
        if(t > this.game.gameState.nextSpawn) { this.spawnEnemy(); this.game.gameState.nextSpawn = t + 2000; }
    }

    startWave() {
        this.game.gameState.enemiesToSpawn = 0;
        this.game.gameState.puzzle = null;
        const t = (this.game.gameState.wave - 1) % 5;

        if(t===4){
            this.game.gameState.missionType='boss_eater';
            this.game.els.missionText.textContent="上空の本体を叩け！";
            this.game.gameState.req=1;
            this.spawnEnemy('boss_eater_core');
            for(let i=0;i<5;i++) this.spawnEnemy();
        }
        else if(t===0){ this.game.gameState.missionType='normal'; this.game.els.missionText.textContent="通常ミッション"; this.game.gameState.req=5; }
        else if(t===1){ this.game.gameState.missionType='annihilation'; this.game.els.missionText.textContent="殲滅戦"; this.game.gameState.enemiesToSpawn=8; this.game.gameState.req=8; }
        else if(t===2){ this.game.gameState.missionType='hunt'; this.game.els.missionText.textContent="討伐戦"; this.game.gameState.req=1; }
        else if(t===3){ this.game.gameState.missionType='boss_composite'; this.game.els.missionText.textContent="巨大構造物 解体作業"; this.game.gameState.req=1; this.spawnCompositeBoss(); }

        this.game.showMsg(`WAVE ${this.game.gameState.wave} START`, "#fff");
        if(this.game.gameState.missionType==='hunt') this.spawnEnemy('target');
        if(this.game.gameState.missionType==='annihilation') { for(let i=0;i<3;i++) this.spawnEnemy(); }
    }

    nextWave() {
        this.game.gameState.wave++;
        this.startWave();
    }

    spawnEnemy(forceType=null) {
        if (this.game.gameState.missionType === 'annihilation' && this.game.gameState.enemiesToSpawn <= 0) return;
        if (this.game.gameState.missionType === 'boss_composite' || this.game.gameState.missionType === 'boss_puzzle') return;
        if (this.game.gameState.missionType === 'boss_eater' && !forceType) {
            if(this.game.entities.enemies.filter(e => !e.isBoss).length >= 10) return;
        } else if (this.game.gameState.missionType !== 'boss_eater' && this.game.entities.enemies.length >= 15) return;

        const r = Math.random(); let x, y, z; const fW=this.config.field.width, fD=this.config.field.depth;
        if (r<0.6) { x=(Math.random()-.5)*fW; z=(Math.random()-.5)*fD; y=20; }
        else if (r<0.8) { x=(Math.random()-.5)*(fW-5); z=(-fD / 2 - 20)+(Math.random()-.5)*30; y=35; }
        else { x=(fW/2-25)+(Math.random()-.5)*20; z=(Math.random()-.5)*50; y=10; }

        const hpMult = 1 + Math.floor((this.game.gameState.wave-1)/5);

        if (forceType === 'boss_eater_core') {
            y = 40; x = 0; z = 0;
            const sz = 2.5;
            const b = new CANNON.Body({mass:500, shape:new CANNON.Sphere(sz), material:this.game.materials.ene, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            b.linearDamping = 0.9;
            b.position.set(x,y,z); this.game.world.addBody(b);
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(sz,2), new THREE.MeshStandardMaterial({color:0xFF0055, emissive:0x550022, roughness:0.2}));
            this.game.scene.add(m);
            this.game.entities.enemies.push({body:b, mesh:m, isBoss:true, hp:30*hpMult, floatOffset: Math.random()*100});
            this.game.spawnText("BOSS!!", new THREE.Vector3(x,y,z), "#f00");
        } else if (forceType==='target') {
            if(Math.random() < 0.3) { y = 40 + Math.random()*20; this.game.showMsg("上空反応あり！", "#fa0"); }
            const sz=1.2; const b=new CANNON.Body({mass:20, shape:new CANNON.Sphere(sz), material:this.game.materials.ene, linearDamping:0.4, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            b.position.set(x,y,z); this.game.world.addBody(b);
            const m=new THREE.Mesh(new THREE.IcosahedronGeometry(sz,1), new THREE.MeshStandardMaterial({color:0xFFD700, emissive:0xffaa00, emissiveIntensity:0.5}));
            const ring=new THREE.Mesh(new THREE.TorusGeometry(sz*1.5,0.05,8,24), new THREE.MeshBasicMaterial({color:0xffcc00})); ring.rotation.x=Math.PI/2; m.add(ring);
            this.game.scene.add(m); this.game.entities.enemies.push({body:b, mesh:m, isTarget:true, hp:5*hpMult, time:0});
        } else {
            let type='normal', sz=0.6+Math.random()*0.8, col=new THREE.Color().setHSL(Math.random(),0.8,0.5), ms=15*sz;
            if (this.game.gameState.missionType === 'boss_eater') { col.setHex(0xaa2222); }
            else {
                const typeR=Math.random();
                if(typeR<0.2){ type='floater_high'; col.setHex(this.config.colors.floater_high); y=15; ms=5; }
                else if(typeR<0.4){ type='floater_low'; col.setHex(this.config.colors.floater_low); y=5; ms=10; }
                else if(typeR<0.6){ type='jumper'; col.setHex(this.config.colors.jumper); y=5; ms=20; }
            }
            const b=new CANNON.Body({mass:ms, shape:new CANNON.Sphere(sz), material:this.game.materials.ene, linearDamping:0.4, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            b.position.set(x,y,z); this.game.world.addBody(b);
            let geo; if(type==='floater_high')geo=new THREE.OctahedronGeometry(sz,0); else if(type==='floater_low')geo=new THREE.ConeGeometry(sz,sz*2,8); else if(type==='jumper')geo=new THREE.TorusGeometry(sz*0.6,sz*0.2,8,16); else geo=new THREE.IcosahedronGeometry(sz,0);
            const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:col})); if(type==='floater_low')m.rotation.x=Math.PI/2;
            this.game.scene.add(m); this.game.entities.enemies.push({body:b, mesh:m, type, hp:1*hpMult});
        }
        if (this.game.gameState.missionType==='annihilation') this.game.gameState.enemiesToSpawn--;
    }

    spawnCompositeBoss() {
        const b=new CANNON.Body({mass:0}); b.position.set(0,20,-40); b.id=-999; const m=new THREE.Group(); this.game.scene.add(m);
        this.game.entities.enemies.push({body:b, mesh:m, isCompositeCore:true, partsCount:0});
        const add=(x,y,z,sx,sy,sz,hp)=>{
            const pb=new CANNON.Body({mass:50, collisionFilterGroup:4, collisionFilterMask:1|2|4}); pb.addShape(new CANNON.Box(new CANNON.Vec3(sx/2,sy/2,sz/2))); pb.position.set(x,20+y,-40+z); this.game.world.addBody(pb);
            const pm=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), new THREE.MeshStandardMaterial({color:this.config.colors.giant})); this.game.scene.add(pm);
            this.game.entities.enemies.push({body:pb, mesh:pm, isCompositePart:true, parentId:b.id, hp});
            this.game.entities.enemies[this.game.entities.enemies.length-2].partsCount++;
        };
        add(0,0,0,6,10,4,10); add(-8,5,0,3,8,3,5); add(8,5,0,3,8,3,5); add(0,8,0,4,4,4,5);
    }

    killEnemy(e, isEscape=false) {
        if(!this.game.entities.enemies.includes(e)) return;

        if(e.isCompositePart) {
            this.game.spawnParticle(e.mesh.position,15,0xffaa00); this.removeEnemy(e);
            const p=this.game.entities.enemies.find(en=>en.body.id===e.parentId);
            if(p){ p.partsCount--; if(p.partsCount<=0) this.killEnemy(p); }
            return;
        }

        if(e.hp>0 && !isEscape){
            e.hp--;
            this.game.spawnParticle(e.mesh.position,10,0xffaa00);
            if(e.isBoss) {
                this.game.spawnText("BOSS DAMAGE!", e.body.position, "#f00");
                e.mesh.material.emissive.setHex(0x000000);
                setTimeout(() => { if(e.mesh) e.mesh.material.emissive.setHex(0x550022); }, 100);
            }
            const push=this.game.player.body.position.vsub(e.body.position); push.normalize(); e.body.applyImpulse(push.scale(-500),e.body.position);
            if(e.hp>0) return;
        }

        this.game.spawnParticle(e.mesh.position, 25, 0xff0000);
        this.removeEnemy(e);

        if(this.game.gameState.missionType === 'boss_eater') {
            if(e.isBoss) {
                this.game.gameState.req = 0;
                this.game.showMsg("BOSS DESTROYED", "#f0f");
                this.actionGlobalMetsu();
                setTimeout(() => this.nextWave(), 4000);
            } else {
                this.spawnItem(e.body.position);
                return;
            }
        }

        if(!isEscape) { if(Math.random()<0.3) this.spawnItem(e.body.position); }

        let p=false;
        if(this.game.gameState.missionType==='hunt'){ if(e.isTarget){this.game.gameState.req=0; p=true;} }
        else if(this.game.gameState.missionType!=='boss_eater' && this.game.gameState.req>0){ this.game.gameState.req--; p=true; }

        if(p && this.game.gameState.req<=0) {
            this.game.showMsg(`WAVE ${this.game.gameState.wave} CLEAR`, "#fe0");
            [...this.game.entities.enemies].forEach(en=>this.removeEnemy(en));
            setTimeout(() => this.nextWave(), 2000);
        }
    }

    removeEnemy(e) {
        if(!this.game.entities.enemies.includes(e)) return;
        this.game.entities.enemies = this.game.entities.enemies.filter(o=>o!==e);
        this.game.safeRemoveMesh(e.mesh);
        this.game.world.removeBody(e.body);
    }

    spawnItem(pos) {
        const b=new CANNON.Body({mass:1, shape:new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5)), material:this.game.materials.ene}); // Using 'ene' mat for simple items
        b.position.copy(pos); this.game.world.addBody(b);
        const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0x00ff00, wireframe:true}));
        m.position.copy(pos); this.game.scene.add(m);
        this.game.entities.items.push({body:b, mesh:m});
    }

    createKekkai(p, s, r, isGhost=false) {
        const b = new CANNON.Body({ mass: 0, material: this.game.materials.kek, collisionFilterGroup: 2, collisionFilterMask: 1|2|4 });
        b.position.copy(p); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), r);
        if(!isGhost) { b.addShape(new CANNON.Box(new CANNON.Vec3(s.x/2, s.y/2, s.z/2))); }
        else {
             const t=0.5, x=s.x/2, y=s.y/2, z=s.z/2;
             b.addShape(new CANNON.Box(new CANNON.Vec3(t,y,z)), new CANNON.Vec3(-x,0,0)); b.addShape(new CANNON.Box(new CANNON.Vec3(t,y,z)), new CANNON.Vec3(x,0,0));
             b.addShape(new CANNON.Box(new CANNON.Vec3(x,t,z)), new CANNON.Vec3(0,-y,0)); b.addShape(new CANNON.Box(new CANNON.Vec3(x,t,z)), new CANNON.Vec3(0,y,0));
             b.addShape(new CANNON.Box(new CANNON.Vec3(x,y,t)), new CANNON.Vec3(0,0,-z)); b.addShape(new CANNON.Box(new CANNON.Vec3(x,y,t)), new CANNON.Vec3(0,0,z));
        }
        this.game.world.addBody(b);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshPhongMaterial({color: isGhost?this.config.colors.ghost:this.config.colors.kekkai, transparent:true, opacity:isGhost?0.3:0.5, side:THREE.DoubleSide}));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.5}));
        m.add(edges); m.position.copy(p); m.rotation.y = r; this.game.scene.add(m);
        this.game.entities.kekkai.push({ body:b, mesh:m, edges:edges, shrinking:false, isGhost });
        this.game.spawnText("結", p, isGhost?"#0ff":"#ff0");
    }

    performMetsu(t) {
        if(!t||t.shrinking) return;
        if(this.game.player.sp < this.config.kekkai.metsuCost) { this.game.showMsg("霊力不足","#f00"); return; }
        this.game.player.sp -= this.config.kekkai.metsuCost;
        this.game.spawnText("滅", t.mesh.position, "#f24");
        t.shrinking=true;
        if(t.body){ this.game.world.removeBody(t.body); t.body=null; }
    }

    actionMetsu() { let t=this.game.currentTargetKekkai; if(t) this.performMetsu(t); else this.game.showMsg("対象なし","#aaa"); }

    actionKai() {
        let t=this.game.currentTargetKekkai;
        if(t) this.removeKekkai(t);
        else if(this.game.entities.kekkai.length > 0) this.removeKekkai(this.game.entities.kekkai[this.game.entities.kekkai.length-1]);
    }

    actionGlobalMetsu() {
        if(this.game.entities.kekkai.length === 0) return;
        if(this.game.player.sp < this.game.entities.kekkai.length * this.config.kekkai.metsuCost) { this.game.showMsg("霊力不足","#f00"); return; }
        this.game.showMsg("全・滅", "#f24");
        this.game.entities.kekkai.forEach(k => this.performMetsu(k));
    }

    actionGlobalKai() {
        if(this.game.entities.kekkai.length > 0) {
            this.game.showMsg("全解除", "#4f8");
            this.game.entities.kekkai.forEach(k => this.removeKekkai(k));
        }
    }

    setupEnvironment(scene, world, mat) {
        const CFG = this.config;
        const FW=CFG.field.width,FD=CFG.field.depth,WH=8; const gateW = 24; const wallW = (FW - gateW) / 2;

        const createBox=(x,y,z,w,h,d,col,tr=false,op=1,rotY=0)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:col,transparent:tr,opacity:op})); m.position.set(x,y,z); m.rotation.y=rotY; m.castShadow=!tr; m.receiveShadow=true; scene.add(m); const b=new CANNON.Body({mass:0,material:mat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.copy(m.position); b.quaternion.copy(m.quaternion); world.addBody(b); return m; };

        // Ground
        const gGeo=new THREE.PlaneGeometry(CFG.field.width+40,CFG.field.depth+40); const gMat=new THREE.MeshStandardMaterial({color:CFG.colors.ground,roughness:0.9});
        const groundMesh = new THREE.Mesh(gGeo,gMat); groundMesh.rotation.x=-Math.PI/2; groundMesh.receiveShadow=true; scene.add(groundMesh);
        const gBody=new CANNON.Body({mass:0,material:mat}); gBody.addShape(new CANNON.Plane()); gBody.quaternion.setFromEuler(-Math.PI/2,0,0); world.addBody(gBody);
        this.game.groundMesh = groundMesh;

        // Walls
        createBox(-FW/2 + wallW/2, WH/2, FD/2+1, wallW, WH, 2, CFG.colors.wall); createBox(FW/2 - wallW/2, WH/2, FD/2+1, wallW, WH, 2, CFG.colors.wall);
        createBox(-FW/2-1,WH/2,0,2,WH,FD+2,CFG.colors.wall); createBox(FW/2+1,WH/2,0,2,WH,FD+2,CFG.colors.wall);
        const bH=30,bZ=-FD/2-20; createBox(0,bH/2,bZ,FW,bH,40,CFG.colors.building);
        for(let i=-FW/2+5;i<FW/2;i+=10)for(let j=5;j<28;j+=7){const w=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial({color:0x87CEFA})); w.position.set(i,j,bZ+20+0.1); scene.add(w);}
        createBox(0, bH+1, bZ, FW, 2, 40, CFG.colors.concrete);

        // Ramps and details
        const rampH = 0.6, rampW = 1.2;
        const createRampFence = (x, z, length, rotY) => {
            const shape = new THREE.Shape(); shape.moveTo(0,0); shape.lineTo(0, rampH); shape.lineTo(rampW, 0); shape.lineTo(0,0);
            const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: length, bevelEnabled: false });
            const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: CFG.colors.concrete}));
            m.position.set(0, 0, -length/2); const wrapper = new THREE.Object3D(); wrapper.add(m); wrapper.position.set(x, bH+1, z); wrapper.rotation.y = rotY; scene.add(wrapper);
            const ang = Math.atan2(rampH, rampW); const hyp = Math.sqrt(rampH**2 + rampW**2);
            const b = new CANNON.Body({mass:0, material:mat});
            b.addShape(new CANNON.Box(new CANNON.Vec3(hyp/2, 0.1, length/2)), new CANNON.Vec3(rampW/2, rampH/2, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -ang));
            b.addShape(new CANNON.Box(new CANNON.Vec3(0.1, rampH/2, length/2)), new CANNON.Vec3(0, rampH/2, 0));
            b.position.set(x, bH+1, z); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rotY); world.addBody(b);
        };
        createRampFence(0, bZ-20, FW, -Math.PI/2); createRampFence(-FW/2, bZ, 40, 0); createRampFence(FW/2, bZ, 40, Math.PI);
        const landW=8; const gapW = landW + 2; const landX = FW/2 - landW/2 - 2; const gapStart = landX - gapW/2; const gapEnd = landX + gapW/2;
        createRampFence((-FW/2 + gapStart)/2, bZ+20, gapStart - (-FW/2), Math.PI/2); createRampFence((gapEnd + FW/2)/2, bZ+20, FW/2 - gapEnd, Math.PI/2);

        const wtX = FW/2 - 8, wtZ = bZ - 8, wtBaseH = bH+2; const wtTank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6, 16), new THREE.MeshStandardMaterial({color: CFG.colors.concrete})); wtTank.position.set(wtX, wtBaseH + 8, wtZ); wtTank.castShadow=true; scene.add(wtTank); const wtTankBody = new CANNON.Body({mass:0, material:mat}); wtTankBody.addShape(new CANNON.Cylinder(4,4,6,16)); wtTankBody.position.copy(wtTank.position); world.addBody(wtTankBody);
        for(let i=0; i<4; i++){ const ang = i * Math.PI/2; const m=new THREE.Mesh(new THREE.BoxGeometry(0.5,5,0.5), new THREE.MeshStandardMaterial({color:CFG.colors.iron})); m.position.set(wtX + Math.cos(ang)*3, wtBaseH + 2.5, wtZ + Math.sin(ang)*3); scene.add(m); }

        const stW=6, stRise=bH, stRun=60; const landD=stW+2; const landY = bH; const landZ = bZ + 20 + landD/2;
        createBox(landX, landY, landZ, landW, 1, landD, CFG.colors.concrete);
        const slLen=Math.sqrt(stRun**2+stRise**2), slAng=Math.atan2(stRise, stRun); const slMidX = landX - landW/2 - stRun/2; const slMidY = stRise/2; const slZ = bZ + 20 + stW/2 + 0.05;
        const slB=new CANNON.Body({mass:0,material:mat}); slB.addShape(new CANNON.Box(new CANNON.Vec3(slLen/2,0.5,stW/2))); slB.position.set(slMidX, slMidY, slZ); const slQ = new THREE.Quaternion(); slQ.setFromEuler(new THREE.Euler(0,0,slAng)); slB.quaternion.copy(slQ); world.addBody(slB);
        const slM=new THREE.Mesh(new THREE.BoxGeometry(slLen,1,stW), new THREE.MeshStandardMaterial({color:CFG.colors.concrete})); slM.position.copy(slB.position); slM.quaternion.copy(slB.quaternion); scene.add(slM);

        const brRun=3.0, brRise=1.5; const brLen=Math.sqrt(brRun**2+brRise**2)+0.5; const brAng=Math.atan2(brRise, brRun);
        const brB = new CANNON.Body({mass:0, material:mat}); brB.addShape(new CANNON.Box(new CANNON.Vec3(landW/2, 0.2, brLen/2))); brB.position.set(landX, bH + 0.5 + brRise/2, bZ + 21.5); brB.quaternion.setFromEuler(brAng, 0, 0); world.addBody(brB);
        const brM = new THREE.Mesh(new THREE.BoxGeometry(landW, 0.4, brLen), new THREE.MeshStandardMaterial({color:CFG.colors.concrete})); brM.position.copy(brB.position); brM.quaternion.copy(brB.quaternion); scene.add(brM);

        const hrH=1.2, hrT=0.1; const cRail = (x,y,z,w,h,d,rx=0,ry=0,rz=0) => { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color:CFG.colors.iron})); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); scene.add(m); const b=new CANNON.Body({mass:0,material:mat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.copy(m.position); b.quaternion.copy(m.quaternion); world.addBody(b); };
        cRail(slMidX, slMidY+hrH/2, slZ-stW/2+hrT/2+0.05, slLen, hrH, hrT, 0,0,slAng); cRail(slMidX, slMidY+hrH/2, slZ+stW/2-hrT/2-0.05, slLen, hrH, hrT, 0,0,slAng);
        cRail(landX, landY+hrH/2, landZ+landD/2-hrT/2, landW, hrH, hrT); cRail(landX+landW/2-hrT/2, landY+hrH/2, landZ, hrT, hrH, landD);
        cRail(landX-landW/2+hrT/2, bH+0.5+brRise/2+hrH/2, bZ+21.5, hrT, hrH, brLen, brAng,0,0); cRail(landX+landW/2-hrT/2, bH+0.5+brRise/2+hrH/2, bZ+21.5, hrT, hrH, brLen, brAng,0,0);

        const pX = 35, pZ = 10, pW = 20, pD = 40, pBaseH = 4;
        createBox(pX, pBaseH/2, pZ, pW+4, pBaseH, pD+4, CFG.colors.concrete);
        createBox(pX, pBaseH+1, pZ - pD/2 - 1, pW+2, 2, 2, CFG.colors.concrete); createBox(pX, pBaseH+1, pZ + pD/2 + 1, pW+2, 2, 2, CFG.colors.concrete); createBox(pX - pW/2 - 1, pBaseH+1, pZ, 2, 2, pD, CFG.colors.concrete); createBox(pX + pW/2 + 1, pBaseH+1, pZ, 2, 2, pD, CFG.colors.concrete);
        const water = new THREE.Mesh(new THREE.PlaneGeometry(pW, pD), new THREE.MeshBasicMaterial({color:0x00aaff, transparent:true, opacity:0.6, side:THREE.DoubleSide})); water.rotation.x = -Math.PI/2; water.position.set(pX, pBaseH+1.5, pZ); scene.add(water);
        const prRun=25, prRise=pBaseH, prW=4; const prLen=Math.sqrt(prRun**2+prRise**2), prAng=Math.atan2(prRise, prRun);
        const prMidY = prRise/2; const prMidZ = pZ;
        const prMidX_L = pX - pW/2 - prW/2 - 2; const prB_L=new CANNON.Body({mass:0,material:mat}); prB_L.addShape(new CANNON.Box(new CANNON.Vec3(prW/2, 0.5, prLen/2))); prB_L.position.set(prMidX_L, prMidY, prMidZ); const prQ_L = new THREE.Quaternion(); prQ_L.setFromEuler(new THREE.Euler(prAng, 0, 0)); prB_L.quaternion.copy(prQ_L); world.addBody(prB_L); const prM_L=new THREE.Mesh(new THREE.BoxGeometry(prW, 1, prLen), new THREE.MeshStandardMaterial({color:CFG.colors.concrete})); prM_L.position.copy(prB_L.position); prM_L.quaternion.copy(prB_L.quaternion); scene.add(prM_L);
        const prMidX_R = pX + pW/2 + prW/2 + 2; const prB_R=new CANNON.Body({mass:0,material:mat}); prB_R.addShape(new CANNON.Box(new CANNON.Vec3(prW/2, 0.5, prLen/2))); prB_R.position.set(prMidX_R, prMidY, prMidZ); const prQ_R = new THREE.Quaternion(); prQ_R.setFromEuler(new THREE.Euler(prAng, 0, 0)); prB_R.quaternion.copy(prQ_R); world.addBody(prB_R); const prM_R=new THREE.Mesh(new THREE.BoxGeometry(prW, 1, prLen), new THREE.MeshStandardMaterial({color:CFG.colors.concrete})); prM_R.position.copy(prB_R.position); prM_R.quaternion.copy(prB_R.quaternion); scene.add(prM_R);

        // Gate
        const gZ = FD/2; createBox(-gateW/2-1, 4, gZ, 2, 8, 2, CFG.colors.wall); createBox(gateW/2+1, 4, gZ, 2, 8, 2, CFG.colors.wall);
        for(let i=-gateW/2; i<=gateW/2; i+=1.0) createVisualBox(i, 3, gZ, 0.2, 6, 0.2, CFG.colors.iron);
        createVisualBox(0, 5.5, gZ, gateW, 0.3, 0.3, CFG.colors.iron); createVisualBox(0, 0.5, gZ, gateW, 0.3, 0.3, CFG.colors.iron);
        const gateB = new CANNON.Body({mass:0, material:mat}); gateB.addShape(new CANNON.Box(new CANNON.Vec3(gateW/2, 3, 0.1))); gateB.position.set(0, 3, gZ); world.addBody(gateB);
        const createTree = (x, z) => { const trunkH = 4 + Math.random()*2; createBox(x, trunkH/2, z, 1, trunkH, 1, CFG.colors.wood); const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5 + Math.random(), 1), new THREE.MeshStandardMaterial({color:CFG.colors.leaf, roughness:0.8})); leaves.position.set(x, trunkH+2, z); leaves.castShadow=true; scene.add(leaves); };
        for(let i=0; i<5; i++) createTree(-FW/2+3, -FD/2 + 10 + i*20); for(let i=0; i<5; i++) createTree(FW/2-3, -FD/2 + 10 + i*20);

        function createVisualBox(x,y,z,w,h,d,col,rotY=0){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:col})); m.position.set(x,y,z); m.rotation.y=rotY; m.castShadow=true; m.receiveShadow=true; scene.add(m); return m; }
    }
}
