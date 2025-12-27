import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class BaseMode {
    constructor() {
        this.game = null;
        this.config = {};
    }

    init() {
        // To be implemented by subclasses
        this.startWave();
    }

    update(dt, t) {
        // Common update logic
    }

    setupEnvironment(scene, world, mat) {
         // To be implemented
    }

    createKekkai(p, s, r, isGhost) {
        // Standard implementation
    }

    actionMetsu() {}
    actionKai() {}
    actionGlobalMetsu() {}
    actionGlobalKai() {}

    spawnEnemy(forceType) {}
    killEnemy(e, isEscape) {}
    removeEnemy(e) {}

    removeKekkai(k) {
        if (this.game.currentTargetKekkai === k) this.game.currentTargetKekkai = null;
        this.game.safeRemoveMesh(k.mesh);
        if (k.body) this.game.world.removeBody(k.body);
        this.game.entities.kekkai = this.game.entities.kekkai.filter(o => o !== k);
    }
}
