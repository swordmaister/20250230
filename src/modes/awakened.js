import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StandardMode } from './standard.js';

export class AwakenedMode extends StandardMode {
    constructor() {
        super();
        this.isAwakened = true;
        // Override config for Awakened Mode
        this.config.colors.sky = 0x050011; // Dark Violet Night
        this.config.colors.ground = 0x221133;
        this.config.colors.kekkai = 0xaa00ff; // Violet Barriers
        this.config.colors.ghost = 0xff00ff;
        this.config.colors.highlight = 0x00ffff; // Cyan Highlight

        // Stats Buff
        this.config.player.speed = 20.0; // Faster
        this.config.player.jump = 30.0; // Higher
        this.config.player.maxSp = 200; // More SP
        this.config.kekkai.spRegen = 15.0; // Faster Regen

        // Abilities
        this.smartAimActive = true;
        this.canDoubleJump = true;
        this.jumpCount = 0;
    }

    init() {
        super.init();
        this.game.showMsg("AWAKENED MODE START", "#d0f");
    }

    canMultiJump(player) {
        if(this.jumpCount < 2) {
             player.body.velocity.y = this.config.player.jump;
             this.jumpCount++;
             this.game.spawnParticle(player.body.position, 10, 0x00ffff);
             return true;
        }
        return false;
    }

    update(dt, t) {
        super.update(dt, t);

        // Reset jump count if on ground
        if(Math.abs(this.game.player.body.velocity.y) < 0.1) {
            this.jumpCount = 0;
        }

        // Zekkai Damage Logic handled in player update mainly, but enemy repulsion here
        if (this.game.player.zekkaiActive) {
            const zPos = this.game.player.body.position;
            const range = 3.0;
            this.game.entities.enemies.forEach(e => {
                const dist = e.body.position.distanceTo(zPos);
                if (dist < range) {
                    const pushDir = e.body.position.vsub(zPos); pushDir.normalize();
                    e.body.applyImpulse(pushDir.scale(50), e.body.position);
                    this.killEnemy(e); // Instant kill small enemies
                    this.game.spawnParticle(e.mesh.position, 5, 0xaa00ff);
                }
            });
        }
    }

    performMetsu(t) {
        if(!t || t.shrinking) return;
        super.performMetsu(t); // Destroy target

        // Chain Reaction
        const range = 15.0;
        this.game.entities.kekkai.forEach(k => {
            if (k !== t && !k.shrinking) {
                const dist = k.mesh.position.distanceTo(t.mesh.position);
                if (dist < range) {
                    setTimeout(() => {
                         if (!k.shrinking) this.performMetsu(k);
                    }, 100 + dist * 20); // Delay based on distance for ripple effect
                }
            }
        });

        // Explosion Damage to enemies near the Metsu
        const blastRadius = 10.0;
        this.game.entities.enemies.forEach(e => {
            const dist = e.body.position.distanceTo(t.mesh.position);
            if (dist < blastRadius) {
                this.killEnemy(e);
            }
        });
    }

    // Enhance Aim Assist
    updateAimMarker() {
         // Logic already hooked in Player class via instanceof check
    }
}
