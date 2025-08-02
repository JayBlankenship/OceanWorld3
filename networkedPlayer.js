import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { createPlayerPawn } from './playerPawn.js';

export class NetworkedPlayer {
    constructor(peerId, scene) {
        this.peerId = peerId;
        this.scene = scene;
        
        // Create a visual representation using bright red color for networked players
        this.pawn = createPlayerPawn(false, 0xFF0000); // false = not AI, red color
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
        
        console.log(`[NetworkedPlayer] Created RED networked player for peer: ${peerId} at position:`, this.pawn.position);
        console.log(`[NetworkedPlayer] Player ${peerId} should be visible as RED in the scene`);
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
        
        console.log(`[NetworkedPlayer] Updated RED player ${this.peerId} position to:`, this.pawn.position);
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
            console.log(`[NetworkedPlayer] Removed networked player: ${this.peerId}`);
        }
    }
    
    // Get the current position for distance calculations, etc.
    getPosition() {
        return this.pawn.position.clone();
    }
}

// NetworkedPlayerManager - manages all remote players
export class NetworkedPlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.networkedPlayers = new Map(); // Map<peerId, NetworkedPlayer>
        
        console.log('[NetworkedPlayerManager] Initialized');
    }
    
    // Add a new networked player
    addPlayer(peerId) {
        if (this.networkedPlayers.has(peerId)) {
            console.warn(`[NetworkedPlayerManager] Player ${peerId} already exists`);
            return;
        }
        
        const networkedPlayer = new NetworkedPlayer(peerId, this.scene);
        this.networkedPlayers.set(peerId, networkedPlayer);
        
        console.log(`[NetworkedPlayerManager] Added player: ${peerId}`);
    }
    
    // Remove a networked player
    removePlayer(peerId) {
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.destroy();
            this.networkedPlayers.delete(peerId);
            console.log(`[NetworkedPlayerManager] Removed player: ${peerId}`);
        }
    }
    
    // Update a player's state from network data
    updatePlayer(peerId, state) {
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.updateFromNetwork(state);
        } else {
            console.warn(`[NetworkedPlayerManager] Received update for unknown player: ${peerId}`);
        }
    }
    
    // Update all networked players (called each frame)
    update(deltaTime, animationTime) {
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            networkedPlayer.update(deltaTime, animationTime);
        }
    }
    
    // Get all networked player positions (for terrain generation, etc.)
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
        console.log('[NetworkedPlayerManager] Cleared all networked players');
    }
}
