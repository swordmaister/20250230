import { StandardMode } from './standard.js';

export class AwakenedMode extends StandardMode {
    constructor() {
        super();
        this.isAwakened = true;
        this.config = {
            colors: {
                sky: 0x050011, ground: 0x221133, kekkai: 0xaa00ff, ghost: 0xff00ff,
                drawPhys: 0xaa00ff, drawGhost: 0xff00ff, highlight: 0x00ffff, marker: 0xff0000,
                wall: 0x444455, building: 0x666677, concrete: 0x888899,
                water: 0x00aaff, fire_ene: 0xff4400, phantom: 0xaa00ff, wet_ene: 0x4444ff,
                vip: 0x00ffff, giant: 0x880000, target: 0xFFD700, gate: 0x222222
            },
            player: { speed: 20.0, jump: 30.0, height: 1.7, maxHp: 100, maxSp: 200 },
            kekkai: { sensitivity: 150.0, spCostPerSec: 1.0, spRegen: 15.0, metsuCost: 2.0 },
            dist: { min: 0.0, max: 40.0, default: 6.0 },
            aimAssist: { baseRadius: 1.5 },
            field: { width: 120, depth: 160, poolX: -30, poolZ: 10, roofY: 30 }
        };
        this.smartAimActive = true;
        this.allowMultiJump = true;
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

        if(Math.abs(this.game.player.body.velocity.y) < 0.1) {
            this.jumpCount = 0;
        }

        if (this.game.player.zekkaiActive) {
            const zPos = this.game.player.body.position;
            const range = 3.0;
            this.game.entities.enemies.forEach(e => {
                const dist = e.body.position.distanceTo(zPos);
                if (dist < range) {
                    const pushDir = e.body.position.vsub(zPos); pushDir.normalize();
                    e.body.applyImpulse(pushDir.scale(50), e.body.position);
                    this.killEnemy(e);
                    this.game.spawnParticle(e.mesh.position, 5, 0xaa00ff);
                }
            });
        }
    }

    performMetsu(t) {
        if(!t || t.shrinking) return;
        super.performMetsu(t);

        const range = 15.0;
        this.game.entities.kekkai.forEach(k => {
            if (k !== t && !k.shrinking) {
                const dist = k.mesh.position.distanceTo(t.mesh.position);
                if (dist < range) {
                    setTimeout(() => { if (!k.shrinking) this.performMetsu(k); }, 100 + dist * 20);
                }
            }
        });

        const blastRadius = 10.0;
        this.game.entities.enemies.forEach(e => {
            const dist = e.body.position.distanceTo(t.mesh.position);
            if (dist < blastRadius) {
                this.killEnemy(e);
            }
        });
    }
}
