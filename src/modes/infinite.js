import { StandardMode } from './standard.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class InfiniteMode extends StandardMode {
    constructor() {
        super();
        this.config.colors.sky = 0x220033; // Darker purple sky for Infinite
        this.config.dist.max = 60.0;
        this.waveDifficulty = 1.0;
    }

    init() {
        this.game.gameState.wave = 1;
        this.game.gameState.missionType = 'infinite';
        this.game.els.missionText.textContent = "INFINITE SURVIVAL";
        this.game.gameState.req = 9999;
        this.game.showMsg("ENDLESS MODE START", "#f0f");

        // Initial spawn
        for(let i=0; i<5; i++) this.spawnEnemy();
    }

    update(dt, t) {
        super.update(dt, t);

        // Continuous Spawning
        const enemyCount = this.game.entities.enemies.length;
        const cap = 10 + Math.floor(this.game.gameState.wave * 2);

        if (enemyCount < cap && Math.random() < 0.05) {
            this.spawnEnemy();
        }

        // Difficulty ramping
        if (this.game.stats.damageDealt > this.game.gameState.wave * 100) {
            this.game.gameState.wave++;
            this.game.showMsg(`DANGER LEVEL ${this.game.gameState.wave}`, "#f00");
            this.waveDifficulty += 0.2;
        }
    }

    spawnEnemy() {
        const fW = this.config.field.width, fD = this.config.field.depth;

        // Higher chance of dangerous types
        let type = 'normal';
        const r = Math.random();
        // Limit Boss Core to 1 instance (Spec 6)
        if (r < 0.1 && !this.game.entities.enemies.some(e => e.type === 'boss_eater_core')) {
             type = 'boss_eater_core';
        }
        else if (r < 0.3) type = 'fire';
        else if (r < 0.5) type = 'phantom';
        else if (r < 0.6) type = 'eater';
        else if (r < 0.7) type = 'cone';
        else type = 'normal';

        let x = (Math.random()-.5)*fW;
        let z = (Math.random()-.5)*fD;
        let y = 10 + Math.random() * 20;

        const hpMult = this.waveDifficulty;
        let sz = 0.8 + Math.random()*0.5;
        let col = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
        let geo;

        if (type === 'boss_eater_core') {
            sz = 3.0; col.setHex(0xff0000); geo = new THREE.IcosahedronGeometry(sz, 2);
        } else if (type === 'fire') {
            col.setHex(this.config.colors.fire_ene); geo = new THREE.IcosahedronGeometry(sz, 1);
        } else if (type === 'phantom') {
            col.setHex(this.config.colors.phantom); geo = new THREE.IcosahedronGeometry(sz, 1);
        } else if (type === 'cone') {
            geo = new THREE.ConeGeometry(sz*0.6, sz*1.5, 8);
        } else {
            geo = new THREE.IcosahedronGeometry(sz, 0);
        }

        const mass = (type === 'boss_eater_core') ? 500 : 15;
        const b = new CANNON.Body({mass:mass, shape:new CANNON.Sphere(sz), material:this.game.materials.ene, collisionFilterGroup:4, collisionFilterMask:1|2|4});
        b.position.set(x, y, z); this.game.world.addBody(b);

        const mat = new THREE.MeshStandardMaterial({color: col});
        const m = new THREE.Mesh(geo, mat);
        this.game.scene.add(m);

        const hpVal = (type==='boss_eater_core' ? 50 : 5) * hpMult;

        this.game.entities.enemies.push({
            body:b, mesh:m, type, hp: hpVal, hpMax: hpVal,
            state:'chase', // Always aggressive
            isBoss: (type === 'boss_eater_core')
        });
    }
}
