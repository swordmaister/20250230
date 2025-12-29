import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class StandardMode {
    constructor() {
        this.game = null;
        this.config = {
            colors: {
                sky: 0x87CEEB, ground: 0x667755, kekkai: 0xffff00, ghost: 0x00ffff,
                drawPhys: 0xffff00, drawGhost: 0x00ffff, highlight: 0xff0044, marker: 0xff0000,
                wall: 0x888899, building: 0xbbbbcc, concrete: 0xaaaaaa,
                water: 0x00aaff, fire_ene: 0xff4400, phantom: 0xaa00ff, wet_ene: 0x4444ff,
                vip: 0x00ffff, giant: 0x880000, target: 0xFFD700, gate: 0x333333
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

    cleanupWave() {
        // Clear all enemies, bullets, items
        [...this.game.entities.enemies].forEach(e => this.removeEnemy(e));
        [...this.game.entities.items].forEach(i => {
            this.game.safeRemoveMesh(i.mesh);
            this.game.world.removeBody(i.body);
        });
        this.game.entities.items = [];
        // VIP cleanup if exists
        if(this.game.vip) {
            this.game.world.removeBody(this.game.vip.body);
            this.game.scene.remove(this.game.vip.mesh);
            this.game.vip = null;
        }
        // Reset timers
        this.game.gameState.nextSpawn = 0;
    }

    startWave() {
        this.cleanupWave();
        this.game.gameState.enemiesToSpawn = 0;

        const w = this.game.gameState.wave;

        // Spec 2: Wave 1-6 Sequence
        switch(w) {
            case 1: // Annihilation
                this.game.gameState.missionType='normal';
                this.game.els.missionText.textContent="WAVE 1: 殲滅任務";
                this.game.gameState.req=5;
                for(let i=0; i<5; i++) this.spawnEnemy();
                break;
            case 2: // Escort
                this.game.gameState.missionType='escort';
                this.game.els.missionText.textContent="WAVE 2: VIP護衛";
                this.game.gameState.req=1; // Reach gate to win
                this.spawnVIP();
                for(let i=0; i<5; i++) this.spawnEnemy();
                break;
            case 3: // Cleanup (Falling Giants)
                this.game.gameState.missionType='boss_composite';
                this.game.els.missionText.textContent="WAVE 3: 大型残骸処理";
                this.game.gameState.req=1;
                this.spawnCompositeBoss();
                // Spawn composite parts high up? spawnCompositeBoss handles position.
                // We add some interference enemies
                for(let i=0; i<3; i++) this.spawnEnemy();
                break;
            case 4: // Puzzle
                this.game.gameState.missionType='normal'; // Treat as normal clearing but with puzzle logic
                this.game.els.missionText.textContent="WAVE 4: パズル部隊";
                this.game.gameState.req=1; // 1 Core group
                this.spawnPuzzleGroup();
                for(let i=0; i<3; i++) this.spawnEnemy();
                break;
            case 5: // Chase
                this.game.gameState.missionType='hunt';
                this.game.els.missionText.textContent="WAVE 5: ターゲット追跡";
                this.game.gameState.req=1;
                this.spawnEnemy('target');
                for(let i=0; i<5; i++) this.spawnEnemy();
                break;
            case 6: // Eater Boss
                this.game.gameState.missionType='boss_eater';
                this.game.els.missionText.textContent="WAVE 6: 決戦 結界食い";
                this.game.gameState.req=1;
                this.spawnEnemy('boss_eater_core');
                for(let i=0; i<10; i++) this.spawnEnemy('eater');
                break;
            default: // Loop or End
                if (w > 6) {
                    this.game.showResult();
                    return;
                }
                break;
        }

        this.game.showMsg(`WAVE ${w} START`, "#fff");
    }

    nextWave() {
        this.game.gameState.wave++;
        this.startWave();
    }

    spawnVIP() {
        const pos = new CANNON.Vec3(20, 30, 0); // Rooftop start
        const b = new CANNON.Body({mass:10, shape:new CANNON.Sphere(1), collisionFilterGroup:1, collisionFilterMask:1|2|4});
        b.position.copy(pos); b.linearDamping = 0.8; this.game.world.addBody(b);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1,2), new THREE.MeshPhongMaterial({color:this.config.colors.vip, emissive:0x0044ff}));
        this.game.scene.add(m);
        this.game.vip = {
            body:b, mesh:m, hp:10,
            state: 'roof',
            waypoints: [
                new THREE.Vector3(0, 30, -40), // Slope Top
                new THREE.Vector3(-3, 0, 35),  // Slope Bottom
                new THREE.Vector3(0, 0, 75)    // Gate
            ],
            wpIndex: 0
        };
        this.game.spawnText("護衛開始: 屋上->校門", new THREE.Vector3(pos.x, pos.y, pos.z), "#0ff");
    }

    spawnCompositeBoss() {
        this.game.showMsg("WARNING: FALLING OBJECT", "#f00");
        const b=new CANNON.Body({mass:0}); b.position.set(0,20,0); b.id=-999;
        const m=new THREE.Group(); this.game.scene.add(m);
        this.game.entities.enemies.push({body:b, mesh:m, isCompositeCore:true, partsCount:0});
        const add=(x,y,z,sx,sy,sz,hp)=>{
            const pb=new CANNON.Body({mass:50, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            // Spawn high up (Y+60)
            pb.addShape(new CANNON.Box(new CANNON.Vec3(sx/2,sy/2,sz/2))); pb.position.set(x,60+y,z); this.game.world.addBody(pb);
            const pm=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), new THREE.MeshStandardMaterial({color:this.config.colors.giant}));
            this.game.scene.add(pm);
            this.game.entities.enemies.push({body:pb, mesh:pm, isCompositePart:true, parentId:b.id, hp});
            this.game.entities.enemies[this.game.entities.enemies.length-2].partsCount++;
        };
        add(0,0,0,6,10,4,20); add(-8,5,0,3,8,3,10); add(8,5,0,3,8,3,10); add(0,8,0,4,4,4,10);
        this.game.spawnText("解体目標 落下!!", new THREE.Vector3(0,30,0), "#f00");
    }

    spawnPuzzleGroup() {
        const cx = (Math.random()-.5)*this.config.field.width;
        const cz = (Math.random()-.5)*this.config.field.depth;
        const cy = 20; // Higher
        // Boss-like size: Radius 4.0 (Big!)
        const coreB = new CANNON.Body({mass:500, shape:new CANNON.Sphere(4.0), material:this.game.materials.ene, collisionFilterGroup:4, collisionFilterMask:1|2|4});
        coreB.position.set(cx, cy, cz); this.game.world.addBody(coreB);
        const coreM = new THREE.Mesh(new THREE.DodecahedronGeometry(4.0), new THREE.MeshStandardMaterial({color:0xffff00}));
        this.game.scene.add(coreM);

        const coreId = coreB.id;
        const parts = [];
        const colors = [0xff0000, 0x00ff00, 0x0000ff];

        this.game.entities.enemies.push({body:coreB, mesh:coreM, type:'puzzle_core', isPuzzleCore:true, hp:50, puzzleParts:[], isInvincible:true}); // More HP
        const coreRef = this.game.entities.enemies[this.game.entities.enemies.length-1];

        // Spawn 3 Minions (Boss-like size: Box 4x4x4)
        colors.forEach((c, i) => {
            const angle = (i / 3) * Math.PI * 2;
            const mx = cx + Math.cos(angle) * 12; // Radius 12
            const mz = cz + Math.sin(angle) * 12;
            const mb = new CANNON.Body({mass:100, shape:new CANNON.Box(new CANNON.Vec3(2,2,2)), material:this.game.materials.ene, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            mb.position.set(mx, cy, mz); this.game.world.addBody(mb);
            const mm = new THREE.Mesh(new THREE.BoxGeometry(4,4,4), new THREE.MeshStandardMaterial({color:c}));
            this.game.scene.add(mm);

            this.game.entities.enemies.push({body:mb, mesh:mm, type:'puzzle_minion', hp:15, puzzleId:i, parentId:coreId, colorVal:c}); // More HP
        });

        const order = [0, 1, 2].sort(() => Math.random() - 0.5);
        coreRef.puzzleOrder = order;
        coreRef.currentStep = 0;
        coreRef.lastKillTime = 0; // For simultaneous check
        this.game.spawnText("PUZZLE BOSS: 順序ヲ守レ", new THREE.Vector3(cx, cy+8, cz), "#ff0");
    }

    spawnEnemy(forceType=null) {
        if (this.game.gameState.missionType === 'annihilation' && this.game.gameState.enemiesToSpawn <= 0) return;

        // Cap Check
        let cap = 15 + Math.floor(this.game.gameState.wave / 2);
        if (this.game.gameState.missionType === 'boss_composite') cap = 5;
        if (this.game.gameState.missionType === 'boss_eater') cap = 20; // Allow large numbers for boss fight

        if (this.game.gameState.missionType === 'boss_composite' && this.game.entities.enemies.filter(e=>!e.isBoss).length >= 5) return;
        if (this.game.entities.enemies.length >= cap) return;
        if (this.game.entities.enemies.length >= cap) return;

        const fW=this.config.field.width, fD=this.config.field.depth;
        let type = 'normal';
        if(forceType) type = forceType;
        else if (this.game.gameState.missionType === 'boss_eater') type = 'eater';
        else if (this.game.gameState.wave === 3) type = 'normal'; // Cleanup wave interference
        else {
            // Spec 3: Random Shape/Behavior
            const rand = Math.random();
            if (rand < 0.2) type = 'fire';
            else if (rand < 0.4) type = 'phantom';
            else if (rand < 0.5) type = 'cube';
            else if (rand < 0.6) type = 'roller';
            else if (rand < 0.7) type = 'jumper';
            else if (rand < 0.8) type = 'cone'; // New shape
            else if (rand < 0.9) type = 'torus'; // New shape
            else type = 'normal';
        }

        if (type === 'puzzle') { this.spawnPuzzleGroup(); return; }

        let x,y,z;
        if (type === 'boss_eater_core') {
            x = (Math.random()-.5) * (fW - 20); z = (Math.random()-.5) * (fD - 20); y = 40 + Math.random() * 40;
            this.game.showMsg("結界食い(核) 出現！ 上空を捜索せよ！", "#f0f");
        } else {
            // Random spawn pos
            x = (Math.random()-.5)*fW; z = (Math.random()-.5)*fD; y = 10 + Math.random()*20;
        }

        const hpMult = 1 + (this.game.gameState.wave-1)*0.2;
        let sz = 0.8 + Math.random()*0.5; // Spec 3: Size Variation
        let col = new THREE.Color().setHSL(Math.random(), 0.7, 0.5); // Spec 3: Random Color
        let geo;

        // Specific overrides
        if(type==='boss_eater_core') { sz = 2.5; col.setHex(0xFF0055); geo = new THREE.IcosahedronGeometry(sz, 2); }
        else if(type==='target') { col.setHex(this.config.colors.target); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='fire') { col.setHex(this.config.colors.fire_ene); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='phantom') { col.setHex(this.config.colors.phantom); geo=new THREE.IcosahedronGeometry(sz,1); }
        else if(type==='eater') { col.setHex(0xaa2222); geo=new THREE.OctahedronGeometry(sz,0); }

        // Random Geometries for others (Spec 3)
        else {
            if (type==='cube') geo = new THREE.BoxGeometry(sz,sz,sz);
            else if (type==='roller') geo = new THREE.TetrahedronGeometry(sz);
            else if (type==='jumper') geo = new THREE.TorusGeometry(sz*0.6, sz*0.2, 8, 16);
            else if (type==='cone') geo = new THREE.ConeGeometry(sz*0.6, sz*1.5, 8);
            else if (type==='torus') geo = new THREE.TorusKnotGeometry(sz*0.4, sz*0.1, 64, 8); // More complex shape
            else geo = new THREE.IcosahedronGeometry(sz,0);
        }

        // Mask 1(Player)|2(Kekkai)|4(Enemy). Fire ignores Kekkai(2) initially -> Mask 1|4 = 5
        const mask = (type === 'fire') ? 1|4 : 1|2|4;
        const mass = (type === 'boss_eater_core') ? 500 : 15;
        const b=new CANNON.Body({mass:mass, shape:(type==='cube'?new CANNON.Box(new CANNON.Vec3(sz/2,sz/2,sz/2)):new CANNON.Sphere(sz)), material:this.game.materials.ene, linearDamping:0.4, collisionFilterGroup:4, collisionFilterMask:mask});
        b.position.set(x,y,z);
        if(type === 'boss_eater_core') b.linearDamping = 0.9;
        this.game.world.addBody(b);

        let mat;
        if (type === 'boss_eater_core') { mat = new THREE.MeshStandardMaterial({color: 0xFF0055, emissive: 0x550022, roughness: 0.2}); }
        else if (type === 'phantom') { mat = new THREE.MeshStandardMaterial({color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.0}); }
        else if (type === 'fire') { mat = new THREE.MeshStandardMaterial({color: col, emissive: 0xffaa00, emissiveIntensity: 1.0}); }
        else { mat = new THREE.MeshStandardMaterial({color: col}); }
        const m=new THREE.Mesh(geo, mat);

        if (type === 'fire') {
            const pGeo = new THREE.BufferGeometry(); const pPos = new Float32Array(60); for(let i=0;i<60;i++) pPos[i]=(Math.random()-0.5)*1.5;
            pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
            m.add(new THREE.Points(pGeo, new THREE.PointsMaterial({color:0xffaa00, size:0.3, transparent:true, opacity:0.8})));
        }
        this.game.scene.add(m);

        let hpVal = (type==='fire'?5:3)*hpMult;
        if(type === 'boss_eater_core') hpVal = 50 * hpMult;

        const isBoss = (type === 'boss_eater_core');

        // Spec 8: Initial Patrol State
        const initState = (['normal','roller','jumper'].includes(type) && Math.random()<0.5) ? 'patrol' : 'chase';

        this.game.entities.enemies.push({
            body:b, mesh:m, type, hp: hpVal, hpMax: hpVal,
            state: initState, wetTimer:0,
            isTarget:(type==='target'),
            isBoss: isBoss,
            floatOffset: Math.random()*100
        });
        if (this.game.gameState.missionType==='annihilation') this.game.gameState.enemiesToSpawn--;
    }

    completeWave() {
        this.game.showMsg(`WAVE ${this.game.gameState.wave} CLEAR`, "#fe0");
        [...this.game.entities.enemies].forEach(en => this.removeEnemy(en));
        if (this.game.vip) {
            this.game.world.removeBody(this.game.vip.body);
            this.game.scene.remove(this.game.vip.mesh);
            this.game.vip = null;
        }
        setTimeout(() => this.nextWave(), 2000);
    }

    // New Method: Handle Metsu Damage
    onMetsuHit(e) {
        if (!e) return;

        // Damage Logic for Bosses
        if (e.isBoss || e.type === 'puzzle_minion' || e.type === 'puzzle_core' || e.isCompositePart || e.type === 'eater') {
            e.hp = (e.hp || 1) - 10; // 10 damage per metsu tick/hit
            this.game.spawnText("HIT!", e.mesh.position, "#f00");

            // Push back
            if (e.body) {
                const push = e.body.position.vsub(this.game.player.body.position);
                push.normalize();
                e.body.applyImpulse(push.scale(50), e.body.position);
            }

            if (e.hp <= 0) {
                this.killEnemy(e);
            } else {
                // Flash effect
                e.mesh.material.emissive.setHex(0xff0000);
                setTimeout(() => { if(e.mesh) e.mesh.material.emissive.setHex(0x000000); }, 100);
            }
        } else {
            // Instant kill for small fries
            this.killEnemy(e);
        }
    }

    killEnemy(e, isEscape=false) {
        if(!this.game.entities.enemies.includes(e))return;

        // Stats
        if(!isEscape) this.game.stats.damageDealt += e.hpMax || 1;

        // Composite Boss Logic
        if(e.isCompositePart) {
            this.game.spawnParticle(e.mesh.position,25,0xffaa00); this.removeEnemy(e);
            const p=this.game.entities.enemies.find(en=>en.body.id===e.parentId); if(p){p.partsCount--; if(p.partsCount<=0) { this.removeEnemy(p); this.game.gameState.req=0; this.completeWave(); }}
            return;
        }

        // Puzzle Logic
        if(e.type === 'puzzle_minion') {
            const core = this.game.entities.enemies.find(en => en.body.id === e.parentId);
            if(core) {
                const now = Date.now();
                const timeDiff = now - (core.lastKillTime || 0);
                core.lastKillTime = now;

                const requiredIndex = core.puzzleOrder[core.currentStep];

                // Spec 1: Simultaneous Kill Check (Too fast = Fail) or Wrong Order
                if (timeDiff < 500) { // < 0.5s means simultaneous
                     this.failPuzzle(core, e, "同時撃破不可!");
                     return;
                }

                if (e.puzzleId === requiredIndex) {
                    // Correct Order
                    this.game.spawnText("OK!", e.mesh.position, "#0f0");
                    this.game.spawnParticle(e.mesh.position, 15, e.colorVal);
                    this.removeEnemy(e);
                    core.currentStep++;
                    if (core.currentStep >= 3) {
                        core.isInvincible = false;
                        core.mesh.material.color.setHex(0xff0000); // Vulnerable
                        this.game.spawnText("防御解除!", core.mesh.position, "#f00");
                    }
                } else {
                    // Wrong Order
                    this.failPuzzle(core, e, "順序不正!");
                }
            } else {
                this.removeEnemy(e); // Orphaned minion
            }
            return;
        }
        if(e.type === 'puzzle_core') {
            if(e.isInvincible && !isEscape) {
                this.game.spawnText("無敵", e.mesh.position, "#888");
                return;
            }
        }

        this.removeEnemy(e);
        this.game.spawnParticle(e.mesh.position, 20, e.type==='fire'?0xff4400:0xffffff);

        // Spec 1: Item Drop (30%)
        if (Math.random() < 0.3) {
            this.spawnItem(e.mesh.position);
        }

        if(this.game.gameState.missionType==='hunt' && e.isTarget) {
            this.game.gameState.req=0;
            this.completeWave();
        }
        else if(this.game.gameState.req>0 && !isEscape){
            this.game.gameState.req--;
            if(this.game.gameState.req<=0) {
                this.completeWave();
            }
        } else { this.spawnEnemy(); }
    }

    failPuzzle(core, e, msg) {
        this.game.spawnText(msg + " 全復活", e.mesh.position, "#f00");
        this.game.spawnParticle(e.mesh.position, 20, 0x555555);

        // Remove all current minions
        [...this.game.entities.enemies].forEach(en => {
            if(en.type === 'puzzle_minion' && en.parentId === core.body.id) this.removeEnemy(en);
        });

        // Reset Step and Respawn
        core.currentStep = 0;
        const cx = core.body.position.x;
        const cz = core.body.position.z;
        const cy = 20;

        const colors = [0xff0000, 0x00ff00, 0x0000ff];
        colors.forEach((c, i) => {
            const angle = (i / 3) * Math.PI * 2;
            const mx = cx + Math.cos(angle) * 12;
            const mz = cz + Math.sin(angle) * 12;
            const mb = new CANNON.Body({mass:100, shape:new CANNON.Box(new CANNON.Vec3(2,2,2)), material:this.game.materials.ene, collisionFilterGroup:4, collisionFilterMask:1|2|4});
            mb.position.set(mx, cy, mz); this.game.world.addBody(mb);
            const mm = new THREE.Mesh(new THREE.BoxGeometry(4,4,4), new THREE.MeshStandardMaterial({color:c}));
            this.game.scene.add(mm);

            this.game.entities.enemies.push({body:mb, mesh:mm, type:'puzzle_minion', hp:15, puzzleId:i, parentId:core.body.id, colorVal:c});
        });
    }

    removeEnemy(e) {
        if(!this.game.entities.enemies.includes(e)) return;
        this.game.entities.enemies = this.game.entities.enemies.filter(o=>o!==e);
        this.game.safeRemoveMesh(e.mesh);
        this.game.world.removeBody(e.body);
    }

    spawnItem(pos) {
        // Spec 1: HP Recovery Item
        const item_b = new CANNON.Body({mass:1, shape:new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5)), material:this.game.materials.def});
        item_b.position.copy(pos);
        this.game.world.addBody(item_b);
        const item_m = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0x00ff00, wireframe:true}));
        item_m.position.copy(pos);
        this.game.scene.add(item_m);
        this.game.entities.items.push({body:item_b, mesh:item_m});
        this.game.spawnText("ITEM!", pos, "#0f0");
    }

    removeKekkai(k) {
        if (this.game.currentTargetKekkai === k) this.game.currentTargetKekkai = null;
        this.game.safeRemoveMesh(k.mesh);
        if (k.body) this.game.world.removeBody(k.body);
        this.game.entities.kekkai = this.game.entities.kekkai.filter(o => o !== k);
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

            // Waypoint Logic
            if(vip.wpIndex < vip.waypoints.length) {
                const target = vip.waypoints[vip.wpIndex];
                const vPos = new THREE.Vector3(vip.body.position.x, vip.body.position.y, vip.body.position.z);
                const dist2D = Math.hypot(target.x - vPos.x, target.z - vPos.z);

                if (dist2D < 3.0) {
                    vip.wpIndex++;
                } else {
                    const dir = new CANNON.Vec3(target.x - vPos.x, 0, target.z - vPos.z);
                    dir.normalize();
                    // Slow movement force
                    if(vip.body.velocity.length() < 3.0) {
                        vip.body.applyForce(dir.scale(30), vip.body.position);
                    }
                }
            } else {
                // Reached Gate (End of waypoints)
                if(this.game.gameState.missionType === 'escort' && this.game.gameState.req > 0) {
                    this.game.gameState.req = 0;
                    this.game.showMsg("VIP 登校完了!", "#0f0");
                    this.completeWave(); // Trigger clear
                }
            }

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
                    if (e.body.collisionFilterMask !== (1|2|4)) e.body.collisionFilterMask = 1|2|4; // Enable Kekkai Collision
                    const distFromCenter = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
                    if (distFromCenter > 50) {
                        const returnDir = new CANNON.Vec3(-pos.x, 0, -pos.z); returnDir.normalize();
                        e.body.applyForce(returnDir.scale(30), pos);
                    }
                    if (e.wetTimer <= 0) {
                        e.state = 'normal'; e.mesh.material.color.setHex(this.config.colors.fire_ene); e.mesh.material.emissiveIntensity = 1;
                        if(e.mesh.children[0]) e.mesh.children[0].visible = true; this.game.spawnText("再燃!", new THREE.Vector3(pos.x, pos.y, pos.z), "#f40");
                        e.body.velocity.y = 10;
                        e.body.collisionFilterMask = 1|4; // Disable Kekkai Collision
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
                    // Fire Enemy passes through barriers naturally via collision mask (1|4).
                }
            }
            else if (e.type === 'eater') {
                // Eater Logic: Prioritize Kekkai
                let targetK = null; let minD = 999;
                this.game.entities.kekkai.forEach(k => {
                    const d = pos.distanceTo(k.mesh.position);
                    if(d < 80 && d < minD) { minD = d; targetK = k; }
                });

                const dest = targetK ? targetK.mesh.position : targetPos;
                const dir = new CANNON.Vec3().copy(dest).vsub(pos); dir.normalize();
                e.body.applyForce(dir.scale(25), pos);

                if(targetK) {
                    const box = new THREE.Box3().setFromObject(targetK.mesh);
                    if (box.intersectsSphere(new THREE.Sphere(pos, 1.2))) {
                        this.game.spawnParticle(e.mesh.position, 20, 0xff00ff);
                        this.removeKekkai(targetK);
                    }
                } else if (distToT < 2.0) {
                    if(vip && distToT === pos.distanceTo(vip.body.position)) { vip.hp--; }
                    else this.game.player.takeDamage(1);
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
            else if(e.type === 'boss_eater_core') { // Spec C-Special 1 Core Movement
                // Hover and Circle logic
                const time = Date.now() * 0.001;
                const hoverY = 40 + Math.sin(time + (e.floatOffset||0)) * 5;
                const targetX = Math.sin(time * 0.5) * 30;
                const targetZ = Math.cos(time * 0.5) * 30;

                const forceX = (targetX - pos.x) * 100;
                const forceY = (hoverY - pos.y) * 500; // Strong lift to counter gravity
                const forceZ = (targetZ - pos.z) * 100;

                e.body.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), pos);
                e.body.angularVelocity.set(0, 0.5, 0);
            }
            else if(['cube', 'roller', 'jumper', 'normal', 'cone', 'torus'].includes(e.type)) {
                // Spec 8: Patrol or Chase
                let dir = new CANNON.Vec3();

                if (e.state === 'patrol') {
                    if (!e.patrolPoint) {
                        // Pick a random patrol point on the field
                        const fW = this.config.field.width * 0.8;
                        const fD = this.config.field.depth * 0.8;
                        e.patrolPoint = new CANNON.Vec3((Math.random()-0.5)*fW, 10, (Math.random()-0.5)*fD);
                    }
                    dir.copy(e.patrolPoint).vsub(pos);
                    dir.normalize();

                    // Check if reached or Player near
                    if (pos.distanceTo(e.patrolPoint) < 5.0) e.patrolPoint = null; // Next point
                    if (distToT < 20.0) { e.state = 'chase'; this.game.spawnText("発見!", pos, "#f00"); } // Switch to chase
                } else {
                    // Chase
                    dir.copy(targetPos).vsub(pos); dir.normalize();
                }

                // Spec 3: Dive Bomb (Only if chasing or high up)
                if (pos.y > 15 && distToT < 30 && Math.random() < 0.05) {
                    const dive = new CANNON.Vec3().copy(targetPos).vsub(pos).normalize();
                    e.body.velocity.set(dive.x*50, dive.y*50, dive.z*50);
                    this.game.spawnText("DIVE!", pos, "#f00");
                } else {
                    if(e.type === 'cube') { e.body.angularVelocity.set(0,10,0); e.body.applyForce(dir.scale(20), pos); }
                    else if(e.type === 'roller') { e.body.torque.set(dir.z*20, 0, -dir.x*20); }
                    else if(e.type === 'jumper') {
                        if(pos.y < 1 && Math.random()<0.05) e.body.velocity.y=15;
                        e.body.applyForce(dir.scale(15), pos);
                    }
                    else { e.body.applyForce(dir.scale(20), pos); }
                }

                if (distToT < 1.5) {
                    if(vip && distToT === pos.distanceTo(vip.body.position)) { vip.hp--; this.game.spawnText("VIP Damage!", new THREE.Vector3(vip.body.position.x, vip.body.position.y+2, vip.body.position.z), "#f00"); }
                    else this.game.player.takeDamage(1);
                }
            }
            if(pos.y < -10) this.killEnemy(e);

            // Check Bounds (Inside walls is ~ +/-60, +/-80)
            const limitX = 60; const limitZ = 80;
            const isOutX = Math.abs(pos.x) > limitX;
            const isOutZ = Math.abs(pos.z) > limitZ;

            if(isOutX || isOutZ) {
                // Strong Return Logic
                if (isOutX) {
                    e.body.position.x = Math.sign(pos.x) * limitX;
                    e.body.velocity.x *= -0.8; // Bounce back
                }
                if (isOutZ) {
                    e.body.position.z = Math.sign(pos.z) * limitZ;
                    e.body.velocity.z *= -0.8;
                }

                // Additional inward force
                const toCenter = new CANNON.Vec3(-pos.x, 0, -pos.z);
                toCenter.normalize();
                e.body.applyForce(toCenter.scale(150), pos);

                e.outsideTimer = (e.outsideTimer || 0) + dt;
                if(e.outsideTimer > 10.0) {
                    this.game.spawnText("敵撤退", pos, "#aaa");
                    this.killEnemy(e, true);
                } else {
                    // Jump back to center if stuck for a short time
                    if(e.body.velocity.y < 1.0 && pos.y < 5.0 && e.outsideTimer > 1.0) {
                        e.body.velocity.y = 25;
                        e.body.velocity.x = toCenter.x * 25;
                        e.body.velocity.z = toCenter.z * 25;
                        this.game.spawnText("戻る!", pos, "#ff0");
                        e.outsideTimer = 0;
                    }
                }
            } else {
                e.outsideTimer = 0;
            }

            // Spec 4: High Flight Ceiling (60m)
            if (e.body.position.y > 60) {
                 e.body.applyForce(new CANNON.Vec3(0, -20 * e.body.mass, 0), pos);
            } else if (['boss_eater_core'].includes(e.type) && e.body.position.y < 30) {
                 // Force Boss up
                 e.body.applyForce(new CANNON.Vec3(0, 50 * e.body.mass, 0), pos);
            }

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
        if(!isWaterCube) {
            this.game.spawnText("結", p, isGhost?"#0ff":"#ff0");
            if (!isGhost) this.game.stats.kekkaiCount++;
        }
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

        // Brighter Sun for Day
        sun.intensity = 1.8;

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
        const gateW = 24; const gZ = FD/2;

        // Side Walls
        createBox(-FW/2, 4, 0, 2, 8, FD, CFG.colors.wall); createBox(FW/2, 4, 0, 2, 8, FD, CFG.colors.wall);
        createBox(0, 4, -FD/2, FW, 8, 2, CFG.colors.wall); // Front wall

        // Back Wall (Split for Gate)
        const backWallW = (FW - gateW) / 2;
        createBox(-FW/2 + backWallW/2, 4, gZ, backWallW, 8, 2, CFG.colors.wall);
        createBox(FW/2 - backWallW/2, 4, gZ, backWallW, 8, 2, CFG.colors.wall);

        // Lattice Gate
        this.game.gatePos = new THREE.Vector3(0, 0, gZ);
        const gateGroup = new THREE.Group();
        gateGroup.position.set(0, 4, gZ);
        scene.add(gateGroup);

        // Frame
        const frameMat = new THREE.MeshStandardMaterial({color:0x222222});
        const fL = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), frameMat); fL.position.set(-gateW/2, 0, 0); gateGroup.add(fL);
        const fR = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), frameMat); fR.position.set(gateW/2, 0, 0); gateGroup.add(fR);
        const fT = new THREE.Mesh(new THREE.BoxGeometry(gateW, 1, 1), frameMat); fT.position.set(0, 3.5, 0); gateGroup.add(fT);

        // Dense Lattice
        const barMat = new THREE.MeshStandardMaterial({color:0x444444});

        // Vertical bars (Denser)
        for(let x=-gateW/2+1; x<=gateW/2-1; x+=0.8) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 8, 0.15), barMat);
            bar.position.set(x, 0, 0); gateGroup.add(bar);
        }
        // Horizontal bars (Denser)
        for(let y=-3.5; y<=3.5; y+=1.0) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(gateW, 0.15, 0.15), barMat);
            bar.position.set(0, y, 0); gateGroup.add(bar);
        }

        const gateB = new CANNON.Body({mass:0, material:mat});
        gateB.addShape(new CANNON.Box(new CANNON.Vec3(gateW/2, 4, 0.5)));
        gateB.position.set(0, 4, gZ);
        world.addBody(gateB);
    }
}
