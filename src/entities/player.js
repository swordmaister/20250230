import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class Player {
    constructor(game) {
        this.game = game;
        this.config = game.mode.config.player;

        // Physics Body
        this.body = new CANNON.Body({ mass: 70, shape: new CANNON.Sphere(0.6), material: game.materials.ply, fixedRotation: true, linearDamping: 0.9, collisionFilterGroup:1, collisionFilterMask:1|2|4 });
        this.body.position.set(0, 2, 60);
        game.world.addBody(this.body);

        this.body.addEventListener('collide', (e)=>{
            if(e.body && e.body.material && e.body.material.name==='ene') {
                const v = e.contact.getImpactVelocityAlongNormal();
                if(Math.abs(v)>2) {
                    this.takeDamage(Math.floor(Math.abs(v)*2));
                    const n = new CANNON.Vec3(); e.contact.ni.negate(n);
                    this.body.applyImpulse(n.scale(50*Math.abs(v)), this.body.position);
                }
            }
        });

        // State
        this.hp = this.config.maxHp;
        this.sp = this.config.maxSp;
        this.damageCooldown = 0;
        this.drawCooldown = 0;
        this.currentDist = game.mode.config.dist.default;
        this.isPhysMode = false;
        this.isFocusing = false;

        // Input State
        this.input = { x: 0, y: 0 };
        this.camAngle = { yaw: 0, pitch: 0 };
        this.raycaster = new THREE.Raycaster();

        // VR State
        this.controllers = [];
        this.controllerGrips = [];
        this.vrState = {
            left: { drawing:false, startHandPos:new THREE.Vector3(), startOrigin:new THREE.Vector3(), startDir:new THREE.Vector3(), mesh:null, body:null, triggerHeld:false },
            right: { drawing:false, startHandPos:new THREE.Vector3(), startOrigin:new THREE.Vector3(), startDir:new THREE.Vector3(), mesh:null, triggerHeld:false, bBtnHeld:false, lastDistZ:0 }
        };

        this.snapTurnAngle = 0; // For VR Snap Turn

        // Zekkai State (Awakened only)
        this.zekkaiActive = false;
        this.zekkaiMesh = null;
        this.zekkaiBody = null;
    }

    update(dt) {
        // Physics Sync
        const prevPos = this.game.playerGroup.position.clone();
        this.game.playerGroup.position.copy(this.body.position).add(new THREE.Vector3(0, this.config.height, 0));

        if (!this.game.gameState.isGameOver) {
            const dist = this.game.playerGroup.position.distanceTo(prevPos);
            if (dist < 10) this.game.stats.distance += dist; // Sanity check for teleport
        }

        // Skating Mechanic (Speed Boost on Barriers)
        this.raycaster.set(this.body.position, new THREE.Vector3(0,-1,0));
        const hits = this.raycaster.intersectObjects(this.game.entities.kekkai.map(k=>k.mesh));
        this.speedMult = (hits.length > 0 && hits[0].distance < 1.5) ? 1.8 : 1.0;

        if (this.game.renderer.xr.isPresenting) {
            this.handleVRInput(dt);
        } else {
            this.handleMobileInput(dt);
        }

        // Cooldowns
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        if (this.drawCooldown > 0) {
            this.drawCooldown -= dt;
            if (this.drawCooldown <= 0) this.game.showMsg("再構成可能", "#0ff");
        }

        // Regen
        this.sp = Math.min(this.config.maxSp, this.sp + this.game.mode.config.kekkai.spRegen * dt);
        const maintainCost = this.game.entities.kekkai.length * 1.0;
        this.sp -= maintainCost * dt;

        if (this.zekkaiActive) {
            this.sp -= 20.0 * dt; // High cost for Zekkai
            if (this.sp <= 0) this.toggleZekkai(false);
            if (this.zekkaiMesh) this.zekkaiMesh.position.copy(this.body.position);
            if (this.zekkaiBody) this.zekkaiBody.position.copy(this.body.position);
        }

        if (this.sp <= 0) {
             this.sp = 0;
             if (this.game.entities.kekkai.length > 0) {
                 this.game.mode.actionGlobalKai();
                 this.game.showMsg("霊力枯渇!!", "#f00");
             }
        }

        this.updateHUD();
        this.updateAimMarker();
    }

    handleVRInput(dt) {
        const session = this.game.renderer.xr.getSession(); if(!session) return;
        const cam = this.game.renderer.xr.getCamera(); cam.updateMatrixWorld(true);
        const _vecDir = new THREE.Vector3(); const _vecUp = new THREE.Vector3(0,1,0); const _vecRight = new THREE.Vector3();
        this.game.camera.getWorldDirection(_vecDir); _vecDir.y = 0; _vecDir.normalize();
        _vecRight.crossVectors(_vecDir, _vecUp).normalize().negate();

        for(const src of session.inputSources){
            if(!src.gamepad) continue;
            const gp = src.gamepad;
            const idx = (src.handedness === 'left') ? 0 : 1;
            if(!this.controllers[idx]) continue;
            const ctrl = this.controllers[idx];

            if(src.handedness === 'left') {
                const stickX = gp.axes[2]; const stickY = gp.axes[3];
                if(Math.abs(stickX) > 0.1 || Math.abs(stickY) > 0.1) {
                    const v = _vecDir.clone().multiplyScalar(-stickY).add(_vecRight.clone().multiplyScalar(-stickX));
                    this.body.velocity.x = v.x * this.config.speed;
                    this.body.velocity.z = v.z * this.config.speed;
                } else {
                    this.body.velocity.x = 0; this.body.velocity.z = 0;
                }
                if(gp.buttons[0].pressed){ if(!this.vrState.left.triggerHeld){this.game.mode.actionKai(); this.vrState.left.triggerHeld=true;} } else this.vrState.left.triggerHeld=false;

                // Zekkai Toggle (X Button - Button 4 on Left)
                if (gp.buttons[4] && gp.buttons[4].pressed && this.game.mode.isAwakened) {
                    if (!this.zekkaiDebounce) { this.toggleZekkai(); this.zekkaiDebounce = true; }
                } else {
                    this.zekkaiDebounce = false;
                }

                const grip = gp.buttons[1].pressed;
                if (this.drawCooldown > 0 && grip) {}
                else if (grip) {
                    if (!this.vrState.left.drawing) { this.startVRDraw('left', ctrl.position, _vecDir); } else { this.updateVRDraw('left', ctrl.position, true); }
                } else if (this.vrState.left.drawing) { this.finishVRDraw('left', false); }
            } else { // Right Hand
                // Fix: Snap Turn logic
                if (Math.abs(gp.axes[2]) > 0.5) {
                    if (!this.snapTurnHeld) {
                        this.snapTurnAngle -= Math.sign(gp.axes[2]) * (Math.PI / 4); // 45 degrees
                        this.snapTurnHeld = true;
                    }
                } else {
                    this.snapTurnHeld = false;
                }

                // Jump (A Button)
                if(gp.buttons[4].pressed) this.jump();

                // B Button: Adjust Dist
                if(gp.buttons[5].pressed) {
                    if(!this.vrState.right.bBtnHeld) { this.vrState.right.bBtnHeld=true; this.vrState.right.lastDistZ = ctrl.position.z; }
                    const dz = (this.vrState.right.lastDistZ - ctrl.position.z) * 20;
                    this.currentDist = Math.max(0, Math.min(40, this.currentDist + dz));
                    this.vrState.right.lastDistZ = ctrl.position.z;
                } else this.vrState.right.bBtnHeld = false;

                // Trigger: Metsu
                if(gp.buttons[0].pressed) {
                    if(!this.vrState.right.triggerHeld) { this.game.mode.actionMetsu(); this.vrState.right.triggerHeld=true; }
                } else this.vrState.right.triggerHeld = false;

                // Grip: Draw
                const grip = gp.buttons[1].pressed;
                if (this.drawCooldown > 0 && grip) {}
                else if (grip) {
                    if (!this.vrState.right.drawing) { this.startVRDraw('right', ctrl.position, _vecDir); } else { this.updateVRDraw('right', ctrl.position, false); }
                } else if (this.vrState.right.drawing) { this.finishVRDraw('right', true); }
            }
        }
        // Apply rotation to player group
        this.game.playerGroup.rotation.y = this.snapTurnAngle;
    }

    // ... (rest of methods: startVRDraw, updateVRDraw, finishVRDraw, handleMobileInput, etc.)
    startVRDraw(hand, pos, dir) {
        const state = this.vrState[hand];
        state.drawing = true;
        state.startHandPos.copy(pos);
        state.startOrigin.copy(this.game.aimMarker.position);
        state.startDir.copy(dir);

        const g = new THREE.BoxGeometry(1,1,1);
        const col = (hand==='left') ? 0xffff00 : 0x00ffff; // Yellow/Blue
        const m = new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.5});
        state.mesh = new THREE.Mesh(g, m);
        state.mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({color:0xffffff})));
        this.game.scene.add(state.mesh);

        if (hand==='left') {
             state.body = new CANNON.Body({mass:0, collisionFilterGroup:2, collisionFilterMask:1|2|4});
             state.body.addShape(new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5)));
             state.body.position.copy(state.startOrigin);
             this.game.world.addBody(state.body);
        }
    }

    updateVRDraw(hand, pos, isPhys) {
        const state = this.vrState[hand];
        const sens = this.game.mode.config.kekkai.sensitivity * (isPhys ? 1.0 : 1.5);
        const dx = Math.abs(pos.x - state.startHandPos.x);
        const dy = Math.abs(pos.y - state.startHandPos.y);
        const dz = Math.abs(pos.z - state.startHandPos.z);
        const hMove = Math.sqrt(dx*dx + dz*dz);

        const sx = 1.0 + hMove * sens;
        const sy = 1.0 + dy * sens;
        const sz = 1.0 + hMove * sens;

        const shiftAmount = (sz - 1.0) * 0.45;
        const shiftVec = state.startDir.clone().multiplyScalar(shiftAmount);

        state.mesh.position.copy(state.startOrigin).add(shiftVec);
        state.mesh.scale.set(sx, sy, sz);

        if (state.body) {
            this.game.world.removeBody(state.body);
            const nb = new CANNON.Body({mass:0, collisionFilterGroup:2, collisionFilterMask:1|2|4});
            nb.position.copy(state.mesh.position);
            nb.addShape(new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2)));
            this.game.world.addBody(nb);
            state.body = nb;
        }
    }

    finishVRDraw(hand, isGhost) {
        const state = this.vrState[hand];
        this.game.mode.createKekkai(state.mesh.position, state.mesh.scale, 0, isGhost);
        this.game.safeRemoveMesh(state.mesh);
        if(state.body) this.game.world.removeBody(state.body);
        state.drawing = false;
        state.mesh = null;
        state.body = null;
    }

    handleMobileInput(dt) {
        const fwd = new THREE.Vector3(this.input.x, 0, this.input.y).applyAxisAngle(new THREE.Vector3(0,1,0), this.camAngle.yaw);
        this.body.velocity.x = fwd.x * this.config.speed * (this.speedMult || 1.0);
        this.body.velocity.z = fwd.z * this.config.speed * (this.speedMult || 1.0);

        this.game.playerGroup.rotation.y = this.camAngle.yaw;
        this.game.camera.rotation.x = this.camAngle.pitch;
    }

    setupMobileControls() {
        const stick = document.getElementById('stickZone');
        const knob = document.getElementById('stickKnob');
        const stickStart = {x:0, y:0};
        let stickId = null;
        let tapTime = 0;
        let tapPos = {x:0, y:0};

        const resetStick = () => { stickId=null; this.input.x=0; this.input.y=0; knob.style.transform='translate(-50%,-50%)'; };

        stick.addEventListener('touchstart',e=>{e.preventDefault(); if(stickId)return; const t=e.changedTouches[0]; stickId=t.identifier; const r=stick.getBoundingClientRect(); stickStart.x=r.left+r.width/2; stickStart.y=r.top+r.height/2; tapTime=Date.now(); handleStick(t.clientX,t.clientY); },{passive:false});
        stick.addEventListener('touchmove',e=>{e.preventDefault(); if(stickId===null)return; for(let i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===stickId)handleStick(e.changedTouches[i].clientX,e.changedTouches[i].clientY); },{passive:false});

        // Important: Listen on window for release anywhere
        window.addEventListener('touchend',e=>{for(let i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===stickId){
            // No tap jump on stick, handled by button
            resetStick();
        }});
        window.addEventListener('touchcancel',e=>{for(let i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===stickId) resetStick();});

        const handleStick = (cx,cy) => { let dx=cx-stickStart.x, dy=cy-stickStart.y; const d=Math.hypot(dx,dy), max=(stick.offsetWidth/2)*0.8; if(d>max){dx*=max/d;dy*=max/d;} this.input.x=dx/max; this.input.y=dy/max; knob.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };

        // Camera Look
        let lookId = null; let lastLook = {x:0, y:0};
        this.game.renderer.domElement.addEventListener('touchstart', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if(!lookId && e.changedTouches[i].target === this.game.renderer.domElement) {
                    lookId = e.changedTouches[i].identifier;
                    lastLook = {x:e.changedTouches[i].clientX, y:e.changedTouches[i].clientY};
                }
            }
        }, {passive:false});

        window.addEventListener('touchmove', e => {
            if(!lookId) return;
            for(let i=0; i<e.changedTouches.length; i++) {
                if(e.changedTouches[i].identifier === lookId) {
                    const t = e.changedTouches[i];
                    this.camAngle.yaw -= (t.clientX - lastLook.x) * 0.004;
                    this.camAngle.pitch -= (t.clientY - lastLook.y) * 0.004;
                    this.camAngle.pitch = Math.max(-1.5, Math.min(1.5, this.camAngle.pitch));
                    lastLook = {x:t.clientX, y:t.clientY};
                }
            }
        }, {passive:false});

        const endLook = (e) => { for(let i=0; i<e.changedTouches.length; i++) if(e.changedTouches[i].identifier===lookId) lookId=null; };
        window.addEventListener('touchend', endLook); window.addEventListener('touchcancel', endLook);

        // Buttons
        document.getElementById('btnDown').addEventListener('touchstart', e => { e.preventDefault(); this.jump(); });

        // Distance / Focus
        let distTouchStart = {x:0,y:0}; let distBtnTimer=null; let distBtnLongPress=false;
        const btnUp = document.getElementById('btnUp');
        btnUp.addEventListener('touchstart', e => {
            e.preventDefault();
            distTouchStart = {x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY};
            distBtnLongPress = false;
            distBtnTimer = setTimeout(() => {
                this.isFocusing = !this.isFocusing;
                this.game.showMsg(this.isFocusing ? "集中モード ON" : "集中モード OFF", "#f00");
                distBtnLongPress = true;
            }, 500);
        });
        btnUp.addEventListener('touchend', e => {
            e.preventDefault();
            if(distBtnTimer) clearTimeout(distBtnTimer);
            if(distBtnLongPress) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - distTouchStart.x, dy = t.clientY - distTouchStart.y;
            if(Math.max(Math.abs(dx), Math.abs(dy)) < 10) {
                 if(this.currentDist < 10) this.currentDist = 15; else if(this.currentDist < 20) this.currentDist = 35; else this.currentDist = 6;
            } else {
                 if(Math.abs(dx) > Math.abs(dy)) this.currentDist = 15;
                 else { if(dy < 0) this.currentDist = 35; else this.currentDist = 6; }
            }
            document.getElementById('distLabel').textContent = this.currentDist===6?"近":(this.currentDist===15?"中":"遠");
            this.game.showMsg(`射程: ${this.currentDist}m`, "#fff");
        });

        // Action: Metsu/Kai
        let actId=null; let actStartPos={x:0,y:0};
        const btnLeft = document.getElementById('btnLeft');
        btnLeft.addEventListener('touchstart', e=>{e.preventDefault(); if(actId)return; actId=e.changedTouches[0].identifier; actStartPos={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};});
        btnLeft.addEventListener('touchend', e=>{
            e.preventDefault();
            for(let i=0;i<e.changedTouches.length;i++) {
                if(e.changedTouches[i].identifier === actId) {
                    if(Math.hypot(e.changedTouches[i].clientX - actStartPos.x, e.changedTouches[i].clientY - actStartPos.y) > 20) this.game.mode.actionKai();
                    else this.game.mode.actionMetsu();
                    actId=null;
                }
            }
        });

        // Mode Switch (and Zekkai via slide)
        const modeBtn = document.getElementById('modeSwitch');
        let modeTouchStart = {x:0, y:0};
        let modeIsSlide = false;

        modeBtn.addEventListener('touchstart', e => {
            e.preventDefault(); e.stopPropagation();
            const t = e.changedTouches[0];
            modeTouchStart = {x:t.clientX, y:t.clientY};
            modeIsSlide = false;
        });

        modeBtn.addEventListener('touchmove', e => {
             e.preventDefault(); e.stopPropagation();
             const t = e.changedTouches[0];
             const dx = t.clientX - modeTouchStart.x;
             if (Math.abs(dx) > 30 && !modeIsSlide && this.game.mode.isAwakened) { // Slide threshold
                 modeIsSlide = true;
                 this.toggleZekkai();
             }
        });

        modeBtn.addEventListener('touchend', e => {
            e.preventDefault(); e.stopPropagation();
            if (!modeIsSlide) {
                // Normal Click Behavior
                this.isPhysMode = !this.isPhysMode;
                modeBtn.textContent = this.isPhysMode ? "モード: 顕現" : "モード: 幽体";
                modeBtn.className = this.isPhysMode ? "phys" : "ghost";
                const btnRight = document.getElementById('btnRight');
                btnRight.style.background = this.isPhysMode ? "linear-gradient(135deg,#FFD700,#FF8C00)" : "linear-gradient(135deg,#03a9f4,#0288d1)";
                btnRight.innerHTML = this.isPhysMode ? "顕<br><span style='font-size:10px'>Hold</span>" : "結<br><span style='font-size:10px'>Hold</span>";

                if(this.zekkaiActive) this.updateZekkaiUI();
            }
        });

        // Draw (Right)
        let drawId = null; let activePhysKekkai = null; let drawState = { active:false, startX:0, startY:0, ghost:null };
        const btnRight = document.getElementById('btnRight');

        btnRight.addEventListener('touchstart', e => {
            e.preventDefault();
            if(this.drawCooldown > 0) { this.game.showMsg("共鳴妨害中...", "#f0f"); return; }
            if(drawId) return;
            const t = e.changedTouches[0]; drawId = t.identifier;
            btnRight.classList.add('drawing');

            if(this.isPhysMode) {
                 activePhysKekkai = this.createActiveMobile();
                 activePhysKekkai.startX = t.clientX; activePhysKekkai.startY = t.clientY;
            } else {
                 drawState.active = true; drawState.startX = t.clientX; drawState.startY = t.clientY;
                 const g = new THREE.BoxGeometry(1,1,1);
                 const m = new THREE.MeshBasicMaterial({color: this.game.mode.config.colors.drawGhost, transparent:true, opacity:0.2});
                 drawState.ghost = new THREE.Mesh(g, m);
                 drawState.ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({color:0xffffff})));
                 drawState.ghost.position.copy(this.game.aimMarker.position).sub(new THREE.Vector3(0,0.5,0));
                 drawState.ghost.rotation.y = this.camAngle.yaw;
                 this.game.scene.add(drawState.ghost);
            }
        });

        btnRight.addEventListener('touchmove', e => {
            e.preventDefault(); if(!drawId) return;
            for(let i=0; i<e.changedTouches.length; i++) {
                if(e.changedTouches[i].identifier === drawId) {
                    const t = e.changedTouches[i];
                    if(activePhysKekkai) {
                        const dx = Math.abs(t.clientX - activePhysKekkai.startX) * 0.03;
                        const dy = (activePhysKekkai.startY - t.clientY) * 0.03;
                        this.updateActiveMobile(activePhysKekkai, dx, dy);
                    } else if(drawState.ghost) {
                        const dx = Math.abs(t.clientX - drawState.startX) * 0.03 * 1.5;
                        const dy = (drawState.startY - t.clientY) * 0.03 * 1.5;
                        const s = 1 + Math.max(0, dx);
                        const sy = 1 + Math.max(0, dy);
                        drawState.ghost.scale.set(s, sy, s);
                    }
                }
            }
        });

        btnRight.addEventListener('touchend', e => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                if(e.changedTouches[i].identifier === drawId) {
                    if(activePhysKekkai) {
                        this.game.world.removeBody(activePhysKekkai.body);
                        this.game.mode.createKekkai(activePhysKekkai.mesh.position, activePhysKekkai.mesh.scale, activePhysKekkai.mesh.rotation.y, false);
                        this.game.safeRemoveMesh(activePhysKekkai.mesh);
                        activePhysKekkai = null;
                    } else if(drawState.ghost) {
                        this.game.mode.createKekkai(drawState.ghost.position, drawState.ghost.scale, drawState.ghost.rotation.y, true);
                        this.game.safeRemoveMesh(drawState.ghost);
                        drawState.ghost = null; drawState.active = false;
                    }
                    drawId = null;
                    btnRight.classList.remove('drawing');
                }
            }
        });
    }

    createActiveMobile() {
        const p = this.game.aimMarker.position.clone().sub(new THREE.Vector3(0,0.5,0));
        const r = this.camAngle.yaw;
        const b = new CANNON.Body({mass:0, collisionFilterGroup:2, collisionFilterMask:1|2|4});
        b.position.copy(p);
        b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), r);
        this.game.world.addBody(b);
        const m = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshPhongMaterial({color: this.game.mode.config.colors.drawPhys, transparent:true, opacity:0.5}));
        m.position.copy(p); m.rotation.y = r;
        this.game.scene.add(m);
        return {body:b, mesh:m, startP:p, startR:r};
    }

    updateActiveMobile(k, dx, dy) {
        const sx = 1 + Math.max(0, dx*10);
        const sy = 1 + Math.max(0, dy*10);
        k.mesh.scale.set(sx, sy, sx);
        k.mesh.position.y = k.startP.y;
        this.game.world.removeBody(k.body);
        k.body = new CANNON.Body({mass:0, collisionFilterGroup:2, collisionFilterMask:1|2|4});
        k.body.position.copy(k.mesh.position);
        k.body.quaternion.copy(k.mesh.quaternion);
        k.body.addShape(new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sx/2)));
        this.game.world.addBody(k.body);
    }

    jump() {
        if(Math.abs(this.body.velocity.y) < 1) this.body.velocity.y = this.config.jump;
        else if (this.game.mode.allowMultiJump && this.game.mode.canMultiJump(this)) {
            // Logic handled by mode if multijump allowed
        }
    }

    takeDamage(amount) {
        if(this.damageCooldown > 0 || this.game.gameState.isGameOver) return;
        this.hp = Math.max(0, this.hp - amount);
        this.game.stats.damageTaken += amount;
        this.damageCooldown = 1.0;
        this.game.els.dmgOverlay.style.opacity = 0.5;
        setTimeout(() => this.game.els.dmgOverlay.style.opacity = 0, 150);
        if(this.hp <= 0) {
            this.game.showMsg("GAME OVER", "#f00");
            this.game.gameState.isGameOver = true;
            // Maybe show result screen with "Failed" state or just reload
            setTimeout(()=>location.reload(), 3000);
        }
    }

    heal(amount) {
        this.hp = Math.min(this.config.maxHp, this.hp + amount);
        this.game.showMsg("RECOVER", "#0f0");
    }

    toggleZekkai(forceState = null) {
        const newState = forceState !== null ? forceState : !this.zekkaiActive;
        if (newState) {
            if (this.sp < 10) { this.game.showMsg("霊力不足", "#f00"); return; }
            this.zekkaiActive = true;
            this.game.showMsg("絶界 展開", "#a0f");
            const g = new THREE.SphereGeometry(2, 32, 32);
            const m = new THREE.MeshPhongMaterial({color: 0xaa00ff, transparent: true, opacity: 0.3, emissive: 0x440088});
            this.zekkaiMesh = new THREE.Mesh(g, m);
            this.game.scene.add(this.zekkaiMesh);
            this.zekkaiBody = new CANNON.Body({mass: 0, collisionFilterGroup: 2, collisionFilterMask: 4}); // Collides with enemies
            this.zekkaiBody.addShape(new CANNON.Sphere(2));
            this.game.world.addBody(this.zekkaiBody);
        } else {
            this.zekkaiActive = false;
            if (this.zekkaiMesh) { this.game.safeRemoveMesh(this.zekkaiMesh); this.zekkaiMesh = null; }
            if (this.zekkaiBody) { this.game.world.removeBody(this.zekkaiBody); this.zekkaiBody = null; }
        }
        this.updateZekkaiUI();
    }

    updateZekkaiUI() {
        const modeBtn = document.getElementById('modeSwitch');
        if (this.zekkaiActive) {
            modeBtn.style.background = "linear-gradient(90deg, #aa00ff, #550088)";
            modeBtn.style.borderColor = "#ff00ff";
            modeBtn.style.color = "#fff";
            modeBtn.textContent = "絶界 展開中";
        } else {
            modeBtn.className = this.isPhysMode ? "phys" : "ghost";
            modeBtn.style.background = "";
            modeBtn.style.borderColor = "";
            modeBtn.style.color = "";
            modeBtn.textContent = this.isPhysMode ? "モード: 顕現" : "モード: 幽体";
        }
    }

    updateHUD() {
        const els = this.game.els;
        els.hpText.textContent = Math.floor(this.hp);
        els.hpBar.style.width = (this.hp) + "%";
        els.hpBar.style.backgroundColor = this.hp < 30 ? "#f00" : "#0f0";

        els.spText.textContent = Math.floor(this.sp);
        els.spBar.style.width = (this.sp) + "%";
        if (this.game.mode.isAwakened) {
            els.spBar.style.backgroundColor = this.sp < 20 ? "#f00" : "#a0f";
        } else {
            els.spBar.style.backgroundColor = this.sp < 20 ? "#f00" : "#00bfff";
        }

        els.wVal.textContent = "WAVE " + this.game.gameState.wave;
        els.tVal.textContent = this.game.gameState.req > 0 ? this.game.gameState.req : "CLEAR!";
        els.bossLabel.style.display = (this.game.gameState.missionType === 'boss_eater') ? 'block' : 'none';

        if(this.drawCooldown > 0) {
            els.btnDraw.classList.add('disabled');
            els.jammingOverlay.style.opacity = 0.8;
        } else {
            els.btnDraw.classList.remove('disabled');
            els.jammingOverlay.style.opacity = 0;
        }
    }

    updateAimMarker() {
        if(!this.game.playerGroup || !this.game.aimMarker) return;

        this.game.camera.updateMatrixWorld(true);
        const _vecPos = new THREE.Vector3(); const _vecDir = new THREE.Vector3();
        this.game.camera.getWorldPosition(_vecPos);
        this.game.camera.getWorldDirection(_vecDir);

        if (this.isFocusing) { // Smart Aim
            this.game.focusLaser.visible = true;
            this.game.aimMarker.material.color.setHex(0xff0000);

            let targetPoint = null;
            let lockedEnemy = null;

            if (this.game.mode.isAwakened) {
                let maxDot = 0.9; // Cone of vision
                this.game.entities.enemies.forEach(e => {
                    const dirToE = e.mesh.position.clone().sub(_vecPos).normalize();
                    const dot = _vecDir.dot(dirToE);
                    if (dot > maxDot) { maxDot = dot; lockedEnemy = e; }
                });
                if (lockedEnemy) { targetPoint = lockedEnemy.mesh.position.clone(); this.game.aimMarker.position.copy(targetPoint); }
            }

            if (!targetPoint) {
                this.raycaster.set(_vecPos, _vecDir);
                const targets = this.game.entities.enemies.map(e => e.mesh);
                if (this.game.groundMesh) targets.push(this.game.groundMesh);

                const hits = this.raycaster.intersectObjects(targets, true);
                if (hits.length > 0) targetPoint = hits[0].point;
                else targetPoint = _vecPos.clone().add(_vecDir.clone().multiplyScalar(100));

                this.game.aimMarker.position.copy(targetPoint);
            }

            const positions = this.game.focusLaser.geometry.attributes.position.array;
            positions[0] = _vecPos.x; positions[1] = _vecPos.y - 0.2; positions[2] = _vecPos.z;
            positions[3] = this.game.aimMarker.position.x; positions[4] = this.game.aimMarker.position.y; positions[5] = this.game.aimMarker.position.z;
            this.game.focusLaser.geometry.attributes.position.needsUpdate = true;

            // Prioritize Kekkai near locked enemy
            let bestCandidate = null;
            if (lockedEnemy) {
                 const enemyBox = new THREE.Box3().setFromObject(lockedEnemy.mesh);
                 bestCandidate = this.game.entities.kekkai.find(k => {
                     const kBox = new THREE.Box3().setFromObject(k.mesh);
                     return kBox.intersectsBox(enemyBox);
                 });
                 if (!bestCandidate) {
                     let minD = 999;
                     this.game.entities.kekkai.forEach(k => {
                         const dist = k.mesh.position.distanceTo(lockedEnemy.mesh.position);
                         if (dist < 10 && dist < minD) { minD = dist; bestCandidate = k; }
                     });
                 }
            }

            if(!bestCandidate) {
                this.raycaster.set(_vecPos, _vecDir);
                const intersects = this.raycaster.intersectObjects(this.game.entities.kekkai.map(k => k.mesh));
                if (intersects.length > 0) bestCandidate = this.game.entities.kekkai.find(k => k.mesh === intersects[0].object);
            }

            if (this.game.currentTargetKekkai && this.game.currentTargetKekkai !== bestCandidate) {
                if(this.game.currentTargetKekkai.edges && this.game.currentTargetKekkai.edges.material) {
                    this.game.currentTargetKekkai.edges.material.color.setHex(0xffffff);
                    this.game.currentTargetKekkai.edges.material.linewidth = 1;
                }
            }
            this.game.currentTargetKekkai = bestCandidate;
            if (this.game.currentTargetKekkai) {
                if(this.game.currentTargetKekkai.edges && this.game.currentTargetKekkai.edges.material) {
                    this.game.currentTargetKekkai.edges.material.color.setHex(0xff00ff);
                    this.game.currentTargetKekkai.edges.material.linewidth = 5;
                }
            }

        } else {
            // Standard Aim
            this.game.focusLaser.visible = false;
            this.game.aimMarker.material.color.setHex(this.config.colors ? this.config.colors.marker : 0xff0000);

            this.game.aimMarker.position.copy(_vecPos).add(_vecDir.clone().multiplyScalar(this.currentDist));
            this.game.aimMarker.rotation.y = Math.atan2(_vecDir.x, _vecDir.z);

            let bestCandidate = null;
            this.raycaster.set(_vecPos, _vecDir);
            const intersects = this.raycaster.intersectObjects(this.game.entities.kekkai.map(k => k.mesh));
            if (intersects.length > 0) bestCandidate = this.game.entities.kekkai.find(k => k.mesh === intersects[0].object);

            if(!bestCandidate) {
                let minD = 999;
                this.game.entities.kekkai.forEach(k => {
                    const kPos = k.mesh.position;
                    const vecToK = kPos.clone().sub(_vecPos);
                    const t = vecToK.dot(_vecDir);
                    if (t > 0 && t < this.game.mode.config.dist.max + 20) {
                        const closestPoint = _vecPos.clone().add(_vecDir.clone().multiplyScalar(t));
                        const dist = kPos.distanceTo(closestPoint);
                        const size = Math.max(k.mesh.scale.x, k.mesh.scale.y, k.mesh.scale.z);
                        if (dist < this.game.mode.config.aimAssist.baseRadius + (size * 0.5)) {
                            if(dist < minD){ minD = dist; bestCandidate = k; }
                        }
                    }
                });
            }

            if (this.game.currentTargetKekkai && this.game.currentTargetKekkai !== bestCandidate) {
                if(this.game.currentTargetKekkai.edges && this.game.currentTargetKekkai.edges.material) {
                    this.game.currentTargetKekkai.edges.material.color.setHex(0xffffff);
                    this.game.currentTargetKekkai.edges.material.linewidth = 1;
                }
            }
            this.game.currentTargetKekkai = bestCandidate;
            if (this.game.currentTargetKekkai) {
                if(this.game.currentTargetKekkai.edges && this.game.currentTargetKekkai.edges.material) {
                    this.game.currentTargetKekkai.edges.material.color.setHex(this.game.mode.config.colors.highlight);
                    this.game.currentTargetKekkai.edges.material.linewidth = 3;
                }
            }
        }
    }

    setupVRControllers() {
        const mf = new XRControllerModelFactory();
        for(let i=0; i<2; i++){
            const c = this.game.renderer.xr.getController(i);
            this.game.playerGroup.add(c);
            this.controllers.push(c);

            const g = this.game.renderer.xr.getControllerGrip(i);
            g.add(mf.createControllerModel(g));
            this.game.playerGroup.add(g);
            this.controllerGrips.push(g);
        }
    }
}
