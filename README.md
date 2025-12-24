# True Kekkai VR - Dual Modes

This project is a 3D Action Game inspired by "Kekkaishi", featuring two distinct game modes.

## Modes

### 1. Standard Mode (Original)
- **Concept:** A sensitivity-tuned experience focusing on the original gameplay mechanics.
- **Controls:** Standard movement and barrier creation.
- **Goal:** Clear waves of enemies and complete missions.

### 2. Awakened Mode (New!)
- **Concept:** The "Best Kekkai Experience" with overpowered abilities.
- **Features:**
  - **Zekkai (Absolute Boundary):** A defensive aura that destroys enemies on contact. (Mobile: Purple Button / VR: X Button).
  - **Chain Metsu:** Destroying one barrier triggers a chain reaction, detonating nearby barriers.
  - **Enhanced Mobility:** Triple jump and faster movement speed.
  - **Smart Aim:** Aggressive auto-targeting for easier trapping of fast enemies.
- **Visuals:** Dark Violet Night theme.

## Controls

### Mobile / Touch
- **Left Stick:** Move
- **Right Pad:**
  - **Up:** Change Distance (Close/Mid/Far) / Focus Mode (Hold)
  - **Left:** Metsu (Destroy) / Kai (Release)
  - **Right:** Ketsu (Create Barrier) - Hold to draw
  - **Down:** Jump
  - **Center Purple (Awakened only):** Toggle Zekkai
- **Mode Switch (Top Right):** Toggle between "Ghost Mode" (Ghost Barriers) and "Physical Mode" (Physical Barriers).

### VR (WebXR)
- **Left Controller:**
  - **Stick:** Move
  - **Trigger:** Kai (Release)
  - **Grip:** Draw Physical Barrier (Yellow)
  - **X Button:** Toggle Zekkai (Awakened only)
- **Right Controller:**
  - **Stick:** Turn
  - **Trigger:** Metsu (Destroy)
  - **Grip:** Draw Ghost Barrier (Blue)
  - **A Button:** Jump
  - **B Button:** Adjust Distance

## Development
- **Engine:** Three.js + Cannon-es
- **Structure:**
  - `src/main.js`: Entry point & UI
  - `src/game.js`: Core Game Loop & Engine
  - `src/modes/`: Game Mode Logic
  - `src/entities/`: Player & Game Objects

## Credits
Based on the original "True Kekkai VR".
