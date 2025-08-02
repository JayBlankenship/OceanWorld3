import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/GLTFLoader.js';

export class NetworkedPlayer {
    constructor(peerId, scene) {
        this.peerId = peerId;
        this.scene = scene;
        
        console.log(`[NetworkedPlayer] About to create ship for peer: ${peerId}`);
        
        // Create the player group that will hold the ship
        this.pawn = new THREE.Group();
        this.pawn.position.set(0, 20, 0); // Start at water level
        
        // Load Ship1.glb for networked players - same as everyone else
        const loader = new GLTFLoader();
        loader.load(
            './Ship1.glb',
            (gltf) => {
                console.log(`[NetworkedPlayer] Ship1.glb loaded successfully for peer: ${peerId}`);
                const shipModel = gltf.scene;
                
                // Configure the ship
                shipModel.scale.setScalar(1.0);
                shipModel.position.y = 0;
                
                // Apply RED color tint to ship materials
                shipModel.traverse((child) => {
                    if (child.isMesh && child.material) {
                        // Clone material to avoid affecting other instances
                        child.material = child.material.clone();
                        
                        // Apply red color tint
                        const redColor = new THREE.Color(0xFF0000);
                        if (child.material.color) {
                            child.material.color.lerp(redColor, 0.3); // 30% red tint
                        }
                        
                        // Add red emissive glow for visibility
                        if (child.material.emissive) {
                            child.material.emissive.copy(redColor);
                            child.material.emissiveIntensity = 0.15;
                        }
                    }
                });
                
                this.pawn.add(shipModel);
                this.pawn.shipModel = shipModel; // Store reference for animations
                
                console.log(`[NetworkedPlayer] RED Ship1.glb added to scene for peer: ${peerId}`);
            },
            (progress) => {
                console.log(`[NetworkedPlayer] Loading Ship1.glb progress for ${peerId}:`, (progress.loaded / progress.total) * 100 + '%');
            },
            (error) => {
                console.error(`[NetworkedPlayer] Error loading Ship1.glb for peer ${peerId}:`, error);
                
                // Fallback: create a simple red ship if GLTF fails
                const fallbackGeometry = new THREE.BoxGeometry(3, 1, 6);
                const fallbackMaterial = new THREE.MeshLambertMaterial({ 
                    color: 0xFF0000,
                    emissive: 0x440000,
                    emissiveIntensity: 0.2
                });
                const fallbackShip = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
                fallbackShip.position.y = 0;
                this.pawn.add(fallbackShip);
                this.pawn.shipModel = fallbackShip;
                
                console.log(`[NetworkedPlayer] Fallback ship created for peer: ${peerId}`);
            }
        );
        
        this.scene.add(this.pawn);
        
        // Network interpolation variables
        this.targetPosition = new THREE.Vector3();
        this.targetRotation = new THREE.Euler();
        this.lastUpdateTime = Date.now();
        this.interpolationSpeed = 10; // How fast to interpolate to target position
        
        // Store the last known state
        this.lastKnownState = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            timestamp: Date.now()
        };
        
        console.log(`[NetworkedPlayer] Created RED networked ship for peer: ${peerId} at position:`, this.pawn.position);
        console.log(`[NetworkedPlayer] Player ${peerId} should be visible as RED ship in the scene`);
    }
    
    // Update the player's state from network data
    updateFromNetwork(state) {
        if (!state || !state.position) return;
        
        // Update target position and rotation for smooth interpolation
        this.targetPosition.set(state.position.x, state.position.y, state.position.z);
        
        if (state.rotation) {
            this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
        }
        
        this.lastUpdateTime = Date.now();
        this.lastKnownState = { ...state };
        
        // For now, immediately set position (we can add interpolation later)
        this.pawn.position.copy(this.targetPosition);
        
        if (state.rotation) {
            this.pawn.rotation.copy(this.targetRotation);
        }
        
        // Update surge state if available
        if (typeof state.surgeActive !== 'undefined' && this.pawn.setSurge) {
            this.pawn.setSurge(state.surgeActive);
        }
        
        console.log(`[NetworkedPlayer] Updated RED ship ${this.peerId} position to:`, this.pawn.position);
    }
    
    // Update the networked player (called each frame)
    update(deltaTime, animationTime) {
        // Smoothly interpolate to target position
        const timeSinceUpdate = Date.now() - this.lastUpdateTime;
        
        // If we haven't received an update in a while, don't interpolate too much
        if (timeSinceUpdate < 1000) { // 1 second timeout
            this.pawn.position.lerp(this.targetPosition, deltaTime * this.interpolationSpeed);
            
            // Slerp rotation for smooth rotation interpolation
            const currentQuat = new THREE.Quaternion().setFromEuler(this.pawn.rotation);
            const targetQuat = new THREE.Quaternion().setFromEuler(this.targetRotation);
            currentQuat.slerp(targetQuat, deltaTime * this.interpolationSpeed);
            this.pawn.rotation.setFromQuaternion(currentQuat);
        }
        
        // Update the pawn animations
        if (this.pawn.update) {
            this.pawn.update(deltaTime, animationTime);
        }
    }
    
    // Remove the networked player from the scene
    destroy() {
        if (this.pawn && this.scene) {
            this.scene.remove(this.pawn);
            console.log(`[NetworkedPlayer] Removed networked ship: ${this.peerId}`);
        }
    }
    
    // Get the current position for distance calculations, etc.
    getPosition() {
        return this.pawn.position.clone();
    }
}

// NetworkedPlayerManager - manages all remote player ships
export class NetworkedPlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.networkedPlayers = new Map(); // Map<peerId, NetworkedPlayer>
        
        console.log('[NetworkedPlayerManager] Initialized');
    }
    
    // Add a new networked player ship
    addPlayer(peerId) {
        if (this.networkedPlayers.has(peerId)) {
            console.warn(`[NetworkedPlayerManager] Player ${peerId} already exists`);
            return;
        }
        
        const networkedPlayer = new NetworkedPlayer(peerId, this.scene);
        this.networkedPlayers.set(peerId, networkedPlayer);
        
        console.log(`[NetworkedPlayerManager] Added ship: ${peerId}`);
    }
    
    // Remove a networked player
    removePlayer(peerId) {
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.destroy();
            this.networkedPlayers.delete(peerId);
            console.log(`[NetworkedPlayerManager] Removed ship: ${peerId}`);
        }
    }
    
    // Update a player's state from network data
    updatePlayer(peerId, state) {
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.updateFromNetwork(state);
        } else {
            console.warn(`[NetworkedPlayerManager] Received update for unknown ship: ${peerId}`);
        }
    }
    
    // Update all networked player ships (called each frame)
    update(deltaTime, animationTime) {
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            networkedPlayer.update(deltaTime, animationTime);
        }
    }
    
    // Get all networked player ship positions (for terrain generation, etc.)
    getAllPositions() {
        const positions = [];
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            positions.push(networkedPlayer.getPosition());
        }
        return positions;
    }
    
    // Clear all networked players
    clear() {
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            networkedPlayer.destroy();
        }
        this.networkedPlayers.clear();
        console.log('[NetworkedPlayerManager] Cleared all networked ships');
    }
}
