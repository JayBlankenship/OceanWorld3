// TerrainGenerator.js - Updated to use unified terrain system
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { UnifiedTerrain } from './unifiedTerrain.js';

export class TerrainGenerator {
    constructor(scene, planeSize, planeGeometry, planeMaterial) {
        this.scene = scene;
        
        // Create unified terrain system
        this.unifiedTerrain = new UnifiedTerrain(scene, 800, 128); // 800x800 units, 128x128 resolution
        
        // Bad Storm System for terrain effects
        this.stormSystem = {
            storms: [], // Array of active terrain storms
            timer: 0,
            stormSpawnChance: 0.03, // Low chance per second to spawn storm
            maxStorms: 3,
            stormLifetime: 60 // Storm lasts 60 seconds
        };
        
        // For networking compatibility
        this.newPlanes = new Set();
        this.removedPlanes = new Set();
    }

    // Simplified terrain generation using unified terrain
    generateNeighboringPlanes(entityPosition) {
        // Update unified terrain position and animation
        this.unifiedTerrain.update(window.deltaTime || 0.016, entityPosition, this.stormSystem.storms);
        
        // For networking compatibility, clear tracking sets
        this.newPlanes.clear();
        this.removedPlanes.clear();
    }

    // Update the storm system
    updateStormSystem(deltaTime, playerPosition) {
        this.stormSystem.timer += deltaTime;
        
        // Try to spawn new storms
        if (Math.random() < deltaTime * this.stormSystem.stormSpawnChance && 
            this.stormSystem.storms.length < this.stormSystem.maxStorms) {
            
            // Spawn storm at random location around player
            const angle = Math.random() * Math.PI * 2;
            const distance = 400 + Math.random() * 600; // 400-1000 units from player (doubled)
            
            const storm = {
                id: Math.random().toString(36).substr(2, 9),
                x: playerPosition.x + Math.cos(angle) * distance,
                z: playerPosition.z + Math.sin(angle) * distance,
                intensity: 0.5 + Math.random() * 1.0, // Storm intensity 0.5-1.5
                radius: 200 + Math.random() * 300, // Storm radius 200-500 (doubled)
                age: 0,
                maxAge: this.stormSystem.stormLifetime,
                rotationSpeed: (Math.random() - 0.5) * 2.0, // Random rotation
                pulsePhase: Math.random() * Math.PI * 2,
                amp: 1.0 + Math.random() * 2.0 // Storm wave amplitude
            };
            
            this.stormSystem.storms.push(storm);
            console.log(`[TerrainGenerator] Spawned bad storm at (${storm.x.toFixed(1)}, ${storm.z.toFixed(1)}) with intensity ${storm.intensity.toFixed(2)}`);
        }
        
        // Update existing storms
        this.stormSystem.storms.forEach(storm => {
            storm.age += deltaTime;
            storm.pulsePhase += deltaTime * 3.0; // Fast pulsing for dramatic effect
            
            // Storms slowly drift toward player for more dynamic gameplay
            const dx = playerPosition.x - storm.x;
            const dz = playerPosition.z - storm.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 100) { // Doubled from 50
                const driftSpeed = 2.0; // Slow drift toward player
                storm.x += (dx / distance) * driftSpeed * deltaTime;
                storm.z += (dz / distance) * driftSpeed * deltaTime;
            }
        });
        
        // Remove expired storms
        this.stormSystem.storms = this.stormSystem.storms.filter(storm => storm.age < storm.maxAge);
    }

    // Get storm intensity at a given world position
    getStormIntensityAtPosition(x, z) {
        return this.unifiedTerrain.getStormIntensityAtPosition(x, z);
    }

    // Remove distant planes (disabled: unified terrain doesn't need this)
    removeDistantPlanes(playerPosition, aiPlayers) {
        // Not needed with unified terrain
    }

    // Get terrain changes since last frame (for networking compatibility)
    getTerrainChanges() {
        const changes = {
            newPlanes: [],
            removedPlanes: []
        };
        
        // Clear the change tracking sets
        this.newPlanes.clear();
        this.removedPlanes.clear();
        
        return changes;
    }

    // Apply terrain changes from network (for networking compatibility)
    applyTerrainChanges(changes) {
        // Not needed with unified terrain, but kept for compatibility
    }
}