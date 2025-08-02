// UnifiedTerrain.js - Single dynamic mesh for seamless terrain
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class UnifiedTerrain {
    constructor(scene, size = 400, resolution = 64) {
        this.scene = scene;
        this.size = size; // Total terrain size (e.g., 400x400 units)
        this.resolution = resolution; // Grid resolution (e.g., 64x64 vertices)
        this.cellSize = this.size / this.resolution;
        
        // Animation variables
        this.wavePhase = 0;
        this.waveSpeed = 0.8;
        this.waveAmp = 0.15;
        this.waveFreq = 0.4;
        
        // Storm system
        this.stormIntensity = 0;
        this.storms = [];
        
        // Infinite terrain generation system
        this.terrainChunks = new Map(); // Store terrain chunks by key "x,z"
        this.chunkSize = 200; // Size of each terrain chunk
        this.chunkResolution = 32; // Resolution per chunk
        this.renderDistance = 800; // How far to generate chunks
        
        // Ocean surface
        this.oceanSurface = null;
        
        // Ocean surface disabled - removed for cleaner terrain view
        // this.createOceanSurface();
    }
    
    createOceanSurface() {
        // Create a very large stationary ocean surface
        const surfaceSize = 4000; // Much larger than render distance
        const surfaceGeometry = new THREE.PlaneGeometry(surfaceSize, surfaceSize, 128, 128);
        
        // Create cartoon water material with magical sparkles
        const surfaceMaterial = new THREE.MeshLambertMaterial({
            color: 0x0099ff, // Brighter cartoon blue
            transparent: true,
            opacity: 0.6, // More transparent for magical effect
            side: THREE.DoubleSide,
            wireframe: false,
            // Enhanced cartoon water surface with sparkles
            emissive: 0x003366, // Magical blue-green glow
            emissiveIntensity: 0.18, // Higher intensity for sparkles
            shininess: 140 // Very sparkly surface
        });
        
        this.oceanSurface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
        this.oceanSurface.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.oceanSurface.position.y = -2.3; // Position just above the terrain base (terrain base is at -2.5 + rocky height variations)
        this.oceanSurface.position.x = 0; // Fixed position
        this.oceanSurface.position.z = 0; // Fixed position
        this.scene.add(this.oceanSurface);
        
        // Store original surface vertices for animation
        this.originalSurfaceVertices = [];
        const surfacePositions = this.oceanSurface.geometry.attributes.position.array;
        for (let i = 0; i < surfacePositions.length; i += 3) {
            this.originalSurfaceVertices.push({
                x: surfacePositions[i],
                y: surfacePositions[i + 1],
                z: surfacePositions[i + 2]
            });
        }
    }
    
    createTerrainChunk(chunkX, chunkZ) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        const colors = [];
        
        // Calculate world position of this chunk
        const worldOffsetX = chunkX * this.chunkSize;
        const worldOffsetZ = chunkZ * this.chunkSize;
        
        // Generate vertices for this chunk
        for (let z = 0; z <= this.chunkResolution; z++) {
            for (let x = 0; x <= this.chunkResolution; x++) {
                // World position
                const px = worldOffsetX + (x / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;
                const pz = worldOffsetZ + (z / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;
                
                // Generate terrain height using noise
                const height = this.generateTerrainHeight(px, pz);
                
                vertices.push(px, height, pz);
                
                // Generate color based on height for depth visualization
                const normalizedHeight = (height + 6) / 12;
                const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
                
                let r, g, b;
                if (clampedHeight < 0.25) {
                    const t = clampedHeight * 4;
                    r = 0;
                    g = t * 0.3;
                    b = 0.4 + t * 0.6;
                } else if (clampedHeight < 0.5) {
                    const t = (clampedHeight - 0.25) * 4;
                    r = 0;
                    g = 0.3 + t * 0.7;
                    b = 1.0 - t * 0.5;
                } else if (clampedHeight < 0.75) {
                    const t = (clampedHeight - 0.5) * 4;
                    r = t * 0.8;
                    g = 1.0;
                    b = 0.5 - t * 0.5;
                } else {
                    const t = (clampedHeight - 0.75) * 4;
                    r = 0.8 + t * 0.2;
                    g = 1.0 - t * 0.5;
                    b = 0;
                }
                
                colors.push(r, g, b);
            }
        }
        
        // Generate indices
        for (let z = 0; z < this.chunkResolution; z++) {
            for (let x = 0; x < this.chunkResolution; x++) {
                const i0 = z * (this.chunkResolution + 1) + x;
                const i1 = z * (this.chunkResolution + 1) + (x + 1);
                const i2 = (z + 1) * (this.chunkResolution + 1) + x;
                const i3 = (z + 1) * (this.chunkResolution + 1) + (x + 1);
                
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.75, // Slightly more transparent for consistency
            side: THREE.DoubleSide,
            wireframe: false,
            // Enhanced cartoon underwater terrain with sparkles
            emissive: 0x001144, // Magical underwater glow
            emissiveIntensity: 0.12, // Sparkly underwater effect
            shininess: 80 // Moderate cartoon reflectivity
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = -2.5;
        this.scene.add(mesh);
        
        return {
            mesh: mesh,
            chunkX: chunkX,
            chunkZ: chunkZ,
            originalHeights: vertices.filter((_, index) => index % 3 === 1)
        };
    }
    
    generateTerrainHeight(x, z) {
        // Multi-scale noise for realistic terrain
        let height = 0;
        
        // Large scale features (hills and valleys)
        height += Math.sin(x * 0.01) * Math.cos(z * 0.01) * 3.0;
        height += Math.sin(x * 0.015 + z * 0.01) * 2.0;
        
        // Medium scale rocky features
        height += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.5;
        height += Math.cos(x * 0.025 + z * 0.035) * 1.2;
        
        // Small scale surface detail
        height += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.6;
        height += Math.sin(x * 0.05 + z * 0.07) * 0.8;
        
        // Smooth the result
        return height;
    }
    
    storeOriginalHeights() {
        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
            this.originalHeights.push(positions[i]);
        }
    }
    
    update(deltaTime, playerPosition, storms = []) {
        this.wavePhase += deltaTime * this.waveSpeed;
        this.storms = storms;
        
        // Generate terrain chunks around player
        this.updateTerrainChunks(playerPosition);
        
        // Animate all terrain chunks
        this.animateTerrainChunks();
        
        // Ocean surface animation disabled
        // this.animateOceanSurface(deltaTime);
    }
    
    updateTerrainChunks(playerPosition) {
        // Calculate which chunks should exist around the player
        const playerChunkX = Math.floor(playerPosition.x / this.chunkSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.chunkSize);
        const chunkRadius = Math.ceil(this.renderDistance / this.chunkSize);
        
        // Track which chunks should exist
        const requiredChunks = new Set();
        
        for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
            for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const distance = Math.sqrt(dx * dx + dz * dz) * this.chunkSize;
                
                if (distance <= this.renderDistance) {
                    const chunkKey = `${chunkX},${chunkZ}`;
                    requiredChunks.add(chunkKey);
                    
                    // Create chunk if it doesn't exist
                    if (!this.terrainChunks.has(chunkKey)) {
                        const chunk = this.createTerrainChunk(chunkX, chunkZ);
                        this.terrainChunks.set(chunkKey, chunk);
                    }
                }
            }
        }
        
        // Remove chunks that are too far away
        const chunksToRemove = [];
        for (const [chunkKey, chunk] of this.terrainChunks) {
            if (!requiredChunks.has(chunkKey)) {
                chunksToRemove.push(chunkKey);
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
                chunk.mesh.material.dispose();
            }
        }
        
        for (const chunkKey of chunksToRemove) {
            this.terrainChunks.delete(chunkKey);
        }
    }
    
    animateTerrainChunks() {
        for (const [chunkKey, chunk] of this.terrainChunks) {
            const positions = chunk.mesh.geometry.attributes.position;
            const colors = chunk.mesh.geometry.attributes.color;
            const posArray = positions.array;
            const colorArray = colors.array;
            
            for (let i = 0; i < chunk.originalHeights.length; i++) {
                const vertexIndex = i * 3 + 1; // Y coordinate
                const colorIndex = i * 3; // Color index
                const x = posArray[i * 3]; // X coordinate
                const z = posArray[i * 3 + 2]; // Z coordinate
                
                // Get original height
                const baseHeight = chunk.originalHeights[i];
                
                // Calculate storm intensity at this position
                let stormIntensity = 0;
                for (const storm of this.storms) {
                    const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
                    if (dist < storm.radius) {
                        const intensity = (1 - dist / storm.radius) * storm.amp;
                        stormIntensity = Math.max(stormIntensity, intensity);
                    }
                }
                
                // Animate waves
                let waveHeight = 0;
                waveHeight += Math.sin(x * this.waveFreq + z * this.waveFreq + this.wavePhase) * this.waveAmp;
                waveHeight += Math.cos(x * this.waveFreq * 1.3 + this.wavePhase * 1.2) * this.waveAmp * 0.6;
                
                // Storm effects
                if (stormIntensity > 0) {
                    const stormAmp = this.waveAmp * stormIntensity * 3.0;
                    const stormFreq = this.waveFreq * (1.0 + stormIntensity);
                    const stormPhase = this.wavePhase * (1.0 + stormIntensity * 0.7);
                    
                    waveHeight += Math.sin(x * stormFreq + stormPhase) * stormAmp * 0.5;
                    waveHeight += Math.cos(z * stormFreq * 1.4 + stormPhase * 1.8) * stormAmp * 0.3;
                    
                    if (stormIntensity > 1.5) {
                        waveHeight += (Math.random() - 0.5) * stormAmp * 0.4;
                    }
                }
                
                // Apply final height
                const finalHeight = baseHeight + waveHeight;
                posArray[vertexIndex] = finalHeight;
                
                // Update color based on height
                const normalizedHeight = (finalHeight + 6) / 12;
                const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
                
                let r, g, b;
                if (clampedHeight < 0.25) {
                    const t = clampedHeight * 4;
                    r = 0; g = t * 0.3; b = 0.4 + t * 0.6;
                } else if (clampedHeight < 0.5) {
                    const t = (clampedHeight - 0.25) * 4;
                    r = 0; g = 0.3 + t * 0.7; b = 1.0 - t * 0.5;
                } else if (clampedHeight < 0.75) {
                    const t = (clampedHeight - 0.5) * 4;
                    r = t * 0.8; g = 1.0; b = 0.5 - t * 0.5;
                } else {
                    const t = (clampedHeight - 0.75) * 4;
                    r = 0.8 + t * 0.2; g = 1.0 - t * 0.5; b = 0;
                }
                
                // Storm color effects
                if (stormIntensity > 0) {
                    const stormTint = stormIntensity * 0.3;
                    r = Math.min(1.0, r + stormTint);
                    g = Math.max(0, g - stormTint * 0.5);
                }
                
                colorArray[colorIndex] = r;
                colorArray[colorIndex + 1] = g;
                colorArray[colorIndex + 2] = b;
            }
            
            positions.needsUpdate = true;
            colors.needsUpdate = true;
            chunk.mesh.geometry.computeVertexNormals();
        }
    }
    
    animateTerrain() {
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        const posArray = positions.array;
        const colorArray = colors.array;
        
        for (let i = 0; i < this.originalHeights.length; i++) {
            const vertexIndex = i * 3 + 1; // Y coordinate
            const colorIndex = i * 3; // Color index (RGB)
            const x = posArray[i * 3]; // X coordinate
            const z = posArray[i * 3 + 2]; // Z coordinate
            
            // Get original height
            const baseHeight = this.originalHeights[i];
            
            // Calculate storm intensity at this position
            let stormIntensity = 0;
            for (const storm of this.storms) {
                const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
                if (dist < storm.radius) {
                    const intensity = (1 - dist / storm.radius) * storm.amp;
                    stormIntensity = Math.max(stormIntensity, intensity);
                }
            }
            
            // Animate waves on top of base terrain
            let waveHeight = 0;
            
            // Base wave animation
            waveHeight += Math.sin(x * this.waveFreq + z * this.waveFreq + this.wavePhase) * this.waveAmp;
            waveHeight += Math.cos(x * this.waveFreq * 1.3 + this.wavePhase * 1.2) * this.waveAmp * 0.6;
            
            // Storm effects
            if (stormIntensity > 0) {
                const stormAmp = this.waveAmp * stormIntensity * 3.0;
                const stormFreq = this.waveFreq * (1.0 + stormIntensity);
                const stormPhase = this.wavePhase * (1.0 + stormIntensity * 0.7);
                
                waveHeight += Math.sin(x * stormFreq + stormPhase) * stormAmp * 0.5;
                waveHeight += Math.cos(z * stormFreq * 1.4 + stormPhase * 1.8) * stormAmp * 0.3;
                waveHeight += Math.sin((x + z) * stormFreq * 0.8 + stormPhase * 2.2) * stormAmp * 0.2;
                
                // Chaotic movement during severe storms
                if (stormIntensity > 1.5) {
                    waveHeight += (Math.random() - 0.5) * stormAmp * 0.4;
                }
            }
            
            // Apply final height
            const finalHeight = baseHeight + waveHeight;
            posArray[vertexIndex] = finalHeight;
            
            // Update color based on new height for dynamic depth visualization
            const normalizedHeight = (finalHeight + 6) / 12; // Normalize height range (-6 to 6) to (0 to 1)
            const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
            
            // Color gradient: deep blue -> green -> yellow -> red
            let r, g, b;
            if (clampedHeight < 0.25) {
                // Deep areas: dark blue to blue
                const t = clampedHeight * 4;
                r = 0;
                g = t * 0.3;
                b = 0.4 + t * 0.6;
            } else if (clampedHeight < 0.5) {
                // Mid-deep areas: blue to cyan/green
                const t = (clampedHeight - 0.25) * 4;
                r = 0;
                g = 0.3 + t * 0.7;
                b = 1.0 - t * 0.5;
            } else if (clampedHeight < 0.75) {
                // Mid areas: green to yellow
                const t = (clampedHeight - 0.5) * 4;
                r = t * 0.8;
                g = 1.0;
                b = 0.5 - t * 0.5;
            } else {
                // High areas: yellow to red
                const t = (clampedHeight - 0.75) * 4;
                r = 0.8 + t * 0.2;
                g = 1.0 - t * 0.5;
                b = 0;
            }
            
            // Add storm color effects
            if (stormIntensity > 0) {
                const stormTint = stormIntensity * 0.3;
                r = Math.min(1.0, r + stormTint); // Add red tint during storms
                g = Math.max(0, g - stormTint * 0.5); // Reduce green
            }
            
            colorArray[colorIndex] = r;
            colorArray[colorIndex + 1] = g;
            colorArray[colorIndex + 2] = b;
        }
        
        positions.needsUpdate = true;
        colors.needsUpdate = true; // Update colors
        this.mesh.geometry.computeVertexNormals();
    }
    
    animateOceanSurface(deltaTime) {
        if (!this.oceanSurface) return;
        
        const positions = this.oceanSurface.geometry.attributes.position;
        const posArray = positions.array;
        
        // Calculate storm effects on surface
        let avgStormIntensity = 0;
        for (const storm of this.storms) {
            avgStormIntensity += storm.intensity || storm.amp || 1.0;
        }
        avgStormIntensity = Math.min(avgStormIntensity / Math.max(this.storms.length, 1), 2.0);
        
        // Animate each vertex of the ocean surface to match terrain wave patterns
        for (let i = 0; i < this.originalSurfaceVertices.length; i++) {
            const vertex = this.originalSurfaceVertices[i];
            const arrayIndex = i * 3;
            
            // Use absolute world position (no offset since surface is stationary)
            const worldX = vertex.x;
            const worldZ = vertex.z;
            
            // Match terrain wave patterns but offset upward to ocean surface level
            let waveHeight = 0;
            
            // Base wave animation matching terrain chunks
            const waveAmp = this.waveAmp;
            const waveFreq = this.waveFreq;
            const wavePhase = this.wavePhase;
            
            // Primary wave motion (same as terrain)
            waveHeight += Math.sin(worldX * waveFreq + worldZ * waveFreq + wavePhase) * waveAmp;
            
            // Secondary wave layers for ocean depth
            waveHeight += Math.sin(worldX * waveFreq * 1.3 + wavePhase * 1.7) * waveAmp * 0.4;
            waveHeight += Math.cos(worldZ * waveFreq * 1.1 + wavePhase * 1.2) * waveAmp * 0.25;
            
            // Storm effects matching terrain storm animation
            if (avgStormIntensity > 0) {
                const stormAmp = waveAmp * avgStormIntensity * 2.5;
                const stormFreq = waveFreq * (1.0 + avgStormIntensity);
                const stormPhase = wavePhase * (1.0 + avgStormIntensity * 0.5);
                
                // Multiple overlapping storm waves (matching terrain)
                waveHeight += Math.sin(worldX * stormFreq + stormPhase) * stormAmp * 0.4;
                waveHeight += Math.cos(worldZ * stormFreq * 1.3 + stormPhase * 1.7) * stormAmp * 0.25;
                waveHeight += Math.sin((worldX + worldZ) * stormFreq * 0.7 + stormPhase * 2.1) * stormAmp * 0.15;
                
                // Chaotic surface during severe storms
                if (avgStormIntensity > 1.0) {
                    const chaosAmp = (avgStormIntensity - 1.0) * waveAmp * 1.5;
                    waveHeight += (Math.random() - 0.5) * chaosAmp;
                }
            }
            
            // Apply wave height (Y is up for the rotated plane)
            posArray[arrayIndex + 1] = vertex.y + waveHeight;
        }
        
        positions.needsUpdate = true;
        this.oceanSurface.geometry.computeVertexNormals();
        
        // Update surface material opacity based on storms
        if (avgStormIntensity > 0) {
            const stormOpacity = 0.6 + avgStormIntensity * 0.15; // Slightly more transparent
            this.oceanSurface.material.opacity = Math.min(stormOpacity, 0.75);
            
            // Add slight color shift during storms
            const stormTint = avgStormIntensity * 0.3;
            this.oceanSurface.material.color.setRGB(
                stormTint * 0.5, 
                0.67 - stormTint * 0.2, 
                1.0 - stormTint * 0.1
            );
        } else {
            this.oceanSurface.material.opacity = 0.6; // More transparent for consistency
            this.oceanSurface.material.color.setRGB(0, 0.67, 1.0); // Reset to light blue
        }
    }
    
    getStormIntensityAtPosition(x, z) {
        let maxIntensity = 0;
        for (const storm of this.storms) {
            const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
            if (dist < storm.radius) {
                const intensity = (1 - dist / storm.radius) * storm.amp;
                maxIntensity = Math.max(maxIntensity, intensity);
            }
        }
        return maxIntensity;
    }
    
    remove() {
        // Remove all terrain chunks
        for (const [chunkKey, chunk] of this.terrainChunks) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh.material.dispose();
        }
        this.terrainChunks.clear();
        
        // Remove ocean surface
        if (this.oceanSurface) {
            this.scene.remove(this.oceanSurface);
            this.oceanSurface.geometry.dispose();
            this.oceanSurface.material.dispose();
        }
    }
}
