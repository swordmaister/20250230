export class StandardMode {
    constructor() {
        this.game = null;
        this.config = {
            colors: {
                sky: 0x102030, ground: 0x333344, kekkai: 0xffff00, ghost: 0x00ffff,
                drawPhys: 0xffff00, drawGhost: 0x00ffff, highlight: 0xff0044, marker: 0xff0000,
                wall: 0x444455, building: 0x666677, concrete: 0x888899,
                water: 0x00aaff, fire_ene: 0xff4400, phantom: 0xaa00ff, wet_ene: 0x4444ff,
                vip: 0x00ffff, giant: 0x880000, target: 0xFFD700, gate: 0x222222
            },
            player: { speed: 10.0, jump: 22.0, height: 1.7, maxHp: 100, maxSp: 100 },
            kekkai: { sensitivity: 150.0, spCostPerSec: 1.0, spRegen: 5.0, metsuCost: 2.0 },
            dist: { min: 0.0, max: 40.0, default: 6.0 },
            aimAssist: { baseRadius: 1.5 },
            field: { width: 120, depth: 160, poolX: -30, poolZ: 10, roofY: 30 }
        };
    }

    init() {
        this.startWave();
    }

    update(dt, t) {
        this.updateTank(dt);
        this.checkEnemies(dt);
        if (t > this.game.gameState.nextSpawn) {
            this.spawnEnemy();
            this.game.gameState.nextSpawn = t + 3000;
        }
    }

    startWave() {
        this.game.gameState.enemiesToSpawn = 0;
        const t = (this.game.gameState.wave - 1) % 5;
        if(t===0){this.game.gameState.missionType='normal'; this.game.els.missionText.textContent="通常任務: 敵部隊排除"; this.game.gameState.req=5; }
        else if(t===1){this.game.gameState.missionType='escort'; this.game.els.missionText.textContent="護衛任務: VIPの保護"; this.game.gameState.req=30; this.spawnVIP(); }
        else if(t===2){this.game.gameState.missionType='boss_composite'; this.game.els.missionText.textContent="解体任務: 大型構造物"; this.game.gameState.req=1; this.spawnCompositeBoss(); }
        else if(t===3){this.game.gameState.missionType='hunt'; this.game.els.missionText.textContent="討伐任務: 黄金標的"; this.game.gameState.req=1; this.spawnEnemy('target'); }
        else if(t===4){this.game.gameState.missionType='boss_eater'; this.game.els.missionText.textContent="決戦: 結界食い"; this.game.gameState.req=1; /*Boss Logic*/ }

        this.game.showMsg(`WAVE ${this.game.gameState.wave} START`, "#fff");
        for(let i=0;i<8;i++) this.spawnEnemy();
    }

    nextWave() {
        this.game.gameState.wave++;
        this.startWave();
    }

    spawnVIP() {
        const pos = new CANNON.Vec3(this.game.player.body.position.x, this.game.player.body.position.y + 5, this.game.player.body.position.z);
        const b = new CANNON.Body({mass:10, shape:new CANNON.Sphere(1), collisionFilterGroup:1, collisionFilterMask:1|2|4});
        b.position.copy(pos); b.linearDamping = 0.5; this.game.world.addBody(b);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1,2), new THREE.MeshPhongMaterial({color:this.config.colors.vip, emissive:0x0044ff}));
        this.game.scene.add(m);
        this.game.vip = { body:b, mesh:m, hp:10 };
        this.game.spawnText("護衛開始", new THREE.Vector3(pos.x, pos.y, pos.z), "#0ff");
    }

    spawnCompositeBoss() {
        const b=new CANNON.Body({mass:0}); b.position.set(0,20,0); b.id=-999;
        const m=new THREE.Group(); this.game.scene.add(m);
        this.game.entities.enemies.push({body:b, mesh:m, isCompositeCore:true, partsCount:0});
        const add=(x,y,z,sx,sy,sz,hp)=>{
            const pb=new CANNON.Body({mass:50, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            pb.addShape(new CANNON.Box(new CANNON.Vec3(sx/2,sy/2,sz/2))); pb.position.set(x,20+y,z); this.game.world.addBody(pb);
            const pm=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), new THREE.MeshStandardMaterial({color:this.config.colors.giant}));
            this.game.scene.add(pm);
            this.game.entities.enemies.push({body:pb, mesh:pm, isCompositePart:true, parentId:b.id, hp});
            this.game.entities.enemies[this.game.entities.enemies.length-2].partsCount++;
        };
        add(0,0,0,6,10,4,10); add(-8,5,0,3,8,3,5); add(8,5,0,3,8,3,5); add(0,8,0,4,4,4,5);
        this.game.spawnText("解体目標出現", new THREE.Vector3(0,30,0), "#f00");
    }

    spawnEnemy(forceType=null) {
        if (this.game.gameState.missionType === 'annihilation' && this.game.gameState.enemiesToSpawn <= 0) return;
        if (this.game.gameState.missionType === 'boss_composite' || this.game.gameState.missionType === 'boss_eater') { if(this.game.entities.enemies.filter(e=>!e.isBoss).length >= 5) return; }
        if (this.game.entities.enemies.length >= 15) return;

        const fW=this.config.field.width, fD=this.config.field.depth;
        let type = 'normal';
        if(forceType) type = forceType;
        else if (this.game.gameState.wave % 5 === 1) type = (Math.random() < 0.6) ? 'fire' : 'phantom';
        else if (this.game.gameState.wave % 5 === 2) type = 'normal';
        else if (this.game.gameState.wave % 5 === 4) type = 'target';
        else type = (Math.random() < 0.3) ? 'fire' : ((Math.random() < 0.3) ? 'phantom' : (Math.random() < 0.3 ? 'cube' : (Math.random() < 0.5 ? 'roller' : 'jumper')));

        let x,y,z;
        if (type === 'fire' || type === 'phantom' || type === 'cube') { x=(Math.random()-.5)*fW; z=(Math.random()-.5)*fD; y=15 + Math.random()*10; }
        else { x=(Math.random()-.5)*fW; z=(Math.random()-.5)*fD; y=10; }

        const hpMult = 1 + (this.game.gameState.wave-1)*0.2;
        let sz = 0.8; let col = new THREE.Color(0xaa2222);
        let geo;

        if(type==='phantom') { sz=1.0; col.setHex(this.config.colors.phantom); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='fire') { col.setHex(this.config.colors.fire_ene); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='target') { col.setHex(this.config.colors.target); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='cube') { sz=1.2; col.setHSL(Math.random(), 1, 0.5); geo=new THREE.BoxGeometry(sz,sz,sz); }
        else if(type==='roller') { sz=1.0; col.setHSL(Math.random(), 1, 0.5); geo=new THREE.TetrahedronGeometry(sz); }
        else if(type==='jumper') { sz=1.0; col.setHSL(Math.random(), 1, 0.5); geo=new THREE.TorusGeometry(sz*0.6, sz*0.2, 8, 16); }
        else { geo=new THREE.IcosahedronGeometry(sz,1); }

        const b=new CANNON.Body({mass:15, shape:(type==='cube'?new CANNON.Box(new CANNON.Vec3(sz/2,sz/2,sz/2)):new CANNON.Sphere(sz)), material:this.game.materials.ene, linearDamping:0.4, collisionFilterGroup:4, collisionFilterMask:1|2|4});
        b.position.set(x,y,z); this.game.world.addBody(b);

        let mat;
        if (type === 'phantom') { mat = new THREE.MeshStandardMaterial({color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.0}); }
        else if (type === 'fire') { mat = new THREE.MeshStandardMaterial({color: col, emissive: 0xffaa00, emissiveIntensity: 1.0}); }
        else { mat = new THREE.MeshStandardMaterial({color: col}); }
        const m=new THREE.Mesh(geo, mat);

        if (type === 'fire') {
            const pGeo = new THREE.BufferGeometry(); const pPos = new Float32Array(60); for(let i=0;i<60;i++) pPos[i]=(Math.random()-0.5)*1.5;
            pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
            m.add(new THREE.Points(pGeo, new THREE.PointsMaterial({color:0xffaa00, size:0.3, transparent:true, opacity:0.8})));
        }
        this.game.scene.add(m);
        this.game.entities.enemies.push({body:b, mesh:m, type, hp: (type==='fire'?5:3)*hpMult, state:'normal', wetTimer:0, isTarget:(type==='target')});
        if (this.game.gameState.missionType==='annihilation') this.game.gameState.enemiesToSpawn--;
    }

    killEnemy(e, isEscape=false) {
        if(!this.game.entities.enemies.includes(e))return;
        if(e.isCompositePart) {
            this.game.spawnParticle(e.mesh.position,15,0xffaa00); this.removeEnemy(e);
            const p=this.game.entities.enemies.find(en=>en.body.id===e.parentId); if(p){p.partsCount--; if(p.partsCount<=0) { this.removeEnemy(p); this.game.gameState.req=0; }}
            return;
        }
        this.removeEnemy(e);
        this.game.spawnParticle(e.mesh.position, 20, e.type==='fire'?0xff4400:0xffffff);
        if(this.game.gameState.missionType==='hunt' && e.isTarget) { this.game.gameState.req=0; }
        else if(this.game.gameState.req>0 && !isEscape){
            this.game.gameState.req--;
            if(this.game.gameState.req<=0) { this.game.showMsg(`WAVE ${this.game.gameState.wave} CLEAR`, "#fe0"); [...this.game.entities.enemies].forEach(en=>this.removeEnemy(en)); if(this.game.vip){this.game.world.removeBody(this.game.vip.body); this.game.scene.remove(this.game.vip.mesh); this.game.vip=null;} setTimeout(() => this.nextWave(), 2000); }
        } else { this.spawnEnemy(); }
    }

    removeEnemy(e) {
        if(!this.game.entities.enemies.includes(e)) return;
        this.game.entities.enemies = this.game.entities.enemies.filter(o=>o!==e);
        this.game.safeRemoveMesh(e.mesh);
        this.game.world.removeBody(e.body);
    }

    updateTank(dt) {
        const waterTank = this.game.waterTank;
        if(!waterTank.mesh) return;

        if (waterTank.destroyed) {
            waterTank.floodTimer -= dt;
            if (waterTank.floodTimer <= 0) {
                waterTank.destroyed = false; waterTank.hp = 100;
                waterTank.mesh.rotation.z = 0;
                waterTank.mesh.position.copy(waterTank.origPos);
                waterTank.body.position.copy(waterTank.origPos);
                waterTank.body.quaternion.set(0,0,0,1);
                if(waterTank.waterPlane) { this.game.scene.remove(waterTank.waterPlane); waterTank.waterPlane=null; }
                this.game.spawnText("タンク修復完了", waterTank.mesh.position, "#0f0");
            }
        } else {
            if (waterTank.hp <= 0) {
                waterTank.destroyed = true; waterTank.floodTimer = 30.0;
                waterTank.mesh.rotation.z = Math.PI/4; waterTank.mesh.position.y -= 2;
                this.game.spawnText("タンク崩壊!!", waterTank.mesh.position, "#0af"); this.game.spawnParticle(waterTank.mesh.position, 100, 0x00aaff, 5.0);
                const flood = new THREE.Mesh(new THREE.PlaneGeometry(40, 80), new THREE.MeshBasicMaterial({color:0x0055aa, transparent:true, opacity:0.7}));
                flood.rotation.x = -Math.PI/2; flood.position.set(20, this.config.field.roofY+0.1, 0);
                this.game.scene.add(flood); waterTank.waterPlane = flood;
                this.game.showMsg("屋上水没エリア化 (30s)", "#0af");
            }
        }
    }

    checkWaterSurface(pos) {
        const CFG = this.config;
        const waterTank = this.game.waterTank;
        if (pos.y < 3 && pos.x > CFG.field.poolX - 10 && pos.x < CFG.field.poolX + 10 && pos.z > CFG.field.poolZ - 20 && pos.z < CFG.field.poolZ + 20) return true;
        if (waterTank && waterTank.destroyed && pos.y > CFG.field.roofY - 1 && pos.y < CFG.field.roofY + 5 && Math.abs(pos.x - 20) < 20 && Math.abs(pos.z) < 40) return true;
        return false;
    }

    checkEnemies(dt) {
        const vip = this.game.vip;
        const playerBody = this.game.player.body;

        if(vip) {
            vip.mesh.position.copy(vip.body.position); vip.mesh.quaternion.copy(vip.body.quaternion);
            const toP = playerBody.position.vsub(vip.body.position); toP.y=0; toP.normalize();
            if(playerBody.position.distanceTo(vip.body.position)>5) vip.body.applyForce(toP.scale(20), vip.body.position);
            if(vip.hp <= 0) { this.game.showMsg("護衛対象死亡... GAME OVER", "#f00"); setTimeout(()=>{location.reload()}, 3000); }
        }

        this.game.entities.enemies.forEach(e => {
            const pos = e.body.position;
            const pPos = playerBody.position;
            const targetPos = (vip && Math.random()<0.7) ? vip.body.position : pPos;
            const distToT = pos.distanceTo(targetPos);
            const onWater = this.checkWaterSurface(pos);

            this.game.entities.waterSplashes.forEach(s => {
                const distXZ = Math.hypot(pos.x - s.pos.x, pos.z - s.pos.z);
                if (distXZ < s.radius && pos.y > s.pos.y && pos.y < s.pos.y + s.height) {
                    if (e.type === 'fire' && e.state !== 'wet') {
                        e.state = 'wet'; e.wetTimer = 10.0;
                        this.game.spawnText("鎮火!", new THREE.Vector3(pos.x, pos.y, pos.z), "#0af"); this.game.spawnParticle(pos, 20, 0xffffff);
                        if(e.mesh.children[0]) e.mesh.children[0].visible = false;
                        e.body.velocity.set(0,0,0); e.body.angularVelocity.set(0,0,0);
                    }
                    if (e.type === 'phantom') { e.state = 'wet'; e.wetTimer = 5.0; }
                }
            });

            if (e.type === 'fire') {
                if (e.state === 'wet') {
                    e.wetTimer -= dt; e.mesh.material.color.setHex(this.config.colors.wet_ene); e.mesh.material.emissiveIntensity = 0;
                    e.body.linearDamping = 0.95; e.body.angularDamping = 0.95;
                    const distFromCenter = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
                    if (distFromCenter > 50) {
                        const returnDir = new CANNON.Vec3(-pos.x, 0, -pos.z); returnDir.normalize();
                        e.body.applyForce(returnDir.scale(30), pos);
                    }
                    if (e.wetTimer <= 0) {
                        e.state = 'normal'; e.mesh.material.color.setHex(this.config.colors.fire_ene); e.mesh.material.emissiveIntensity = 1;
                        if(e.mesh.children[0]) e.mesh.children[0].visible = true; this.game.spawnText("再燃!", new THREE.Vector3(pos.x, pos.y, pos.z), "#f40");
                        e.body.velocity.y = 10;
                    }
                } else {
                    e.body.linearDamping = 0.5;
                    const targetY = Math.max(5, targetPos.y + 1.5);
                    const diffY = targetY - pos.y;
                    e.body.applyForce(new CANNON.Vec3(0, 30 * e.body.mass + diffY * 20, 0), pos);
                    const dir = new CANNON.Vec3().copy(targetPos).vsub(pos); dir.y = 0; dir.normalize();
                    const speed = distToT > 10 ? 80 : 40;
                    e.body.applyForce(dir.scale(speed), pos);
                    if (distToT < 2.0) {
                        if(vip && distToT === pos.distanceTo(vip.body.position)) { vip.hp--; this.game.spawnText("VIP Damage!", new THREE.Vector3(vip.body.position.x, vip.body.position.y+2, vip.body.position.z), "#f00"); }
                        else this.game.player.takeDamage(1);
                    }
                    this.game.entities.kekkai.forEach(k => {
                       if (!k.isGhost && k.mesh.position.distanceTo(pos) < Math.max(k.mesh.scale.x, k.mesh.scale.z)) {
                           this.game.spawnParticle(pos, 5, 0xff0000); this.removeKekkai(k);
                       }
                    });
                }
            }
            else if (e.type === 'phantom') {
                let visible = false;
                if(onWater) visible = true;
                if(e.state === 'wet') { visible = true; e.wetTimer -= dt; if(e.wetTimer<=0)e.state='normal'; }
                let reflecting = false;
                this.game.windows.forEach(w => { if(pos.distanceTo(w.position) < 8) reflecting = true; });
                if(onWater) reflecting = true;
                if(distToT < 4.0) visible = true;
                e.mesh.material.opacity = (reflecting || visible) ? 0.9 : 0.05;
                e.mesh.material.color.setHex(visible ? this.config.colors.phantom : (reflecting ? 0xff00ff : 0xffffff));

                if (visible && e.state === 'wet') e.body.angularVelocity.set(0, 10, 0);
                else {
                    if (targetPos.y > pos.y + 3) e.body.velocity.y = 5;
                    const dir = new CANNON.Vec3().copy(targetPos).vsub(pos); dir.normalize();
                    if(distToT > 15) e.body.applyForce(dir.scale(25), pos); else e.body.applyForce(dir.scale(15), pos);
                    if (distToT < 2.0) {
                        if(vip && distToT === pos.distanceTo(vip.body.position)) { vip.hp--; this.game.spawnText("VIP Damage!", new THREE.Vector3(vip.body.position.x, vip.body.position.y+2, vip.body.position.z), "#f00"); }
                        else this.game.player.takeDamage(1);
                    }
                }
            }
            else if(e.type === 'cube' || e.type === 'roller' || e.type === 'jumper' || e.type === 'normal') {
                const dir = new CANNON.Vec3().copy(targetPos).vsub(pos); dir.normalize();
                if(e.type === 'cube') { e.body.angularVelocity.set(0,10,0); e.body.applyForce(dir.scale(20), pos); }
                else if(e.type === 'roller') { e.body.torque.set(dir.z*20, 0, -dir.x*20); }
                else if(e.type === 'jumper') {
                    if(pos.y < 1 && Math.random()<0.05) e.body.velocity.y=15;
                    e.body.applyForce(dir.scale(15), pos);
                } else { e.body.applyForce(dir.scale(20), pos); }

                if (distToT < 1.5) {
                    if(vip && distToT === pos.distanceTo(vip.body.position)) { vip.hp--; this.game.spawnText("VIP Damage!", new THREE.Vector3(vip.body.position.x, vip.body.position.y+2, vip.body.position.z), "#f00"); }
                    else this.game.player.takeDamage(1);
                }
            }
            if(pos.y < -10) this.killEnemy(e);
            e.mesh.position.copy(pos); e.mesh.quaternion.copy(e.body.quaternion);
        });
    }

    performMetsu(t) {
        if(!t||t.shrinking)return;
        if(this.game.player.sp < this.config.kekkai.metsuCost){ this.game.showMsg("霊力不足","#f00"); return; }
        this.game.player.sp -= this.config.kekkai.metsuCost;
        const center = t.mesh.position.clone();
        if (t.isWaterCube || this.checkWaterSurface(center)) { this.createWaterSplash(center); }
        this.game.spawnText("滅",t.mesh.position,"#f24"); t.shrinking=true;
        if(t.body){this.game.world.removeBody(t.body);t.body=null;}
    }

    createWaterSplash(pos) {
        this.game.spawnText("水柱!!", pos, "#0af"); this.game.spawnParticle(pos, 80, 0x00aaff, 4.0);
        this.game.entities.waterSplashes.push({pos: pos, radius: 8.0, height: 40.0, timer: 0.8});
    }

    createKekkai(p, s, r, isGhost=false) {
        const b = new CANNON.Body({ mass: 0, material: this.game.materials.kek, collisionFilterGroup: 2, collisionFilterMask: 1|2|4 });
        b.position.copy(p); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), r);
        let isWaterCube = false;
        if (!isGhost && this.checkWaterSurface(p)) { isWaterCube = true; this.game.spawnText("水充填", p, "#0af"); }
        if(!isGhost) { b.addShape(new CANNON.Box(new CANNON.Vec3(s.x/2, s.y/2, s.z/2))); }
        else {
             const t=0.5, x=s.x/2, y=s.y/2, z=s.z/2;
             b.addShape(new CANNON.Box(new CANNON.Vec3(t,y,z)), new CANNON.Vec3(-x,0,0)); b.addShape(new CANNON.Box(new CANNON.Vec3(t,y,z)), new CANNON.Vec3(x,0,0));
             b.addShape(new CANNON.Box(new CANNON.Vec3(x,t,z)), new CANNON.Vec3(0,-y,0)); b.addShape(new CANNON.Box(new CANNON.Vec3(x,t,z)), new CANNON.Vec3(0,y,0));
             b.addShape(new CANNON.Box(new CANNON.Vec3(x,y,t)), new CANNON.Vec3(0,0,-z)); b.addShape(new CANNON.Box(new CANNON.Vec3(x,y,t)), new CANNON.Vec3(0,0,z));
        }
        this.game.world.addBody(b);
        const col = isWaterCube ? 0x0088ff : (isGhost ? this.config.colors.ghost : this.config.colors.kekkai);
        const op = isWaterCube ? 0.7 : (isGhost ? 0.3 : 0.5);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshPhongMaterial({color: col, transparent:true, opacity:op, side:THREE.DoubleSide}));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.5}));
        m.add(edges); m.position.copy(p); m.rotation.y = r; this.game.scene.add(m);
        this.game.entities.kekkai.push({ body:b, mesh:m, edges:edges, shrinking:false, isGhost, isWaterCube });
        if(!isWaterCube) this.game.spawnText("結", p, isGhost?"#0ff":"#ff0");
    }

    actionMetsu() { let t=this.game.currentTargetKekkai; if(t)this.performMetsu(t); else this.game.showMsg("対象なし","#aaa"); }
    actionKai() { let t=this.game.currentTargetKekkai; if(t)this.removeKekkai(t); else if(this.game.entities.kekkai.length>0)this.removeKekkai(this.game.entities.kekkai[this.game.entities.kekkai.length-1]); }
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
        const sun=new THREE.DirectionalLight(0xffffee,1.2); sun.position.set(-50,100,50); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
        scene.add(sun); scene.add(new THREE.AmbientLight(0x333344,0.6));

        const gGeo=new THREE.PlaneGeometry(CFG.field.width+40,CFG.field.depth+40); const gMat=new THREE.MeshStandardMaterial({color:CFG.colors.ground,roughness:0.9});
        const groundMesh = new THREE.Mesh(gGeo,gMat); groundMesh.rotation.x=-Math.PI/2; groundMesh.receiveShadow=true; scene.add(groundMesh);
        const gBody=new CANNON.Body({mass:0,material:mat}); gBody.addShape(new CANNON.Plane()); gBody.quaternion.setFromEuler(-Math.PI/2,0,0); world.addBody(gBody);
        this.game.groundMesh = groundMesh;

        const bX=20, bZ=0, bW=40, bD=80, bH=CFG.field.roofY;
        const createBox=(x,y,z,w,h,d,col,tr=false,op=1,rotY=0)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:col,transparent:tr,opacity:op})); m.position.set(x,y,z); m.rotation.y=rotY; m.castShadow=!tr; m.receiveShadow=true; scene.add(m); const b=new CANNON.Body({mass:0,material:mat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.copy(m.position); b.quaternion.copy(m.quaternion); world.addBody(b); return m; };

        createBox(bX, bH/2, bZ, bW, bH, bD, CFG.colors.building);
        createBox(bX, bH-1, bZ, bW, 2, bD, CFG.colors.concrete); // Roof Floor

        for(let y=5; y<bH; y+=7) {
            for(let z=-bD/2+5; z<bD/2; z+=10) {
                const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({color: 0x88ccff, transparent:true, opacity:0.6}));
                win.position.set(bX-bW/2-0.1, y, z); win.rotation.y = -Math.PI/2; scene.add(win); this.game.windows.push(win);
            }
        }

        const tRad=5, tH=8;
        const tankM = new THREE.Mesh(new THREE.CylinderGeometry(tRad, tRad, tH, 16), new THREE.MeshStandardMaterial({color: 0xcccccc}));
        tankM.position.set(bX, bH+tH/2, bZ); scene.add(tankM);
        const tankB = new CANNON.Body({mass:0, material:mat, collisionFilterGroup:2, collisionFilterMask:1|4});
        tankB.addShape(new CANNON.Cylinder(tRad, tRad, tH, 16)); tankB.position.copy(tankM.position); world.addBody(tankB);
        this.game.waterTank.mesh = tankM; this.game.waterTank.body = tankB; this.game.waterTank.origPos = tankM.position.clone();

        const pW=20, pD=40, pX=CFG.field.poolX, pZ=CFG.field.poolZ;
        const water = new THREE.Mesh(new THREE.PlaneGeometry(pW, pD), new THREE.MeshBasicMaterial({color:CFG.colors.water, transparent:true, opacity:0.6}));
        water.rotation.x = -Math.PI/2; water.position.set(pX, 0.2, pZ); scene.add(water);
        createBox(pX-pW/2-1, 1, pZ, 2, 2, pD, 0x888888); createBox(pX+pW/2+1, 1, pZ, 2, 2, pD, 0x888888);
        createBox(pX, 1, pZ-pD/2-1, pW+4, 2, 2, 0x888888); createBox(pX, 1, pZ+pD/2+1, pW+4, 2, 2, 0x888888);

        const slW=6, slL=80;
        const slAng = Math.atan2(bH, slL);
        const slLen = Math.sqrt(bH*bH + slL*slL);
        const slX = -3;
        const slY = bH/2;
        const slZ = bZ - 5;

        const slB=new CANNON.Body({mass:0,material:mat});
        slB.addShape(new CANNON.Box(new CANNON.Vec3(slW/2, 0.5, slLen/2)));
        slB.position.set(slX, slY, slZ);
        slB.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), slAng);
        world.addBody(slB);

        const slM=new THREE.Mesh(new THREE.BoxGeometry(slW, 1, slLen), new THREE.MeshStandardMaterial({color:CFG.colors.concrete}));
        slM.position.copy(slB.position); slM.quaternion.copy(slB.quaternion);
        scene.add(slM);

        const hrH=1.2, hrT=0.1;
        const railL = new THREE.Mesh(new THREE.BoxGeometry(hrT, hrH, slLen), new THREE.MeshStandardMaterial({color:CFG.colors.wall}));
        railL.position.set(slX-slW/2+0.1, slY+1, slZ); railL.quaternion.copy(slB.quaternion); scene.add(railL);

        const FW=CFG.field.width, FD=CFG.field.depth;
        createBox(-FW/2, 4, 0, 2, 8, FD, CFG.colors.wall); createBox(FW/2, 4, 0, 2, 8, FD, CFG.colors.wall);
        createBox(0, 4, -FD/2, FW, 8, 2, CFG.colors.wall); createBox(0, 4, FD/2, FW, 8, 2, CFG.colors.wall);
        const gZ = FD/2; const gateW = 24;
        createBox(-gateW/2-1, 4, gZ, 2, 8, 2, CFG.colors.wall); createBox(gateW/2+1, 4, gZ, 2, 8, 2, CFG.colors.wall);
        const gateB = new CANNON.Body({mass:0, material:mat}); gateB.addShape(new CANNON.Box(new CANNON.Vec3(gateW/2, 3, 0.1))); gateB.position.set(0, 3, gZ); world.addBody(gateB);
    }
}
